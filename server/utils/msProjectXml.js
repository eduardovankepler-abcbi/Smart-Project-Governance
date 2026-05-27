const { XMLParser } = require("fast-xml-parser");
const { deriveTaskStatus, deriveProjectStatus, TASK_STATUSES } = require("./statusRules");
const { normalizeMaxUnits } = require("./resourceCapacity");

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function toMmDdYy(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function parseDurationMinutes(value) {
  if (!value || typeof value !== "string") return 0;
  const match = value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return (days * 8 * 60) + (hours * 60) + minutes;
}

function parseRate(value) {
  if (!value || typeof value !== "string") return 0;
  const num = parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isNaN(num) ? 0 : num;
}

function normalizeDependencyType(type) {
  const map = { "0": "FF", "1": "FS", "2": "SF", "3": "SS" };
  return map[String(type)] || "FS";
}

function normalizeTaskType(type) {
  const map = { "0": "fixed_units", "1": "fixed_duration", "2": "fixed_work" };
  return map[String(type)] || "fixed_units";
}

function normalizeResourceType(type) {
  const map = { "0": "material", "1": "work", "2": "cost" };
  return map[String(type)] || "work";
}

function buildParentWbs(wbs) {
  if (!wbs || !String(wbs).includes(".")) return "";
  return String(wbs).split(".").slice(0, -1).join(".");
}

function buildImportedTaskId(projectId, sequence) {
  return `p${projectId}-${sequence}`.slice(0, 20);
}

function remapTasksForProjectImport(tasks, projectId) {
  const idMap = new Map();
  const wbsMap = new Map();
  tasks.forEach((task, index) => {
    const internalId = buildImportedTaskId(projectId, index + 1);
    idMap.set(String(task.id), internalId);
    if (task.wbs) wbsMap.set(String(task.wbs), internalId);
  });

  return tasks.map((task, index) => ({
    ...task,
    id: buildImportedTaskId(projectId, index + 1),
    parentId: wbsMap.get(String(task.parentId || "")) || idMap.get(String(task.parentId || "")) || "",
    predecessors: (task.predecessors || []).map((dependency) => ({
      ...dependency,
      predecessorTaskId:
        idMap.get(String(dependency.predecessorTaskId || ""))
        || wbsMap.get(String(dependency.predecessorTaskId || ""))
        || dependency.predecessorTaskId,
    })),
  }));
}

function parseMsProjectXml(xmlContent) {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true, trimValues: true });
  const xml = parser.parse(xmlContent);
  const project = xml.Project || xml.project;
  if (!project) throw new Error("Arquivo XML do MS Project inválido");

  const taskNodes = asArray(project.Tasks?.Task || project.Tasks || []);
  const resourceNodes = asArray(project.Resources?.Resource || project.Resources || []);
  const assignmentNodes = asArray(project.Assignments?.Assignment || project.Assignments || []);

  const projectName = String(project.Name || project.Title || "Projeto Importado");
  const taskUidToId = new Map();

  const tasks = taskNodes
    .filter((task) => task && task.UID != null && String(task.Summary) !== "1" || String(task.Name || "").trim())
    .map((task, index) => {
      const uid = String(task.UID);
      const wbs = String(task.OutlineNumber || task.WBS || uid);
      const id = String(task.ID || task.TaskID || wbs || uid);
      taskUidToId.set(uid, id);
      const percentual = Number(task.PercentComplete || 0);
      const dataInicioPlanej = toMmDdYy(task.Start);
      const dataFimPlanej = toMmDdYy(task.Finish);
      const dataInicioReal = toMmDdYy(task.ActualStart);
      const dataFimReal = toMmDdYy(task.ActualFinish);
      return {
        id,
        externalId: uid,
        parentId: buildParentWbs(wbs),
        wbs,
        outlineLevel: Number(task.OutlineLevel || (String(wbs).split(".").length) || 1),
        sortOrder: Number(task.ID || index + 1),
        projeto: projectName,
        tarefa: String(task.Name || `Task ${id}`),
        subtarefa: "",
        responsavel: "",
        funcao: "",
        dataInicioPlanej,
        esforcoPlanej: parseDurationMinutes(task.Work) / 60,
        dataFimPlanej,
        dataInicioReal,
        esforcoReal: parseDurationMinutes(task.ActualWork) / 60,
        dataFimReal,
        percentual,
        status: deriveTaskStatus({
          status: task.Active === false ? TASK_STATUSES.NOT_STARTED : "",
          percentual,
          dataInicioPlanej,
          dataFimPlanej,
          dataInicioReal,
          dataFimReal,
        }),
        taskType: normalizeTaskType(task.Type),
        milestone: String(task.Milestone) === "1" || String(task.Milestone).toLowerCase() === "true",
        durationMinutes: parseDurationMinutes(task.Duration),
        isManual: String(task.Manual) === "1" || String(task.Manual).toLowerCase() === "true",
        constraintType: String(task.ConstraintType || ""),
        constraintDate: toMmDdYy(task.ConstraintDate),
        notes: String(task.Notes || ""),
        valorPrevisto: Number(task.Cost || 0),
        valorGasto: Number(task.ActualCost || 0),
        diasPlanejados: Math.round(parseDurationMinutes(task.Duration) / (8 * 60)),
        diasReal: Math.round(parseDurationMinutes(task.ActualDuration) / (8 * 60)),
        diasCompletados: Math.round((Number(task.PercentComplete || 0) / 100) * Math.round(parseDurationMinutes(task.Duration) / (8 * 60))),
        predecessors: asArray(task.PredecessorLink).map((link) => ({
          predecessorTaskId: String(link.PredecessorUID || ""),
          type: normalizeDependencyType(link.Type),
          lagMinutes: Number(link.LinkLag || 0),
        })),
      };
    });

  const resources = resourceNodes
    .filter((resource) => resource && String(resource.Name || "").trim())
    .map((resource) => ({
      externalId: String(resource.UID || resource.ID || ""),
      nome: String(resource.Name),
      funcao: String(resource.Group || resource.Type || ""),
      resourceType: normalizeResourceType(resource.Type),
      initials: String(resource.Initials || ""),
      maxUnits: normalizeMaxUnits(resource.MaxUnits || 1),
      standardRate: parseRate(resource.StandardRate),
      overtimeRate: parseRate(resource.OvertimeRate),
      email: String(resource.EmailAddress || ""),
    }));

  const resourceUidToName = new Map(resources.map((resource) => [resource.externalId, resource.nome]));

  const assignmentsByTaskId = new Map();
  for (const assignment of assignmentNodes) {
    const taskId = taskUidToId.get(String(assignment.TaskUID || ""));
    if (!taskId) continue;
    const resourceName = resourceUidToName.get(String(assignment.ResourceUID || "")) || "";
    const entry = {
      resourceName,
      units: Number(assignment.Units || 1),
      work: parseDurationMinutes(assignment.Work) / 60,
      actualWork: parseDurationMinutes(assignment.ActualWork) / 60,
      remainingWork: parseDurationMinutes(assignment.RemainingWork) / 60,
      cost: Number(assignment.Cost || 0),
    };
    const current = assignmentsByTaskId.get(taskId) || [];
    current.push(entry);
    assignmentsByTaskId.set(taskId, current);
  }

  const normalizedTasks = tasks.map((task) => {
    const assignments = assignmentsByTaskId.get(task.id) || [];
    const predecessorIds = task.predecessors
      .map((predecessor) => ({
        ...predecessor,
        predecessorTaskId: taskUidToId.get(predecessor.predecessorTaskId) || predecessor.predecessorTaskId,
      }))
      .filter((predecessor) => predecessor.predecessorTaskId);
    return {
      ...task,
      responsavel: assignments.map((item) => item.resourceName).filter(Boolean).join("; "),
      assignments,
      predecessors: predecessorIds,
    };
  });

  return {
    projectName,
    project: {
      projectId: `PRJ-${projectName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || Date.now()}`,
      projeto: projectName,
      descricao: String(project.Subject || "Importado do MS Project XML"),
      prioridade: "2- Média",
      responsavel: "",
      ftes: 0,
      valorPrevisto: normalizedTasks.reduce((sum, task) => sum + Number(task.valorPrevisto || 0), 0),
      valorGasto: normalizedTasks.reduce((sum, task) => sum + Number(task.valorGasto || 0), 0),
      dataInicioPlanej: normalizedTasks.map((task) => task.dataInicioPlanej).find(Boolean) || "",
      dataFimPlanej: [...normalizedTasks].reverse().map((task) => task.dataFimPlanej).find(Boolean) || "",
      dataInicio: "",
      dataFimReal: "",
      totalTarefas: normalizedTasks.length,
      tarefasConcluidas: normalizedTasks.filter((task) => task.status === TASK_STATUSES.DONE).length,
      tarefasAndamento: normalizedTasks.filter((task) => task.status === TASK_STATUSES.IN_PROGRESS).length,
      tarefasAtrasadas: normalizedTasks.filter((task) => task.status === TASK_STATUSES.LATE).length,
      tarefasNaoIniciadas: normalizedTasks.filter((task) => task.status === TASK_STATUSES.NOT_STARTED).length,
      status: deriveProjectStatus(normalizedTasks),
      conclusao: normalizedTasks.length
        ? Math.round(normalizedTasks.reduce((sum, task) => sum + Number(task.percentual || 0), 0) / normalizedTasks.length)
        : 0,
    },
    tasks: normalizedTasks,
    resources,
  };
}

module.exports = { parseMsProjectXml, remapTasksForProjectImport };
