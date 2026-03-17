import type { Tarefa } from "@/data/projectData";

export const MAX_TASK_WBS_DEPTH = 5;

function normalizeSegments(value?: string): number[] {
  return String(value || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function buildProjectSlug(projectName: string): string {
  return (projectName || "task")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "task";
}

function getTaskHierarchyCode(task: Tarefa): string {
  return String(task.wbs || task.id || "").trim();
}

export function getTaskBusinessId(task: Tarefa): string {
  return String(task.externalId || task.id || "").trim();
}

export function getTaskHierarchyDepth(taskOrCode: Tarefa | string): number {
  const value = typeof taskOrCode === "string" ? taskOrCode : getTaskHierarchyCode(taskOrCode);
  return normalizeSegments(value).length;
}

export function getTaskDisplayHierarchy(task: Tarefa): string {
  return getTaskHierarchyCode(task);
}

export function buildTaskDisplayLabel(task: Tarefa): string {
  const businessId = getTaskBusinessId(task);
  const hierarchy = getTaskDisplayHierarchy(task);
  const prefix = businessId ? `ID ${businessId}` : "Sem ID";
  return hierarchy ? `${prefix} · WBS ${hierarchy} · ${task.tarefa}` : `${prefix} · ${task.tarefa}`;
}

export function buildTaskIndentLabel(task: Tarefa): string {
  const depth = Math.max(getTaskHierarchyDepth(task) - 1, 0);
  const prefix = depth ? `${"  ".repeat(depth)}↳ ` : "";
  return `${prefix}${buildTaskDisplayLabel(task)}`;
}

export function generateTaskIdentifiers(projectName: string, parentTaskId: string, existingTasks: Tarefa[]) {
  const sameProjectTasks = existingTasks.filter((task) => task.projeto === projectName);
  const nextSequence = sameProjectTasks.reduce((max, task, index) => {
    const explicit = Number.parseInt(String(task.externalId || ""), 10);
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(max, explicit);
    return Math.max(max, index + 1);
  }, 0) + 1;

  let wbs = "";
  if (parentTaskId) {
    const parent = sameProjectTasks.find((task) => task.id === parentTaskId);
    const parentWbs = parent ? getTaskDisplayHierarchy(parent) : "";
    const siblings = sameProjectTasks.filter((task) => task.parentId === parentTaskId);
    const nextChildSegment = siblings.reduce((max, task) => {
      const parts = normalizeSegments(getTaskDisplayHierarchy(task));
      const last = parts[parts.length - 1] || 0;
      return Math.max(max, last);
    }, 0) + 1;
    wbs = parentWbs ? `${parentWbs}.${nextChildSegment}` : String(nextChildSegment);
  } else {
    const roots = sameProjectTasks.filter((task) => !task.parentId);
    const nextRootSegment = roots.reduce((max, task) => {
      const first = normalizeSegments(getTaskDisplayHierarchy(task))[0] || 0;
      return Math.max(max, first);
    }, 0) + 1;
    wbs = String(nextRootSegment);
  }

  const outlineLevel = getTaskHierarchyDepth(wbs);
  if (outlineLevel > MAX_TASK_WBS_DEPTH) {
    throw new Error(`Máximo de ${MAX_TASK_WBS_DEPTH} níveis de WBS permitido`);
  }

  return {
    id: `${buildProjectSlug(projectName)}-${nextSequence}`,
    externalId: String(nextSequence),
    wbs,
    outlineLevel,
    sortOrder: nextSequence,
  };
}

export function resolveTaskReference(input: string, currentProject: string, tasks: Tarefa[]): string {
  const value = String(input || "").trim();
  if (!value) return "";

  const sameProjectTasks = tasks.filter((task) => task.projeto === currentProject);
  const direct = sameProjectTasks.find((task) =>
    task.id === value ||
    getTaskDisplayHierarchy(task) === value ||
    getTaskBusinessId(task) === value
  );

  return direct?.id || value;
}
