const { normalizeDateInput, normalizeColName, sanitizeString } = require("./parsing");

const TASK_STATUSES = {
  DONE: "Concluído",
  LATE: "Atrasado",
  IN_PROGRESS: "Em andamento",
  NOT_STARTED: "Não iniciado",
};

function parseDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayOnly(today = new Date()) {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function normalizeTaskStatus(value, progress = 0) {
  const raw = normalizeColName(sanitizeString(value, 50));
  if (raw.includes("complete") || raw.includes("concluido")) return TASK_STATUSES.DONE;
  if (raw.includes("delay") || raw.includes("atras")) return TASK_STATUSES.LATE;
  if (raw.includes("not started") || raw.includes("nao iniciado")) return TASK_STATUSES.NOT_STARTED;
  if (raw.includes("progress") || raw.includes("andamento")) return TASK_STATUSES.IN_PROGRESS;
  if (Number(progress || 0) >= 100) return TASK_STATUSES.DONE;
  if (Number(progress || 0) > 0) return TASK_STATUSES.IN_PROGRESS;
  return "";
}

function deriveTaskStatus(task = {}, options = {}) {
  const today = todayOnly(options.today);
  const progress = Number(task.percentual ?? task.progress ?? 0);
  const explicitStatus = normalizeTaskStatus(task.status ?? task.explicitStatus, progress);

  if (explicitStatus === TASK_STATUSES.DONE || progress >= 100 || parseDate(task.dataFimReal || task.actualFinish)) {
    return TASK_STATUSES.DONE;
  }

  if (explicitStatus === TASK_STATUSES.LATE) return TASK_STATUSES.LATE;

  const plannedFinish = parseDate(task.dataFimPlanej || task.plannedFinish || task.finish);
  if (plannedFinish && plannedFinish.getTime() < today.getTime()) return TASK_STATUSES.LATE;

  if (explicitStatus === TASK_STATUSES.IN_PROGRESS) return TASK_STATUSES.IN_PROGRESS;
  if (parseDate(task.dataInicioReal || task.actualStart) || progress > 0) return TASK_STATUSES.IN_PROGRESS;

  const plannedStart = parseDate(task.dataInicioPlanej || task.plannedStart || task.start);
  if (plannedStart && plannedStart.getTime() <= today.getTime()) return TASK_STATUSES.IN_PROGRESS;

  return TASK_STATUSES.NOT_STARTED;
}

function deriveProjectStatus(tasks = []) {
  if (!tasks.length) return TASK_STATUSES.NOT_STARTED;
  const statuses = tasks.map((task) => deriveTaskStatus(task));
  if (statuses.every((status) => status === TASK_STATUSES.DONE)) return TASK_STATUSES.DONE;
  if (statuses.some((status) => status === TASK_STATUSES.LATE)) return TASK_STATUSES.LATE;
  if (statuses.some((status) => status === TASK_STATUSES.IN_PROGRESS)) return TASK_STATUSES.IN_PROGRESS;
  return TASK_STATUSES.NOT_STARTED;
}

module.exports = {
  TASK_STATUSES,
  normalizeTaskStatus,
  deriveTaskStatus,
  deriveProjectStatus,
};
