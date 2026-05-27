const { normalizeDateInput } = require("./parsing");

const HOURS_PER_WORKDAY = 8;

function parseDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countWorkingDays(start, end) {
  if (!start || !end) return 0;
  const first = new Date(Math.min(start.getTime(), end.getTime()));
  const last = new Date(Math.max(start.getTime(), end.getTime()));
  let days = 0;
  for (let cursor = new Date(first); cursor.getTime() <= last.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

function getTaskWindow(task = {}) {
  const start = parseDate(task.data_inicio_planej_date || task.data_inicio_planej || task.data_inicio_real_date || task.data_inicio_real);
  const end = parseDate(task.data_fim_planej_date || task.data_fim_planej || task.data_fim_real_date || task.data_fim_real) || start;
  return { start, end };
}

function datesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return Math.max(aStart.getTime(), bStart.getTime()) <= Math.min(aEnd.getTime(), bEnd.getTime());
}

function calculateOccupancyPercent(plannedWork, capacityUnits, start, end) {
  const availableHours = countWorkingDays(start, end) * HOURS_PER_WORKDAY * Number(capacityUnits || 1);
  return {
    availableHours,
    occupancyPct: availableHours > 0 ? (Number(plannedWork || 0) / availableHours) * 100 : 0,
  };
}

async function buildAllocationCapacityWarning(pool, { taskId, resourceId, plannedWork, excludeAssignmentId = null }) {
  const [[task]] = await pool.query("SELECT * FROM tarefas WHERE id = ? LIMIT 1", [taskId]);
  const [[resource]] = await pool.query("SELECT id, nome, max_units FROM recursos WHERE id = ? LIMIT 1", [resourceId]);
  if (!task || !resource) return null;

  const targetWindow = getTaskWindow(task);
  if (!targetWindow.start || !targetWindow.end) return null;

  const [assignmentRows] = await pool.query(
    `SELECT ta.id, ta.work, t.data_inicio_planej, t.data_inicio_planej_date, t.data_fim_planej, t.data_fim_planej_date,
            t.data_inicio_real, t.data_inicio_real_date, t.data_fim_real, t.data_fim_real_date
       FROM task_assignments ta
       INNER JOIN tarefas t ON t.id = ta.task_id
      WHERE ta.resource_id = ?`,
    [resourceId]
  );

  const overlappingWork = assignmentRows.reduce((sum, assignment) => {
    if (excludeAssignmentId && Number(assignment.id) === Number(excludeAssignmentId)) return sum;
    const window = getTaskWindow(assignment);
    if (!datesOverlap(targetWindow.start, targetWindow.end, window.start, window.end)) return sum;
    return sum + Number(assignment.work || 0);
  }, 0);

  const projectedWork = overlappingWork + Number(plannedWork || 0);
  const { availableHours, occupancyPct } = calculateOccupancyPercent(projectedWork, resource.max_units, targetWindow.start, targetWindow.end);
  if (occupancyPct <= 100) return null;

  return {
    code: "RESOURCE_OVERALLOCATED",
    message: `${resource.nome} ficará com ${Math.round(occupancyPct)}% de ocupação no período da tarefa.`,
    resourceId: resource.id,
    resourceName: resource.nome,
    occupancyPct: Number(occupancyPct.toFixed(1)),
    availableHours: Number(availableHours.toFixed(1)),
    plannedWork: Number(projectedWork.toFixed(1)),
  };
}

module.exports = {
  HOURS_PER_WORKDAY,
  buildAllocationCapacityWarning,
  calculateOccupancyPercent,
  countWorkingDays,
  getTaskWindow,
};
