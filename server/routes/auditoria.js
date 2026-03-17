const express = require("express");
const router = express.Router();
const { sanitizeInt, sanitizeString } = require("../utils/parsing");

module.exports = function (pool, auth) {
  const { requireAuth, getAccessibleProjectIdsFilter } = auth;

  router.get("/", requireAuth, async (req, res) => {
    try {
      if (!["admin", "pmo"].includes(req.authUser.role)) {
        return res.status(403).json({ error: "Sem permissão para auditoria", code: "AUDIT_ACCESS_DENIED" });
      }

      const access = await getAccessibleProjectIdsFilter(req.authUser);
      const projectId = sanitizeInt(req.query.projectId);
      const entityType = sanitizeString(req.query.entityType, 50);
      const search = sanitizeString(req.query.search, 120);

      const conditions = [];
      const params = [];

      if (req.authUser.role === "pmo") {
        conditions.push("(a.project_id IN (?) OR a.actor_user_id = ?)");
        params.push(access.projectIds.length ? access.projectIds : [0], req.authUser.id);
      }
      if (projectId) {
        conditions.push("a.project_id = ?");
        params.push(projectId);
      }
      if (entityType) {
        conditions.push("a.entity_type = ?");
        params.push(entityType);
      }
      if (search) {
        conditions.push("(a.summary LIKE ? OR a.actor_nome LIKE ? OR a.entity_id LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await pool.query(
        `SELECT a.*
         FROM audit_logs a
         ${whereClause}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 500`,
        params,
      );

      res.json(rows.map((row) => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        actorUserId: row.actor_user_id || undefined,
        actorName: row.actor_nome || "",
        actorRole: row.actor_role || "",
        projectId: row.project_id || undefined,
        summary: row.summary || "",
        beforeJson: row.before_json || "",
        afterJson: row.after_json || "",
        createdAt: row.created_at,
      })));
    } catch (err) {
      console.error("Error fetching auditoria:", err);
      res.status(500).json({ error: "Erro ao buscar auditoria", code: "FETCH_AUDITORIA" });
    }
  });

  return router;
};
