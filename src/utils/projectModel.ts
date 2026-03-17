import type { Tarefa } from "@/data/projectData";

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
