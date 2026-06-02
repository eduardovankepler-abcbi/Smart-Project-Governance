const { ROLES } = require("./auth");
const { logAudit } = require("./audit");
const { normalizeDateInput, sanitizeInt, sanitizeNumber, sanitizeString } = require("./parsing");

const SERIES_TYPES = {
  BASELINE: "baseline",
  ACTUAL: "actual",
};

const SERIES_STATUSES = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const MAX_BASELINES = 10;

function createError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapSeries(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    seriesType: row.series_type,
    baselineNumber: row.baseline_number,
    seriesName: row.series_name,
    status: row.status,
    isOfficial: !!row.is_official,
    justification: row.justification || "",
    approvalNotes: row.approval_notes || "",
    createdByUserId: row.created_by_user_id || undefined,
    createdByName: row.created_by_name || "",
    createdByRole: row.created_by_role || "",
    approvedByUserId: row.approved_by_user_id || undefined,
    approvedByName: row.approved_by_name || "",
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function mapPoint(row) {
  return {
    id: row.id,
    seriesId: row.series_id,
    projectId: row.project_id,
    date: row.curve_date instanceof Date ? row.curve_date.toISOString().slice(0, 10) : String(row.curve_date || ""),
    percent: Number(row.percent_value || 0),
  };
}

function mapObservation(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    date: row.curve_date instanceof Date ? row.curve_date.toISOString().slice(0, 10) : String(row.curve_date || ""),
    observation: row.observation || "",
    createdByUserId: row.created_by_user_id || undefined,
    createdByName: row.created_by_name || "",
  };
}

function parseProjectDate(row, ...keys) {
  for (const key of keys) {
    const normalized = normalizeDateInput(row[key]);
    if (normalized) return normalized;
  }
  return "";
}

function utcDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function nextMonday(date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  const offset = day === 1 ? 0 : (8 - day) % 7;
  result.setUTCDate(result.getUTCDate() + offset);
  return result;
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function generateWeeklyDates(startValue, endValue) {
  const start = utcDate(startValue);
  const end = utcDate(endValue);
  if (!start || !end) return [];
  const dates = [];
  for (let cursor = nextMonday(start); cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 7)) {
    dates.push(toIsoDate(cursor));
  }
  if (!dates.length) dates.push(toIsoDate(nextMonday(start)));
  return dates;
}

function normalizePercent(value) {
  const number = sanitizeNumber(value, 0);
  const percent = number > 0 && number <= 1 ? number * 100 : number;
  return Math.min(100, Math.max(0, Number(percent.toFixed(2))));
}

function normalizePointInput(point) {
  const date = normalizeDateInput(point?.date || point?.curveDate || point?.curve_date);
  if (!date) throw createError(400, "Data é obrigatória em todos os pontos da Curva S", "CURVE_S_DATE_REQUIRED");
  return {
    date,
    percent: normalizePercent(point?.percent ?? point?.percentValue ?? point?.percent_value),
  };
}

function normalizeObservationInput(item) {
  const date = normalizeDateInput(item?.date || item?.curveDate || item?.curve_date);
  if (!date) throw createError(400, "Data é obrigatória em todas as observações da Curva S", "CURVE_S_OBSERVATION_DATE_REQUIRED");
  return {
    date,
    observation: sanitizeString(item?.observation, 255),
  };
}

async function getProjectOrThrow(connection, projectId) {
  const normalizedProjectId = sanitizeInt(projectId);
  if (!normalizedProjectId) throw createError(400, "Projeto é obrigatório", "CURVE_S_PROJECT_REQUIRED");
  const [rows] = await connection.query("SELECT * FROM projetos WHERE id = ? LIMIT 1", [normalizedProjectId]);
  if (!rows.length) throw createError(404, "Projeto não encontrado", "CURVE_S_PROJECT_NOT_FOUND");
  return rows[0];
}

async function listManualCurveS(pool, { projectId }) {
  const project = await getProjectOrThrow(pool, projectId);
  const [seriesRows] = await pool.query(
    `SELECT * FROM project_curve_s_series
      WHERE project_id = ?
      ORDER BY series_type, baseline_number, id`,
    [project.id]
  );
  const [pointRows] = await pool.query(
    `SELECT * FROM project_curve_s_points
      WHERE project_id = ?
      ORDER BY curve_date, series_id`,
    [project.id]
  );
  const [observationRows] = await pool.query(
    `SELECT * FROM project_curve_s_observations
      WHERE project_id = ?
      ORDER BY curve_date`,
    [project.id]
  );

  return {
    projectId: project.id,
    projectName: project.projeto,
    defaultDates: generateProjectWeeklyDates(project),
    series: seriesRows.map(mapSeries),
    points: pointRows.map(mapPoint),
    observations: observationRows.map(mapObservation),
    limits: { maxBaselines: MAX_BASELINES, observationMaxLength: 255 },
  };
}

function generateProjectWeeklyDates(project) {
  const start = parseProjectDate(project, "data_inicio_planej_date", "data_inicio_planej", "data_inicio");
  const finish = parseProjectDate(project, "data_fim_planej_date", "data_fim_planej", "data_fim_real");
  return generateWeeklyDates(start, finish);
}

async function createManualCurveSeries(pool, { projectId, seriesType, baselineNumber, seriesName, justification, actor }) {
  const project = await getProjectOrThrow(pool, projectId);
  const normalizedType = sanitizeString(seriesType, 20).toLowerCase() === SERIES_TYPES.ACTUAL ? SERIES_TYPES.ACTUAL : SERIES_TYPES.BASELINE;
  const normalizedBaselineNumber = normalizedType === SERIES_TYPES.ACTUAL ? 0 : sanitizeInt(baselineNumber);

  if (normalizedType === SERIES_TYPES.BASELINE) {
    if (normalizedBaselineNumber < 1 || normalizedBaselineNumber > MAX_BASELINES) {
      throw createError(400, `Informe uma linha base entre 1 e ${MAX_BASELINES}`, "CURVE_S_BASELINE_NUMBER_INVALID");
    }
  }

  const status = normalizedType === SERIES_TYPES.ACTUAL
    ? SERIES_STATUSES.APPROVED
    : actor?.role === ROLES.ADMIN
      ? SERIES_STATUSES.APPROVED
      : SERIES_STATUSES.PENDING_APPROVAL;

  const finalName = sanitizeString(seriesName, 120) ||
    (normalizedType === SERIES_TYPES.ACTUAL ? "Realizado" : `Linha Base ${normalizedBaselineNumber}`);

  const [existing] = await pool.query(
    "SELECT id FROM project_curve_s_series WHERE project_id = ? AND series_type = ? AND baseline_number = ? LIMIT 1",
    [project.id, normalizedType, normalizedBaselineNumber]
  );
  if (existing.length) {
    throw createError(409, "Esta série da Curva S já existe para o projeto", "CURVE_S_SERIES_EXISTS");
  }

  const [result] = await pool.query(
    `INSERT INTO project_curve_s_series
      (project_id, series_type, baseline_number, series_name, status, is_official, justification,
       created_by_user_id, created_by_name, created_by_role, approved_by_user_id, approved_by_name, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      normalizedType,
      normalizedBaselineNumber,
      finalName,
      status,
      status === SERIES_STATUSES.APPROVED && normalizedType === SERIES_TYPES.BASELINE && normalizedBaselineNumber === 1 ? 1 : 0,
      sanitizeString(justification, 1000),
      actor?.id || null,
      actor?.nome || "Sistema",
      actor?.role || "system",
      status === SERIES_STATUSES.APPROVED ? actor?.id || null : null,
      status === SERIES_STATUSES.APPROVED ? actor?.nome || "Sistema" : null,
      status === SERIES_STATUSES.APPROVED ? new Date() : null,
    ]
  );
  const [rows] = await pool.query("SELECT * FROM project_curve_s_series WHERE id = ?", [result.insertId]);
  await logAudit(pool, {
    actor,
    action: "create",
    entityType: "manual_curve_s_series",
    entityId: String(result.insertId),
    projectId: project.id,
    summary: `Série manual da Curva S criada: ${finalName}`,
    after: rows[0],
  });
  return mapSeries(rows[0]);
}

async function upsertManualCurvePoints(pool, { seriesId, points, actor }) {
  const normalizedSeriesId = sanitizeInt(seriesId);
  if (!normalizedSeriesId) throw createError(400, "Série é obrigatória", "CURVE_S_SERIES_REQUIRED");
  const [seriesRows] = await pool.query("SELECT * FROM project_curve_s_series WHERE id = ? LIMIT 1", [normalizedSeriesId]);
  if (!seriesRows.length) throw createError(404, "Série da Curva S não encontrada", "CURVE_S_SERIES_NOT_FOUND");
  const series = seriesRows[0];
  const normalizedPoints = (Array.isArray(points) ? points : []).map(normalizePointInput);
  if (!normalizedPoints.length) throw createError(400, "Informe ao menos um ponto da Curva S", "CURVE_S_POINTS_REQUIRED");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const point of normalizedPoints) {
      await connection.query(
        `INSERT INTO project_curve_s_points (series_id, project_id, curve_date, percent_value)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE percent_value = VALUES(percent_value), updated_at = CURRENT_TIMESTAMP`,
        [series.id, series.project_id, point.date, point.percent]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logAudit(pool, {
    actor,
    action: "update",
    entityType: "manual_curve_s_points",
    entityId: String(series.id),
    projectId: series.project_id,
    summary: `Pontos da Curva S manual atualizados para ${series.series_name}`,
    after: normalizedPoints,
  });
  const [rows] = await pool.query("SELECT * FROM project_curve_s_points WHERE series_id = ? ORDER BY curve_date", [series.id]);
  return rows.map(mapPoint);
}

async function upsertManualCurveObservations(pool, { projectId, observations, actor }) {
  const project = await getProjectOrThrow(pool, projectId);
  const normalizedObservations = (Array.isArray(observations) ? observations : []).map(normalizeObservationInput);
  if (!normalizedObservations.length) throw createError(400, "Informe ao menos uma observação da Curva S", "CURVE_S_OBSERVATIONS_REQUIRED");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of normalizedObservations) {
      await connection.query(
        `INSERT INTO project_curve_s_observations
          (project_id, curve_date, observation, created_by_user_id, created_by_name)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE observation = VALUES(observation), updated_at = CURRENT_TIMESTAMP`,
        [project.id, item.date, item.observation, actor?.id || null, actor?.nome || "Sistema"]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logAudit(pool, {
    actor,
    action: "update",
    entityType: "manual_curve_s_observations",
    entityId: String(project.id),
    projectId: project.id,
    summary: "Observações da Curva S manual atualizadas",
    after: normalizedObservations,
  });
  const [rows] = await pool.query("SELECT * FROM project_curve_s_observations WHERE project_id = ? ORDER BY curve_date", [project.id]);
  return rows.map(mapObservation);
}

async function approveManualCurveSeries(pool, seriesId, actor, approvalNotes = "") {
  if (actor?.role !== ROLES.ADMIN) throw createError(403, "Apenas administradores podem aprovar linhas base da Curva S", "CURVE_S_APPROVE_DENIED");
  const normalizedSeriesId = sanitizeInt(seriesId);
  const [rows] = await pool.query("SELECT * FROM project_curve_s_series WHERE id = ? LIMIT 1", [normalizedSeriesId]);
  if (!rows.length) throw createError(404, "Série da Curva S não encontrada", "CURVE_S_SERIES_NOT_FOUND");
  const current = rows[0];
  if (current.series_type !== SERIES_TYPES.BASELINE) throw createError(400, "Apenas linhas base exigem aprovação", "CURVE_S_APPROVE_BASELINE_ONLY");

  await pool.query(
    `UPDATE project_curve_s_series
        SET status = 'approved', approval_notes = ?, approved_by_user_id = ?, approved_by_name = ?, approved_at = NOW()
      WHERE id = ?`,
    [sanitizeString(approvalNotes, 1000), actor.id || null, actor.nome || "Sistema", current.id]
  );
  const [updated] = await pool.query("SELECT * FROM project_curve_s_series WHERE id = ?", [current.id]);
  await logAudit(pool, {
    actor,
    action: "approve",
    entityType: "manual_curve_s_series",
    entityId: String(current.id),
    projectId: current.project_id,
    summary: `Linha base manual aprovada: ${current.series_name}`,
    before: current,
    after: updated[0],
  });
  return mapSeries(updated[0]);
}

async function rejectManualCurveSeries(pool, seriesId, actor, approvalNotes = "") {
  if (actor?.role !== ROLES.ADMIN) throw createError(403, "Apenas administradores podem rejeitar linhas base da Curva S", "CURVE_S_REJECT_DENIED");
  const normalizedSeriesId = sanitizeInt(seriesId);
  const [rows] = await pool.query("SELECT * FROM project_curve_s_series WHERE id = ? LIMIT 1", [normalizedSeriesId]);
  if (!rows.length) throw createError(404, "Série da Curva S não encontrada", "CURVE_S_SERIES_NOT_FOUND");
  const current = rows[0];
  if (current.series_type !== SERIES_TYPES.BASELINE) throw createError(400, "Apenas linhas base exigem aprovação", "CURVE_S_REJECT_BASELINE_ONLY");

  await pool.query(
    `UPDATE project_curve_s_series
        SET status = 'rejected', approval_notes = ?, approved_by_user_id = ?, approved_by_name = ?, approved_at = NOW()
      WHERE id = ?`,
    [sanitizeString(approvalNotes, 1000), actor.id || null, actor.nome || "Sistema", current.id]
  );
  const [updated] = await pool.query("SELECT * FROM project_curve_s_series WHERE id = ?", [current.id]);
  await logAudit(pool, {
    actor,
    action: "reject",
    entityType: "manual_curve_s_series",
    entityId: String(current.id),
    projectId: current.project_id,
    summary: `Linha base manual rejeitada: ${current.series_name}`,
    before: current,
    after: updated[0],
  });
  return mapSeries(updated[0]);
}

async function deleteManualCurveSeries(pool, seriesId, actor) {
  const normalizedSeriesId = sanitizeInt(seriesId);
  if (!normalizedSeriesId) throw createError(400, "Série é obrigatória", "CURVE_S_SERIES_REQUIRED");
  const [rows] = await pool.query("SELECT * FROM project_curve_s_series WHERE id = ? LIMIT 1", [normalizedSeriesId]);
  if (!rows.length) throw createError(404, "Série da Curva S não encontrada", "CURVE_S_SERIES_NOT_FOUND");
  const current = rows[0];

  await pool.query("DELETE FROM project_curve_s_series WHERE id = ?", [current.id]);
  await logAudit(pool, {
    actor,
    action: "delete",
    entityType: "manual_curve_s_series",
    entityId: String(current.id),
    projectId: current.project_id,
    summary: `Série manual da Curva S excluída: ${current.series_name}`,
    before: current,
  });
  return { deleted: true, id: current.id };
}

async function deleteManualCurveDate(pool, { projectId, date, actor }) {
  const project = await getProjectOrThrow(pool, projectId);
  const normalizedDate = normalizeDateInput(date);
  if (!normalizedDate) throw createError(400, "Data é obrigatória", "CURVE_S_DATE_REQUIRED");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM project_curve_s_points WHERE project_id = ? AND curve_date = ?", [project.id, normalizedDate]);
    await connection.query("DELETE FROM project_curve_s_observations WHERE project_id = ? AND curve_date = ?", [project.id, normalizedDate]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logAudit(pool, {
    actor,
    action: "delete",
    entityType: "manual_curve_s_date",
    entityId: `${project.id}:${normalizedDate}`,
    projectId: project.id,
    summary: `Data removida da Curva S manual: ${normalizedDate}`,
    before: { projectId: project.id, date: normalizedDate },
  });
  return { deleted: true, projectId: project.id, date: normalizedDate };
}

module.exports = {
  SERIES_TYPES,
  SERIES_STATUSES,
  MAX_BASELINES,
  createError,
  generateWeeklyDates,
  normalizePercent,
  mapSeries,
  mapPoint,
  mapObservation,
  generateProjectWeeklyDates,
  listManualCurveS,
  createManualCurveSeries,
  upsertManualCurvePoints,
  upsertManualCurveObservations,
  approveManualCurveSeries,
  rejectManualCurveSeries,
  deleteManualCurveSeries,
  deleteManualCurveDate,
};
