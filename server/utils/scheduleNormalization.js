const { normalizeDateInput } = require("./parsing");

const SCHEDULE_SOURCE_FORMATS = {
  INTERNAL_PROJECT: "internal_project",
  MS_PROJECT_XML: "ms_project_xml",
  MPP: "mpp",
};

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sanitizeTaskTemplateJson(task) {
  return {
    assignments: safeJsonParse(task.assignments_json, []),
    predecessors: safeJsonParse(task.predecessors_json, []),
  };
}

function buildNormalizedScheduleFromProjectSnapshot(project, tasks = []) {
  const normalizedTasks = tasks.map((task) => {
    const relations = sanitizeTaskTemplateJson(task);
    return {
      templateTaskKey: String(task.template_task_key || task.id || ""),
      parentTemplateTaskKey: String(task.parent_template_task_key || task.parent_id || ""),
      externalId: String(task.external_id || ""),
      wbs: String(task.wbs || ""),
      outlineLevel: Number(task.outline_level || 1),
      sortOrder: Number(task.sort_order || 0),
      tarefa: String(task.tarefa || ""),
      subtarefa: String(task.subtarefa || ""),
      responsavel: String(task.responsavel || ""),
      funcao: String(task.funcao || ""),
      dataInicioPlanej: String(task.data_inicio_planej || ""),
      dataInicioPlanejDate: normalizeDateInput(task.data_inicio_planej_date || task.data_inicio_planej) || null,
      esforcoPlanej: Number(task.esforco_planej || 0),
      dataFimPlanej: String(task.data_fim_planej || ""),
      dataFimPlanejDate: normalizeDateInput(task.data_fim_planej_date || task.data_fim_planej) || null,
      dataInicioReal: String(task.data_inicio_real || ""),
      dataInicioRealDate: normalizeDateInput(task.data_inicio_real_date || task.data_inicio_real) || null,
      esforcoReal: Number(task.esforco_real || 0),
      dataFimReal: String(task.data_fim_real || ""),
      dataFimRealDate: normalizeDateInput(task.data_fim_real_date || task.data_fim_real) || null,
      percentual: Number(task.percentual || 0),
      status: String(task.status || "Não iniciado"),
      taskType: String(task.task_type || "fixed_units"),
      milestone: !!task.is_milestone,
      durationMinutes: Number(task.duration_minutes || 0),
      isManual: !!task.is_manual,
      constraintType: String(task.constraint_type || ""),
      constraintDate: String(task.constraint_date || ""),
      constraintDateDate: normalizeDateInput(task.constraint_date_date || task.constraint_date) || null,
      notes: String(task.notes || ""),
      valorPrevisto: Number(task.valor_previsto || 0),
      valorGasto: Number(task.valor_gasto || 0),
      diasPlanejados: Number(task.dias_planejados || 0),
      diasReal: Number(task.dias_real || 0),
      diasCompletados: Number(task.dias_completados || 0),
      assignments: Array.isArray(relations.assignments) ? relations.assignments : [],
      predecessors: Array.isArray(relations.predecessors) ? relations.predecessors : [],
    };
  });

  return {
    sourceFormat: SCHEDULE_SOURCE_FORMATS.INTERNAL_PROJECT,
    project: {
      projectId: String(project.project_code || ""),
      projeto: String(project.projeto || ""),
      descricao: String(project.descricao || ""),
      prioridade: String(project.prioridade || "2- Média"),
      responsavel: String(project.responsavel || ""),
      ftes: Number(project.ftes || 0),
      valorPrevisto: Number(project.valor_previsto || 0),
      valorGasto: Number(project.valor_gasto || 0),
      dataInicioPlanej: String(project.data_inicio_planej || ""),
      dataFimPlanej: String(project.data_fim_planej || ""),
      dataInicio: String(project.data_inicio || ""),
      dataFimReal: String(project.data_fim_real || ""),
      totalTarefas: normalizedTasks.length,
      tarefasConcluidas: normalizedTasks.filter((task) => task.status === "Concluído").length,
      tarefasAndamento: normalizedTasks.filter((task) => task.status === "Em andamento").length,
      tarefasAtrasadas: normalizedTasks.filter((task) => task.status === "Atrasado").length,
      tarefasNaoIniciadas: normalizedTasks.filter((task) => task.status === "Não iniciado").length,
      status: String(project.status || "Não iniciado"),
      conclusao: Number(project.conclusao || 0),
    },
    tasks: normalizedTasks,
  };
}

module.exports = {
  SCHEDULE_SOURCE_FORMATS,
  buildNormalizedScheduleFromProjectSnapshot,
};
