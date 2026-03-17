const express = require("express");
const router = express.Router();
const { sanitizeString, sanitizeInt } = require("../utils/parsing");
const { logAudit } = require("../utils/audit");

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess } = auth;
  const { mapProduto } = require("../utils/mappers");
  const supabaseSync = require("../utils/supabaseSync");

  router.get("/", requireAuth, async (_req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM produtos ORDER BY nome");
      res.json(rows.map(mapProduto));
    } catch (err) {
      console.error("Error fetching produtos:", err);
      res.status(500).json({ error: "Erro ao buscar produtos", code: "FETCH_PRODUTOS" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const businessUnitId = sanitizeInt(req.body.businessUnitId);
      if (!businessUnitId) return res.status(400).json({ error: "Business Unit é obrigatória", code: "BUSINESS_UNIT_REQUIRED" });
      const [businessUnits] = await pool.query("SELECT id, nome FROM business_units WHERE id = ?", [businessUnitId]);
      if (!businessUnits.length) return res.status(400).json({ error: "Business Unit inválida", code: "BUSINESS_UNIT_INVALID" });

      const [result] = await pool.query(
        "INSERT INTO produtos (nome, business_unit_id, business_unit_nome) VALUES (?, ?, ?)",
        [
          sanitizeString(req.body.nome, 160),
          businessUnitId,
          businessUnits[0].nome,
        ]
      );
      const [rows] = await pool.query("SELECT * FROM produtos WHERE id = ?", [result.insertId]);
      await supabaseSync.syncProduto(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "produto",
        entityId: String(result.insertId),
        summary: `Produto ${rows[0].nome} criado`,
        after: rows[0],
      });
      res.status(201).json(mapProduto(rows[0]));
    } catch (err) {
      console.error("Error creating produto:", err);
      res.status(500).json({ error: "Erro ao criar produto", code: "CREATE_PRODUTO" });
    }
  });

  router.put("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const businessUnitId = sanitizeInt(req.body.businessUnitId);
      if (!businessUnitId) return res.status(400).json({ error: "Business Unit é obrigatória", code: "BUSINESS_UNIT_REQUIRED" });
      const [currentRows] = await pool.query("SELECT * FROM produtos WHERE id = ?", [req.params.id]);
      if (!currentRows.length) return res.status(404).json({ error: "Produto não encontrado", code: "PRODUTO_NOT_FOUND" });
      const [businessUnits] = await pool.query("SELECT id, nome FROM business_units WHERE id = ?", [businessUnitId]);
      if (!businessUnits.length) return res.status(400).json({ error: "Business Unit inválida", code: "BUSINESS_UNIT_INVALID" });
      const [linkedProjects] = await pool.query("SELECT COUNT(*) as total FROM projetos WHERE produto_id = ?", [req.params.id]);
      if (Number(linkedProjects[0]?.total || 0) > 0 && Number(currentRows[0].business_unit_id) !== businessUnitId) {
        return res.status(400).json({
          error: "Não é possível trocar a unidade de negócio de um produto já vinculado a projetos",
          code: "PRODUTO_BU_CHANGE_DENIED",
        });
      }

      await pool.query(
        "UPDATE produtos SET nome=?, business_unit_id=?, business_unit_nome=? WHERE id=?",
        [
          sanitizeString(req.body.nome, 160),
          businessUnitId,
          businessUnits[0].nome,
          req.params.id,
        ]
      );
      const [rows] = await pool.query("SELECT * FROM produtos WHERE id = ?", [req.params.id]);
      await pool.query(
        "UPDATE projetos SET produto_nome = ? WHERE produto_id = ?",
        [rows[0].nome, req.params.id],
      );
      await supabaseSync.syncProduto(rows[0]);
      const [projectRows] = await pool.query("SELECT * FROM projetos WHERE produto_id = ?", [req.params.id]);
      await Promise.all(projectRows.map((row) => supabaseSync.syncProjeto(row)));
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "produto",
        entityId: String(req.params.id),
        summary: `Produto ${rows[0].nome} atualizado`,
        before: currentRows[0],
        after: rows[0],
      });
      res.json(mapProduto(rows[0]));
    } catch (err) {
      console.error("Error updating produto:", err);
      res.status(500).json({ error: "Erro ao atualizar produto", code: "UPDATE_PRODUTO" });
    }
  });

  router.delete("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const [linkedProjects] = await pool.query("SELECT COUNT(*) as total FROM projetos WHERE produto_id = ?", [req.params.id]);
      if (Number(linkedProjects[0]?.total || 0) > 0) {
        return res.status(400).json({ error: "Existem projetos vinculados a este produto", code: "PRODUTO_IN_USE" });
      }
      const [existingRows] = await pool.query("SELECT * FROM produtos WHERE id = ?", [req.params.id]);
      const [result] = await pool.query("DELETE FROM produtos WHERE id = ?", [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ error: "Produto não encontrado", code: "PRODUTO_NOT_FOUND" });
      await supabaseSync.deleteProduto(req.params.id);
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "produto",
        entityId: String(req.params.id),
        summary: `Produto ${existingRows[0]?.nome || req.params.id} removido`,
        before: existingRows[0] || null,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting produto:", err);
      res.status(500).json({ error: "Erro ao excluir produto", code: "DELETE_PRODUTO" });
    }
  });

  return router;
};
