import type { Projeto, Tarefa } from "@/data/projectData";

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
