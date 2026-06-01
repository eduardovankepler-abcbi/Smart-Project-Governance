import type { Projeto, Tarefa } from "@/data/projectData";

export interface TaskReleaseBlocker {
  predecessorTaskId: string;
  dependencyType: string;
  task?: Tarefa;
  label: string;
  status: string;
  missing: boolean;
}

export interface TaskReleaseState {
  status: "no_predecessors" | "released" | "blocked";
  isReleased: boolean;
  isBlocked: boolean;
  blockers: TaskReleaseBlocker[];
  predecessorCount: number;
}

export function splitNames(value: string): string[] {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getTaskResourceNames(task: Tarefa): string[] {
  if (task.assignments?.length) {
    return task.assignments
      .map((assignment) => assignment.resourceName?.trim())
      .filter((name): name is string => !!name);
  }
  return splitNames(task.responsavel);
}

export function getTaskResourceLabel(task: Tarefa): string {
  return getTaskResourceNames(task).join("; ");
}

export function getTaskPredecessorLabel(task: Tarefa): string {
  return (task.predecessors || [])
    .map((dependency) => `${dependency.predecessorTaskId}${dependency.type !== "FS" ? ` (${dependency.type})` : ""}`)
    .join("; ");
}

export function formatDurationHours(durationMinutes = 0): string {
  const hours = durationMinutes / 60;
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

export function getTaskProjectId(task: Tarefa): number | undefined {
  const value = Number(task.projectId || 0);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function isTaskLinkedToProject(task: Tarefa, project: Projeto): boolean {
  const taskProjectId = getTaskProjectId(task);
  if (taskProjectId) return taskProjectId === Number(project.id);
  return task.projeto === project.projeto;
}

export function getTasksForProject(tasks: Tarefa[], project: Projeto): Tarefa[] {
  return tasks.filter((task) => isTaskLinkedToProject(task, project));
}

export function findProjectForTask(task: Tarefa, projects: Projeto[]): Projeto | undefined {
  const taskProjectId = getTaskProjectId(task);
  if (taskProjectId) {
    const byId = projects.find((project) => Number(project.id) === taskProjectId);
    if (byId) return byId;
  }
  return projects.find((project) => project.projeto === task.projeto);
}

export function getProjectTasksByName(tasks: Tarefa[], projects: Projeto[], projectName: string): Tarefa[] {
  const project = projects.find((item) => item.projeto === projectName);
  if (!project) return tasks.filter((task) => task.projeto === projectName);
  return getTasksForProject(tasks, project);
}

function getTaskHierarchyCode(task: Tarefa): string {
  return String(task.wbs || task.id || "").trim();
}

function getTaskBusinessCode(task: Tarefa): string {
  return String(task.externalId || task.id || "").trim();
}

function buildTaskReferenceLabel(task: Tarefa): string {
  const businessId = getTaskBusinessCode(task);
  const hierarchy = getTaskHierarchyCode(task);
  const prefix = [businessId ? `ID ${businessId}` : "", hierarchy ? `WBS ${hierarchy}` : ""].filter(Boolean).join(" · ");
  return prefix ? `${prefix} · ${task.tarefa}` : task.tarefa;
}

function isTaskComplete(task?: Tarefa): boolean {
  if (!task) return false;
  return task.status === "Concluído" || Number(task.percentual || 0) >= 100 || Boolean(task.dataFimReal);
}

function findPredecessorTask(predecessorTaskId: string, currentTask: Tarefa, tasks: Tarefa[], projects: Projeto[]): Tarefa | undefined {
  const project = findProjectForTask(currentTask, projects);
  const projectTasks = project ? getTasksForProject(tasks, project) : tasks.filter((task) => task.projeto === currentTask.projeto);
  const reference = String(predecessorTaskId || "").trim();
  if (!reference) return undefined;

  return projectTasks.find((task) =>
    task.id === reference ||
    getTaskBusinessCode(task) === reference ||
    getTaskHierarchyCode(task) === reference
  );
}

export function getTaskReleaseState(task: Tarefa, tasks: Tarefa[], projects: Projeto[] = []): TaskReleaseState {
  const predecessors = task.predecessors || [];
  if (!predecessors.length) {
    return {
      status: "no_predecessors",
      isReleased: true,
      isBlocked: false,
      blockers: [],
      predecessorCount: 0,
    };
  }

  const blockers = predecessors
    .map((dependency) => {
      const predecessorTask = findPredecessorTask(dependency.predecessorTaskId, task, tasks, projects);
      if (predecessorTask && isTaskComplete(predecessorTask)) return null;

      return {
        predecessorTaskId: dependency.predecessorTaskId,
        dependencyType: dependency.type || "FS",
        task: predecessorTask,
        label: predecessorTask ? buildTaskReferenceLabel(predecessorTask) : `Referência não encontrada: ${dependency.predecessorTaskId}`,
        status: predecessorTask?.status || "Não encontrada",
        missing: !predecessorTask,
      } satisfies TaskReleaseBlocker;
    })
    .filter((item): item is TaskReleaseBlocker => Boolean(item));

  return {
    status: blockers.length ? "blocked" : "released",
    isReleased: blockers.length === 0,
    isBlocked: blockers.length > 0,
    blockers,
    predecessorCount: predecessors.length,
  };
}

export function getProjectFlowBlockers(tasks: Tarefa[], project: Projeto, projects: Projeto[] = [project]): Array<{ task: Tarefa; releaseState: TaskReleaseState }> {
  return getTasksForProject(tasks, project)
    .filter((task) => !isTaskComplete(task))
    .map((task) => ({ task, releaseState: getTaskReleaseState(task, tasks, projects) }))
    .filter((item) => item.releaseState.isBlocked)
    .sort((a, b) => {
      const orderA = Number(a.task.sortOrder || 0);
      const orderB = Number(b.task.sortOrder || 0);
      if (orderA !== orderB) return orderA - orderB;
      return getTaskHierarchyCode(a.task).localeCompare(getTaskHierarchyCode(b.task), undefined, { numeric: true });
    });
}
