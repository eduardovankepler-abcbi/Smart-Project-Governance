const express = require("express");
const router = express.Router();
const { sanitizeString } = require("../utils/parsing");
const { logAudit } = require("../utils/audit");

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess } = auth;
  const { mapBusinessUnit } = require("../utils/mappers");
  const supabaseSync = require("../utils/supabaseSync");

  router.get("/", requireAuth, async (_req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM business_units ORDER BY nome");
      res.json(rows.map(mapBusinessUnit));
    } catch (err) {
      console.error("Error fetching business units:", err);
      res.status(500).json({ error: "Erro ao buscar business units", code: "FETCH_BUSINESS_UNITS" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const b = req.body;
      const [result] = await pool.query(
        "INSERT INTO business_units (nome, head, lider_tec, lider_op, comercial) VALUES (?, ?, ?, ?, ?)",
        [
          sanitizeString(b.nome, 120),
          sanitizeString(b.head, 120),
          sanitizeString(b.liderTec, 120),
          sanitizeString(b.liderOp, 120),
          sanitizeString(b.comercial, 120),
        ]
      );
      const [rows] = await pool.query("SELECT * FROM business_units WHERE id = ?", [result.insertId]);
      await supabaseSync.syncBusinessUnit(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "business_unit",
        entityId: String(result.insertId),
        summary: `Unidade de negócio ${rows[0].nome} criada`,
        after: rows[0],
      });
      res.status(201).json(mapBusinessUnit(rows[0]));
    } catch (err) {
      console.error("Error creating business unit:", err);
      res.status(500).json({ error: "Erro ao criar business unit", code: "CREATE_BUSINESS_UNIT" });
    }
  });

  router.put("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const b = req.body;
      const [beforeRows] = await conn.query("SELECT * FROM business_units WHERE id = ?", [req.params.id]);
      await conn.beginTransaction();
      await conn.query(
        "UPDATE business_units SET nome=?, head=?, lider_tec=?, lider_op=?, comercial=? WHERE id=?",
        [
          sanitizeString(b.nome, 120),
          sanitizeString(b.head, 120),
          sanitizeString(b.liderTec, 120),
          sanitizeString(b.liderOp, 120),
          sanitizeString(b.comercial, 120),
          req.params.id,
        ]
      );
      const [rows] = await conn.query("SELECT * FROM business_units WHERE id = ?", [req.params.id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ error: "Business unit não encontrada" });
      }
      await conn.query(
        "UPDATE projetos SET business_unit_nome = ? WHERE business_unit_id = ?",
        [rows[0].nome, req.params.id]
      );
      await conn.query(
        "UPDATE produtos SET business_unit_nome = ? WHERE business_unit_id = ?",
        [rows[0].nome, req.params.id]
      );
      await conn.commit();

      await supabaseSync.syncBusinessUnit(rows[0]);
      const [projectRows] = await pool.query("SELECT * FROM projetos WHERE business_unit_id = ?", [req.params.id]);
      const [productRows] = await pool.query("SELECT * FROM produtos WHERE business_unit_id = ?", [req.params.id]);
      await Promise.all(projectRows.map((row) => supabaseSync.syncProjeto(row)));
      await Promise.all(productRows.map((row) => supabaseSync.syncProduto(row)));
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "business_unit",
        entityId: String(req.params.id),
        summary: `Unidade de negócio ${rows[0].nome} atualizada`,
        before: beforeRows[0] || null,
        after: rows[0],
      });
      res.json(mapBusinessUnit(rows[0]));
    } catch (err) {
      await conn.rollback();
      console.error("Error updating business unit:", err);
      res.status(500).json({ error: "Erro ao atualizar business unit", code: "UPDATE_BUSINESS_UNIT" });
    } finally {
      conn.release();
    }
  });

  router.delete("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const [linkedProjects] = await pool.query("SELECT COUNT(*) as total FROM projetos WHERE business_unit_id = ?", [req.params.id]);
      if (linkedProjects[0].total > 0) {
        return res.status(400).json({ error: "Existem projetos vinculados a esta business unit", code: "BUSINESS_UNIT_IN_USE" });
      }
      const [linkedProducts] = await pool.query("SELECT COUNT(*) as total FROM produtos WHERE business_unit_id = ?", [req.params.id]);
      if (linkedProducts[0].total > 0) {
        return res.status(400).json({ error: "Existem produtos vinculados a esta business unit", code: "BUSINESS_UNIT_PRODUCTS_IN_USE" });
      }
      const [existingRows] = await pool.query("SELECT * FROM business_units WHERE id = ?", [req.params.id]);
      const [result] = await pool.query("DELETE FROM business_units WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: "Business unit não encontrada" });
      await supabaseSync.deleteBusinessUnit(req.params.id);
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "business_unit",
        entityId: String(req.params.id),
        summary: `Unidade de negócio ${existingRows[0]?.nome || req.params.id} removida`,
        before: existingRows[0] || null,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting business unit:", err);
      res.status(500).json({ error: "Erro ao excluir business unit", code: "DELETE_BUSINESS_UNIT" });
    }
  });

  return router;
};
