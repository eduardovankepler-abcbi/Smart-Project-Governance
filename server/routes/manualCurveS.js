const express = require("express");
const router = express.Router();
const { sanitizeInt, sanitizeString } = require("../utils/parsing");
const {
  approveManualCurveSeries,
  createManualCurveSeries,
  generateProjectWeeklyDates,
  listManualCurveS,
  rejectManualCurveSeries,
  upsertManualCurveObservations,
  upsertManualCurvePoints,
} = require("../utils/manualCurveS");

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectIdsFilter } = auth;

  async function ensureProjectAccess(user, projectId) {
    const access = await getAccessibleProjectIdsFilter(user);
    if (!access.all && !access.projectIds.includes(Number(projectId))) {
      throw Object.assign(new Error("Sem acesso a este projeto"), {
        status: 403,
        code: "CURVE_S_PROJECT_ACCESS_DENIED",
      });
    }
  }

  async function loadSeriesProjectId(seriesId) {
    const [rows] = await pool.query("SELECT project_id FROM project_curve_s_series WHERE id = ? LIMIT 1", [sanitizeInt(seriesId)]);
    return rows[0]?.project_id || 0;
  }

  router.get("/", requireAuth, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.query.projectId);
      if (!projectId) return res.status(400).json({ error: "Projeto é obrigatório", code: "CURVE_S_PROJECT_REQUIRED" });
      await ensureProjectAccess(req.authUser, projectId);
      res.json(await listManualCurveS(pool, { projectId }));
    } catch (error) {
      console.error("Error listing manual S-curve:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao buscar Curva S manual", code: error.code || "FETCH_MANUAL_CURVE_S" });
    }
  });

  router.get("/weeks", requireAuth, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.query.projectId);
      if (!projectId) return res.status(400).json({ error: "Projeto é obrigatório", code: "CURVE_S_PROJECT_REQUIRED" });
      await ensureProjectAccess(req.authUser, projectId);
      const [rows] = await pool.query("SELECT * FROM projetos WHERE id = ? LIMIT 1", [projectId]);
      if (!rows.length) return res.status(404).json({ error: "Projeto não encontrado", code: "CURVE_S_PROJECT_NOT_FOUND" });
      res.json({ projectId, dates: generateProjectWeeklyDates(rows[0]) });
    } catch (error) {
      console.error("Error generating manual S-curve weeks:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao gerar semanas da Curva S", code: error.code || "GENERATE_CURVE_S_WEEKS" });
    }
  });

  router.post("/series", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.body?.projectId);
      if (!projectId) return res.status(400).json({ error: "Projeto é obrigatório", code: "CURVE_S_PROJECT_REQUIRED" });
      await ensureProjectAccess(req.authUser, projectId);
      const series = await createManualCurveSeries(pool, {
        projectId,
        seriesType: req.body?.seriesType,
        baselineNumber: req.body?.baselineNumber,
        seriesName: req.body?.seriesName,
        justification: req.body?.justification,
        actor: req.authUser,
      });
      res.status(201).json(series);
    } catch (error) {
      console.error("Error creating manual S-curve series:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao criar série da Curva S", code: error.code || "CREATE_MANUAL_CURVE_S_SERIES" });
    }
  });

  router.put("/series/:id/points", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const projectId = await loadSeriesProjectId(req.params.id);
      if (!projectId) return res.status(404).json({ error: "Série da Curva S não encontrada", code: "CURVE_S_SERIES_NOT_FOUND" });
      await ensureProjectAccess(req.authUser, projectId);
      const points = await upsertManualCurvePoints(pool, {
        seriesId: req.params.id,
        points: req.body?.points,
        actor: req.authUser,
      });
      res.json(points);
    } catch (error) {
      console.error("Error upserting manual S-curve points:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao salvar pontos da Curva S", code: error.code || "UPSERT_MANUAL_CURVE_S_POINTS" });
    }
  });

  router.put("/observations", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.body?.projectId);
      if (!projectId) return res.status(400).json({ error: "Projeto é obrigatório", code: "CURVE_S_PROJECT_REQUIRED" });
      await ensureProjectAccess(req.authUser, projectId);
      const observations = await upsertManualCurveObservations(pool, {
        projectId,
        observations: req.body?.observations,
        actor: req.authUser,
      });
      res.json(observations);
    } catch (error) {
      console.error("Error upserting manual S-curve observations:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao salvar observações da Curva S", code: error.code || "UPSERT_MANUAL_CURVE_S_OBSERVATIONS" });
    }
  });

  router.post("/series/:id/approve", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const projectId = await loadSeriesProjectId(req.params.id);
      if (!projectId) return res.status(404).json({ error: "Série da Curva S não encontrada", code: "CURVE_S_SERIES_NOT_FOUND" });
      await ensureProjectAccess(req.authUser, projectId);
      res.json(await approveManualCurveSeries(pool, req.params.id, req.authUser, req.body?.approvalNotes));
    } catch (error) {
      console.error("Error approving manual S-curve series:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao aprovar linha base da Curva S", code: error.code || "APPROVE_MANUAL_CURVE_S_SERIES" });
    }
  });

  router.post("/series/:id/reject", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const projectId = await loadSeriesProjectId(req.params.id);
      if (!projectId) return res.status(404).json({ error: "Série da Curva S não encontrada", code: "CURVE_S_SERIES_NOT_FOUND" });
      await ensureProjectAccess(req.authUser, projectId);
      res.json(await rejectManualCurveSeries(pool, req.params.id, req.authUser, req.body?.approvalNotes));
    } catch (error) {
      console.error("Error rejecting manual S-curve series:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao rejeitar linha base da Curva S", code: error.code || "REJECT_MANUAL_CURVE_S_SERIES" });
    }
  });

  return router;
};
