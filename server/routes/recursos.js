const express = require("express");
const router = express.Router();
const { sanitizeString, sanitizeNumber } = require("../utils/parsing");
const { logAudit } = require("../utils/audit");

function stringifySpecialties(value) {
  if (!value) return "[]";
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => sanitizeString(item, 100)).filter(Boolean));
  return JSON.stringify(
    String(value)
      .split(";")
      .map((item) => sanitizeString(item, 100))
      .filter(Boolean)
  );
}

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectNamesFilter } = auth;
  const { mapRecurso } = require("../utils/mappers");
  const supabaseSync = require("../utils/supabaseSync");

  router.get("/", requireAuth, async (req, res) => {
    try {
      if (req.authUser.role === "viewer") {
        if (!req.authUser.linkedResourceId) return res.json([]);
        const [rows] = await pool.query(
          "SELECT * FROM recursos WHERE id = ? ORDER BY nome",
          [req.authUser.linkedResourceId]
        );
        return res.json(rows.map((row) => ({ ...mapRecurso(row), id: row.id })));
      }
      if (req.authUser.role === "pmo") {
        const access = await getAccessibleProjectNamesFilter(req.authUser);
        const [rows] = await pool.query(
          `SELECT DISTINCT r.*
           FROM recursos r
           INNER JOIN task_assignments ta ON ta.resource_id = r.id
           INNER JOIN tarefas t ON t.id = ta.task_id
           WHERE t.projeto IN (?)
           ORDER BY r.nome`,
          [access.projectNames.length ? access.projectNames : ["__none__"]]
        );
        return res.json(rows.map((row) => ({ ...mapRecurso(row), id: row.id })));
      }
      const [rows] = await pool.query("SELECT * FROM recursos ORDER BY nome");
      res.json(rows.map((row) => ({ ...mapRecurso(row), id: row.id })));
    } catch (err) {
      console.error("Error fetching recursos:", err);
      res.status(500).json({ error: "Erro ao buscar recursos", code: "FETCH_RECURSOS" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const b = req.body;
      const [result] = await pool.query(
        `INSERT INTO recursos (external_id, nome, funcao, seniority, specialties_json, resource_type, initials, max_units, standard_rate, overtime_rate, email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sanitizeString(b.externalId, 50),
          sanitizeString(b.nome, 200),
          sanitizeString(b.funcao, 200),
          sanitizeString(b.seniority, 50),
          stringifySpecialties(b.specialties),
          sanitizeString(b.resourceType, 20) || "work",
          sanitizeString(b.initials, 20),
          sanitizeNumber(b.maxUnits, 1),
          sanitizeNumber(b.standardRate),
          sanitizeNumber(b.overtimeRate),
          sanitizeString(b.email, 200),
        ]
      );
      const [rows] = await pool.query("SELECT * FROM recursos WHERE id = ?", [result.insertId]);
      await supabaseSync.syncRecurso(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "recurso",
        entityId: String(result.insertId),
        summary: `Recurso ${rows[0].nome} criado`,
        after: rows[0],
      });
      res.status(201).json({ id: rows[0].id, ...mapRecurso(rows[0]) });
    } catch (err) {
      console.error("Error creating recurso:", err);
      res.status(500).json({ error: "Erro ao criar recurso", code: "CREATE_RECURSO" });
    }
  });

  router.put("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const b = req.body;
      const [beforeRows] = await pool.query("SELECT * FROM recursos WHERE id = ?", [req.params.id]);
      await pool.query(
        `UPDATE recursos
         SET external_id=?, nome=?, funcao=?, seniority=?, specialties_json=?, resource_type=?, initials=?, max_units=?, standard_rate=?, overtime_rate=?, email=?
         WHERE id=?`,
        [
          sanitizeString(b.externalId, 50),
          sanitizeString(b.nome, 200),
          sanitizeString(b.funcao, 200),
          sanitizeString(b.seniority, 50),
          stringifySpecialties(b.specialties),
          sanitizeString(b.resourceType, 20) || "work",
          sanitizeString(b.initials, 20),
          sanitizeNumber(b.maxUnits, 1),
          sanitizeNumber(b.standardRate),
          sanitizeNumber(b.overtimeRate),
          sanitizeString(b.email, 200),
          req.params.id,
        ]
      );
      const [rows] = await pool.query("SELECT * FROM recursos WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Recurso não encontrado" });
      await supabaseSync.syncRecurso(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "recurso",
        entityId: String(req.params.id),
        summary: `Recurso ${rows[0].nome} atualizado`,
        before: beforeRows[0] || null,
        after: rows[0],
      });
      res.json({ id: rows[0].id, ...mapRecurso(rows[0]) });
    } catch (err) {
      console.error("Error updating recurso:", err);
      res.status(500).json({ error: "Erro ao atualizar recurso", code: "UPDATE_RECURSO" });
    }
  });

  router.delete("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const [beforeRows] = await pool.query("SELECT * FROM recursos WHERE id = ?", [req.params.id]);
      await pool.query("DELETE FROM task_assignments WHERE resource_id = ?", [req.params.id]);
      const [result] = await pool.query("DELETE FROM recursos WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: "Recurso não encontrado" });
      await supabaseSync.deleteRecurso(req.params.id);
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "recurso",
        entityId: String(req.params.id),
        summary: `Recurso ${beforeRows[0]?.nome || req.params.id} removido`,
        before: beforeRows[0] || null,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting recurso:", err);
      res.status(500).json({ error: "Erro ao excluir recurso", code: "DELETE_RECURSO" });
    }
  });

  return router;
};
