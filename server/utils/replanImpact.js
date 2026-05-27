const { sanitizeInt, sanitizeNumber, sanitizeString } = require("./parsing");

function roundCurrency(value) {
  return Number(sanitizeNumber(value).toFixed(2));
}

function summarizeIncomingTasks(tasks = []) {
  return tasks.reduce(
    (summary, task) => ({
      taskCount: summary.taskCount + 1,
      totalPlannedEffort: summary.totalPlannedEffort + sanitizeNumber(task.plannedEffort ?? task.esforcoPlanej ?? task.esforco_planej),
      totalPlannedCost: summary.totalPlannedCost + sanitizeNumber(task.plannedCost ?? task.valorPrevisto ?? task.valor_previsto),
    }),
    { taskCount: 0, totalPlannedEffort: 0, totalPlannedCost: 0 }
  );
}

async function getOfficialBaseline(conn, projectId) {
  const normalizedProjectId = sanitizeInt(projectId);
  if (!normalizedProjectId) return null;

  const [rows] = await conn.query(
    `SELECT id, baseline_number, baseline_name, task_count, total_planned_effort, total_planned_cost
       FROM project_baselines
      WHERE project_id = ?
        AND is_official = 1
      ORDER BY baseline_number DESC, id DESC
      LIMIT 1`,
    [normalizedProjectId]
  );

  return rows[0] || null;
}

async function buildBaselineImpact(conn, projectId, incomingTasks = []) {
  const incoming = summarizeIncomingTasks(incomingTasks);
  const baseline = await getOfficialBaseline(conn, projectId);

  if (!baseline) {
    return {
      hasOfficialBaseline: false,
      incomingTaskCount: incoming.taskCount,
      incomingPlannedEffort: roundCurrency(incoming.totalPlannedEffort),
      incomingPlannedCost: roundCurrency(incoming.totalPlannedCost),
    };
  }

  const baselineTaskCount = sanitizeInt(baseline.task_count);
  const baselinePlannedEffort = roundCurrency(baseline.total_planned_effort);
  const baselinePlannedCost = roundCurrency(baseline.total_planned_cost);
  const incomingPlannedEffort = roundCurrency(incoming.totalPlannedEffort);
  const incomingPlannedCost = roundCurrency(incoming.totalPlannedCost);

  return {
    hasOfficialBaseline: true,
    baselineId: sanitizeInt(baseline.id),
    baselineNumber: sanitizeInt(baseline.baseline_number),
    baselineName: sanitizeString(baseline.baseline_name, 160),
    baselineTaskCount,
    incomingTaskCount: incoming.taskCount,
    taskCountDelta: incoming.taskCount - baselineTaskCount,
    baselinePlannedEffort,
    incomingPlannedEffort,
    plannedEffortDelta: roundCurrency(incomingPlannedEffort - baselinePlannedEffort),
    baselinePlannedCost,
    incomingPlannedCost,
    plannedCostDelta: roundCurrency(incomingPlannedCost - baselinePlannedCost),
  };
}

module.exports = {
  buildBaselineImpact,
  summarizeIncomingTasks,
};
