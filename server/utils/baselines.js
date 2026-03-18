const { sanitizeInt, sanitizeNumber, sanitizeString, normalizeDateInput } = require("./parsing");
const { logAudit } = require("./audit");
const { ROLES } = require("./auth");

const BASELINE_SOURCE_TYPES = {
  PROJECT_CREATE: "project_create",
  XML_IMPORT: "xml_import",
  MANUAL: "manual",
  REPLAN: "replan",
};

const BASELINE_STATUSES = {
  PENDING: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const CURVE_METRICS = {
  EFFORT: "effort",
  COST: "cost",
  PROGRESS: "progress",
};

function createError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapBaseline(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectCode: row.project_code || "",
    baselineNumber: row.baseline_number,
    baselineName: row.baseline_name,
    sourceType: row.source_type,
    status: row.status,
    isOfficial: !!row.is_official,
    justification: row.justification || "",
    approvalNotes: row.approval_notes || "",
    requestedByUserId: row.requested_by_user_id || undefined,
    requestedByName: row.requested_by_nome || "",
    requestedByRole: row.requested_by_role || "",
    approvedByUserId: row.approved_by_user_id || undefined,
    approvedByName: row.approved_by_nome || "",
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : "",
    taskCount: row.task_count || 0,
    totalPlannedEffort: Number(row.total_planned_effort || 0),
    totalPlannedCost: Number(row.total_planned_cost || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function normalizeSourceType(input) {
  const value = sanitizeString(input, 30).toLowerCase();
  if (Object.values(BASELINE_SOURCE_TYPES).includes(value)) return value;
  return BASELINE_SOURCE_TYPES.MANUAL;
}

function buildDefaultBaselineName(number, sourceType) {
  const labels = {
    [BASELINE_SOURCE_TYPES.PROJECT_CREATE]: "Linha de Base Inicial",
    [BASELINE_SOURCE_TYPES.XML_IMPORT]: "Linha de Base Importada",
    [BASELINE_SOURCE_TYPES.MANUAL]: "Linha de Base Manual",
    [BASELINE_SOURCE_TYPES.REPLAN]: "Linha de Base Reprogramada",
  };
  return `LB ${String(number).padStart(2, "0")} - ${labels[sourceType] || "Linha de Base"}`;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeekUtc(date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1);
  return result;
}

function endOfWeekUtc(date) {
  const result = startOfWeekUtc(date);
  result.setUTCDate(result.getUTCDate() + 6);
  return result;
}

function addWeeksUtc(date, amount) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount * 7);
  return result;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function formatWeekLabel(date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function cumulativeLinearValue(total, startDate, finishDate, pointDate) {
  if (!startDate && !finishDate) return 0;
  const start = startDate || finishDate;
  const finish = finishDate || startDate || startDate;
  if (!start || !finish) return 0;
  const startTime = start.getTime();
  const finishTime = finish.getTime();
  const pointTime = pointDate.getTime();

  if (finishTime <= startTime) return pointTime >= finishTime ? total : 0;
  if (pointTime <= startTime) return 0;
  if (pointTime >= finishTime) return total;
  return total * clamp((pointTime - startTime) / (finishTime - startTime));
}

async function getProjectOrThrow(connection, projectId) {
  const [rows] = await connection.query("SELECT * FROM projetos WHERE id = ? LIMIT 1", [projectId]);
  if (!rows.length) throw createError(404, "Projeto não encontrado", "BASELINE_PROJECT_NOT_FOUND");
  return rows[0];
}

async function getProjectTasksSnapshot(connection, projectName) {
  const [rows] = await connection.query(
    `SELECT id, external_id, wbs, parent_id, tarefa, subtarefa, outline_level,
            data_inicio_planej_date, data_inicio_planej, data_fim_planej_date, data_fim_planej,
            esforco_planej, valor_previsto, percentual
       FROM tarefas
      WHERE projeto = ?
      ORDER BY sort_order, id`,
    [projectName]
  );
  return rows;
}

async function setOfficialApprovedBaseline(connection, projectId, baselineId, approver, approvalNotes = "") {
  await connection.query("UPDATE project_baselines SET is_official = 0 WHERE project_id = ?", [projectId]);
  await connection.query(
    `UPDATE project_baselines
        SET status = ?, is_official = 1, approval_notes = ?, approved_by_user_id = ?, approved_by_nome = ?, approved_at = NOW()
      WHERE id = ?`,
    [
      BASELINE_STATUSES.APPROVED,
      sanitizeString(approvalNotes, 4000),
      approver.id || null,
      sanitizeString(approver.nome, 120),
      baselineId,
    ]
  );
}

async function createProjectBaseline(pool, { projectId, sourceType, baselineName, justification, actor }) {
  const connection = await pool.getConnection();
  try {
    const normalizedProjectId = sanitizeInt(projectId);
    if (!normalizedProjectId) throw createError(400, "Projeto é obrigatório", "BASELINE_PROJECT_REQUIRED");

    const normalizedSourceType = normalizeSourceType(sourceType);
    const normalizedJustification = sanitizeString(justification, 4000);
    const isPmoRequest = actor.role === ROLES.PMO;

    if (isPmoRequest && !normalizedJustification) {
      throw createError(400, "PMO deve informar justificativa para solicitar nova baseline", "BASELINE_JUSTIFICATION_REQUIRED");
    }

    await connection.beginTransaction();
    const project = await getProjectOrThrow(connection, normalizedProjectId);
    const taskRows = await getProjectTasksSnapshot(connection, project.projeto);
    const [[counterRow]] = await connection.query(
      "SELECT COALESCE(MAX(baseline_number), 0) AS last_number FROM project_baselines WHERE project_id = ?",
      [normalizedProjectId]
    );

    const nextBaselineNumber = Number(counterRow?.last_number || 0) + 1;
    const finalName = sanitizeString(baselineName, 160) || buildDefaultBaselineName(nextBaselineNumber, normalizedSourceType);
    const status = isPmoRequest ? BASELINE_STATUSES.PENDING : BASELINE_STATUSES.APPROVED;
    const totalPlannedEffort = taskRows.reduce((sum, row) => sum + sanitizeNumber(row.esforco_planej), 0);
    const totalPlannedCost = taskRows.reduce((sum, row) => sum + sanitizeNumber(row.valor_previsto), 0);

    const [insertResult] = await connection.query(
      `INSERT INTO project_baselines
        (project_id, project_name, project_code, baseline_number, baseline_name, source_type, status, is_official, justification,
         requested_by_user_id, requested_by_nome, requested_by_role, task_count, total_planned_effort, total_planned_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedProjectId,
        sanitizeString(project.projeto, 100),
        sanitizeString(project.project_code, 50),
        nextBaselineNumber,
        finalName,
        normalizedSourceType,
        status,
        normalizedJustification,
        actor.id || null,
        sanitizeString(actor.nome, 120),
        sanitizeString(actor.role, 20),
        taskRows.length,
        totalPlannedEffort,
        totalPlannedCost,
      ]
    );

    const baselineId = insertResult.insertId;

    for (const task of taskRows) {
      await connection.query(
        `INSERT INTO project_baseline_tasks
          (baseline_id, task_id, task_external_id, task_wbs, parent_task_id, task_name, task_subtask, outline_level,
           planned_start_date, planned_finish_date, planned_effort, planned_cost, planned_progress)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          baselineId,
          sanitizeString(task.id, 20),
          sanitizeString(task.external_id, 50),
          sanitizeString(task.wbs, 50) || sanitizeString(task.id, 20),
          sanitizeString(task.parent_id, 20) || null,
          sanitizeString(task.tarefa, 255),
          sanitizeString(task.subtarefa, 255),
          sanitizeInt(task.outline_level, 1),
          normalizeDateInput(task.data_inicio_planej_date || task.data_inicio_planej) || null,
          normalizeDateInput(task.data_fim_planej_date || task.data_fim_planej) || null,
          sanitizeNumber(task.esforco_planej),
          sanitizeNumber(task.valor_previsto),
          sanitizeNumber(task.percentual),
        ]
      );
    }

    if (status === BASELINE_STATUSES.APPROVED) {
      await setOfficialApprovedBaseline(connection, normalizedProjectId, baselineId, actor, "");
    }

    await connection.commit();

    const [rows] = await pool.query("SELECT * FROM project_baselines WHERE id = ?", [baselineId]);
    const created = rows[0];
    await logAudit(pool, {
      actor,
      action: status === BASELINE_STATUSES.APPROVED ? "approve" : "create",
      entityType: "baseline",
      entityId: String(baselineId),
      projectId: normalizedProjectId,
      summary:
        status === BASELINE_STATUSES.APPROVED
          ? `Baseline ${finalName} criada e aprovada para ${project.projeto}`
          : `Baseline ${finalName} criada e enviada para aprovação em ${project.projeto}`,
      after: created,
    });

    return mapBaseline(created);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function approveProjectBaseline(pool, baselineId, actor, approvalNotes = "") {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM project_baselines WHERE id = ? LIMIT 1", [baselineId]);
    if (!rows.length) throw createError(404, "Baseline não encontrada", "BASELINE_NOT_FOUND");
    const current = rows[0];
    if (current.status === BASELINE_STATUSES.REJECTED) {
      throw createError(400, "Baseline rejeitada não pode ser aprovada sem nova solicitação", "BASELINE_REJECTED");
    }

    await setOfficialApprovedBaseline(connection, current.project_id, current.id, actor, approvalNotes);
    await connection.commit();

    const [updatedRows] = await pool.query("SELECT * FROM project_baselines WHERE id = ?", [baselineId]);
    const updated = updatedRows[0];
    await logAudit(pool, {
      actor,
      action: "approve",
      entityType: "baseline",
      entityId: String(baselineId),
      projectId: current.project_id,
      summary: `Baseline ${current.baseline_name} aprovada`,
      before: current,
      after: updated,
    });
    return mapBaseline(updated);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectProjectBaseline(pool, baselineId, actor, approvalNotes = "") {
  const [rows] = await pool.query("SELECT * FROM project_baselines WHERE id = ? LIMIT 1", [baselineId]);
  if (!rows.length) throw createError(404, "Baseline não encontrada", "BASELINE_NOT_FOUND");
  const current = rows[0];
  if (current.status === BASELINE_STATUSES.APPROVED) {
    throw createError(400, "Baseline aprovada não pode ser rejeitada", "BASELINE_ALREADY_APPROVED");
  }

  await pool.query(
    `UPDATE project_baselines
        SET status = ?, is_official = 0, approval_notes = ?, approved_by_user_id = ?, approved_by_nome = ?, approved_at = NOW()
      WHERE id = ?`,
    [
      BASELINE_STATUSES.REJECTED,
      sanitizeString(approvalNotes, 4000),
      actor.id || null,
      sanitizeString(actor.nome, 120),
      baselineId,
    ]
  );
  const [updatedRows] = await pool.query("SELECT * FROM project_baselines WHERE id = ?", [baselineId]);
  const updated = updatedRows[0];
  await logAudit(pool, {
    actor,
    action: "reject",
    entityType: "baseline",
    entityId: String(baselineId),
    projectId: current.project_id,
    summary: `Baseline ${current.baseline_name} rejeitada`,
    before: current,
    after: updated,
  });
  return mapBaseline(updated);
}

async function listProjectBaselines(pool, { projectIds = [], all = false, projectId } = {}) {
  const filters = [];
  const params = [];

  if (projectId) {
    filters.push("project_id = ?");
    params.push(projectId);
  } else if (!all) {
    filters.push("project_id IN (?)");
    params.push(projectIds.length ? projectIds : [0]);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT *
       FROM project_baselines
       ${where}
      ORDER BY project_id, baseline_number DESC, id DESC`,
    params
  );
  return rows.map(mapBaseline);
}

function extractPlannedDatesFromSnapshot(row) {
  return {
    start: parseDateValue(row.planned_start_date),
    finish: parseDateValue(row.planned_finish_date),
  };
}

function extractCurrentTaskDates(row) {
  return {
    plannedStart: parseDateValue(row.data_inicio_planej_date || row.data_inicio_planej),
    plannedFinish: parseDateValue(row.data_fim_planej_date || row.data_fim_planej),
    actualStart: parseDateValue(row.data_inicio_real_date || row.data_inicio_real),
    actualFinish: parseDateValue(row.data_fim_real_date || row.data_fim_real),
  };
}

function getRangeDates(projectRow, baselineTasks, liveTasks) {
  const candidates = [];
  const now = new Date();
  candidates.push(startOfWeekUtc(now), endOfWeekUtc(now));

  const projectPlannedStart = parseDateValue(projectRow.data_inicio_planej_date || projectRow.data_inicio_planej);
  const projectPlannedFinish = parseDateValue(projectRow.data_fim_planej_date || projectRow.data_fim_planej);
  const projectActualStart = parseDateValue(projectRow.data_inicio_real_date || projectRow.data_inicio);
  const projectActualFinish = parseDateValue(projectRow.data_fim_real_date || projectRow.data_fim_real);
  [projectPlannedStart, projectPlannedFinish, projectActualStart, projectActualFinish].filter(Boolean).forEach((date) => candidates.push(date));

  baselineTasks.forEach((task) => {
    const { start, finish } = extractPlannedDatesFromSnapshot(task);
    if (start) candidates.push(start);
    if (finish) candidates.push(finish);
  });

  liveTasks.forEach((task) => {
    const { plannedStart, plannedFinish, actualStart, actualFinish } = extractCurrentTaskDates(task);
    [plannedStart, plannedFinish, actualStart, actualFinish].filter(Boolean).forEach((date) => candidates.push(date));
  });

  const sorted = candidates.filter(Boolean).sort((a, b) => a.getTime() - b.getTime());
  if (!sorted.length) {
    const currentWeek = startOfWeekUtc(new Date());
    return { start: currentWeek, end: currentWeek };
  }
  return {
    start: startOfWeekUtc(sorted[0]),
    end: startOfWeekUtc(sorted[sorted.length - 1]),
  };
}

function computePlanTotal(task, metric) {
  if (metric === CURVE_METRICS.EFFORT) return sanitizeNumber(task.planned_effort);
  if (metric === CURVE_METRICS.COST) return sanitizeNumber(task.planned_cost);
  return 0;
}

function computeActualTotal(task, metric) {
  if (metric === CURVE_METRICS.EFFORT) return sanitizeNumber(task.esforco_real);
  if (metric === CURVE_METRICS.COST) return sanitizeNumber(task.valor_gasto);
  return 0;
}

function getProgressWeight(task) {
  return sanitizeNumber(task.planned_effort || task.esforco_planej) || sanitizeNumber(task.planned_cost || task.valor_previsto) || 1;
}

function buildWeeklyCurve(projectRow, baselineRow, baselineTasks, liveTasks, metric) {
  const range = getRangeDates(projectRow, baselineTasks, liveTasks);
  const points = [];
  const currentDate = endOfWeekUtc(new Date());
  const totalProgressWeight = baselineTasks.reduce((sum, task) => sum + getProgressWeight(task), 0) || 1;

  for (let cursor = range.start; cursor.getTime() <= range.end.getTime(); cursor = addWeeksUtc(cursor, 1)) {
    const weekEnd = endOfWeekUtc(cursor);
    const effectivePoint = weekEnd.getTime() > currentDate.getTime() ? currentDate : weekEnd;
    let planned = 0;
    let actual = 0;

    if (metric === CURVE_METRICS.PROGRESS) {
      planned = baselineTasks.reduce((sum, task) => {
        const { start, finish } = extractPlannedDatesFromSnapshot(task);
        const weight = getProgressWeight(task);
        return sum + (weight * cumulativeLinearValue(1, start, finish, effectivePoint));
      }, 0);

      actual = liveTasks.reduce((sum, task) => {
        const { plannedStart, plannedFinish, actualStart, actualFinish } = extractCurrentTaskDates(task);
        const start = actualStart || plannedStart;
        const finish = actualFinish || effectivePoint;
        const finalPercent = clamp(sanitizeNumber(task.percentual) / 100, 0, 1);
        const weight = getProgressWeight(task);
        if (weekEnd.getTime() > currentDate.getTime()) {
          return sum + weight * finalPercent;
        }
        return sum + (weight * finalPercent * cumulativeLinearValue(1, start, finish || plannedFinish || start, effectivePoint));
      }, 0);

      planned = Number(((planned / totalProgressWeight) * 100).toFixed(2));
      actual = Number(((actual / totalProgressWeight) * 100).toFixed(2));
    } else {
      planned = baselineTasks.reduce((sum, task) => {
        const { start, finish } = extractPlannedDatesFromSnapshot(task);
        return sum + cumulativeLinearValue(computePlanTotal(task, metric), start, finish, effectivePoint);
      }, 0);

      actual = liveTasks.reduce((sum, task) => {
        const { plannedStart, plannedFinish, actualStart, actualFinish } = extractCurrentTaskDates(task);
        const total = computeActualTotal(task, metric);
        if (total <= 0) return sum;
        const start = actualStart || plannedStart;
        const finish = actualFinish || effectivePoint || plannedFinish || start;
        return sum + cumulativeLinearValue(total, start, finish, effectivePoint);
      }, 0);

      planned = Number(planned.toFixed(2));
      actual = Number(actual.toFixed(2));
    }

    points.push({
      weekStart: cursor.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      label: formatWeekLabel(cursor),
      planned,
      actual,
      variance: Number((actual - planned).toFixed(2)),
    });
  }

  const lastPoint = points[points.length - 1] || { planned: 0, actual: 0, variance: 0 };
  return {
    aggregation: "weekly",
    metric,
    baseline: mapBaseline(baselineRow),
    points,
    summary: {
      plannedTotal: lastPoint.planned,
      actualTotal: lastPoint.actual,
      varianceTotal: lastPoint.variance,
    },
  };
}

async function getProjectCurveSeries(pool, { projectId, baselineId, metric }) {
  const normalizedProjectId = sanitizeInt(projectId);
  if (!normalizedProjectId) throw createError(400, "Projeto é obrigatório", "CURVE_PROJECT_REQUIRED");
  const normalizedMetric = Object.values(CURVE_METRICS).includes(metric) ? metric : CURVE_METRICS.EFFORT;

  const project = await getProjectOrThrow(pool, normalizedProjectId);
  const [baselineRows] = baselineId
    ? await pool.query("SELECT * FROM project_baselines WHERE id = ? AND project_id = ? LIMIT 1", [baselineId, normalizedProjectId])
    : await pool.query(
      `SELECT *
         FROM project_baselines
        WHERE project_id = ?
          AND is_official = 1
        ORDER BY baseline_number DESC
        LIMIT 1`,
      [normalizedProjectId]
    );

  if (!baselineRows.length) {
    return {
      aggregation: "weekly",
      metric: normalizedMetric,
      baseline: null,
      points: [],
      summary: { plannedTotal: 0, actualTotal: 0, varianceTotal: 0 },
    };
  }

  const baseline = baselineRows[0];
  const [baselineTasks] = await pool.query(
    "SELECT * FROM project_baseline_tasks WHERE baseline_id = ? ORDER BY outline_level, task_wbs, id",
    [baseline.id]
  );
  const [liveTasks] = await pool.query(
    `SELECT id, projeto, data_inicio_planej, data_inicio_planej_date, data_fim_planej, data_fim_planej_date,
            data_inicio_real, data_inicio_real_date, data_fim_real, data_fim_real_date,
            esforco_real, valor_gasto, percentual, esforco_planej, valor_previsto
       FROM tarefas
      WHERE projeto = ?
      ORDER BY sort_order, id`,
    [project.projeto]
  );

  return buildWeeklyCurve(project, baseline, baselineTasks, liveTasks, normalizedMetric);
}

module.exports = {
  BASELINE_SOURCE_TYPES,
  BASELINE_STATUSES,
  CURVE_METRICS,
  createError,
  mapBaseline,
  createProjectBaseline,
  approveProjectBaseline,
  rejectProjectBaseline,
  listProjectBaselines,
  getProjectCurveSeries,
};
