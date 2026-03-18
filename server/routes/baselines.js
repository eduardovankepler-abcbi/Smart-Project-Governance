const express = require("express");
const router = express.Router();
const { sanitizeInt, sanitizeString } = require("../utils/parsing");
const { ROLES } = require("../utils/auth");
const {
  CURVE_METRICS,
  createProjectBaseline,
  approveProjectBaseline,
  rejectProjectBaseline,
  listProjectBaselines,
  getProjectCurveSeries,
} = require("../utils/baselines");

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectIdsFilter } = auth;

  async function ensureProjectAccess(user, projectId) {
    const access = await getAccessibleProjectIdsFilter(user);
    if (!access.all && !access.projectIds.includes(Number(projectId))) {
      throw Object.assign(new Error("Sem acesso a este projeto"), {
        status: 403,
        code: "BASELINE_PROJECT_ACCESS_DENIED",
      });
    }
  }

  router.get("/", requireAuth, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.query.projectId);
      if (projectId) await ensureProjectAccess(req.authUser, projectId);
      const access = await getAccessibleProjectIdsFilter(req.authUser);
      const rows = await listProjectBaselines(pool, {
        all: access.all,
        projectIds: access.projectIds,
        projectId: projectId || undefined,
      });
      res.json(rows);
    } catch (error) {
      console.error("Error listing baselines:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao buscar baselines", code: error.code || "FETCH_BASELINES" });
    }
  });

  router.get("/curve-s", requireAuth, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.query.projectId);
      const baselineId = sanitizeInt(req.query.baselineId);
      const metric = sanitizeString(req.query.metric, 20).toLowerCase();
      if (!projectId) {
        return res.status(400).json({ error: "Projeto é obrigatório", code: "CURVE_PROJECT_REQUIRED" });
      }
      await ensureProjectAccess(req.authUser, projectId);
      const curve = await getProjectCurveSeries(pool, {
        projectId,
        baselineId: baselineId || undefined,
        metric: Object.values(CURVE_METRICS).includes(metric) ? metric : CURVE_METRICS.EFFORT,
      });
      res.json(curve);
    } catch (error) {
      console.error("Error building S-curve:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao gerar curva S", code: error.code || "FETCH_CURVE_S" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.body?.projectId);
      if (!projectId) {
        return res.status(400).json({ error: "Projeto é obrigatório", code: "BASELINE_PROJECT_REQUIRED" });
      }
      await ensureProjectAccess(req.authUser, projectId);
      const baseline = await createProjectBaseline(pool, {
        projectId,
        sourceType: req.body?.sourceType,
        baselineName: req.body?.baselineName,
        justification: req.body?.justification,
        actor: req.authUser,
      });
      res.status(201).json(baseline);
    } catch (error) {
      console.error("Error creating baseline:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao criar baseline", code: error.code || "CREATE_BASELINE" });
    }
  });

  router.post("/:id/approve", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      if (req.authUser.role !== ROLES.ADMIN) {
        return res.status(403).json({ error: "Apenas administradores podem aprovar baselines", code: "BASELINE_APPROVE_DENIED" });
      }
      const baseline = await approveProjectBaseline(pool, req.params.id, req.authUser, req.body?.approvalNotes);
      res.json(baseline);
    } catch (error) {
      console.error("Error approving baseline:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao aprovar baseline", code: error.code || "APPROVE_BASELINE" });
    }
  });

  router.post("/:id/reject", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      if (req.authUser.role !== ROLES.ADMIN) {
        return res.status(403).json({ error: "Apenas administradores podem rejeitar baselines", code: "BASELINE_REJECT_DENIED" });
      }
      const baseline = await rejectProjectBaseline(pool, req.params.id, req.authUser, req.body?.approvalNotes);
      res.json(baseline);
    } catch (error) {
      console.error("Error rejecting baseline:", error);
      res.status(error.status || 500).json({ error: error.message || "Erro ao rejeitar baseline", code: error.code || "REJECT_BASELINE" });
    }
  });

  return router;
};
