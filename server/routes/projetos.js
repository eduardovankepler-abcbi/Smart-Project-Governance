const express = require("express");
const router = express.Router();
const { sanitizeString, sanitizeNumber, sanitizeInt, normalizeDateInput } = require("../utils/parsing");
const { logAudit } = require("../utils/audit");

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectIdsFilter } = auth;
  const { mapProjeto } = require("../utils/mappers");
  const supabaseSync = require("../utils/supabaseSync");

  function buildProjectCode(inputCode, nomeProjeto) {
    const explicit = sanitizeString(inputCode, 50).toUpperCase();
    if (explicit) return explicit;
    const normalized = sanitizeString(nomeProjeto, 50)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `PRJ-${normalized || Date.now()}`;
  }

  async function resolveProduto(inputProdutoId, businessUnitId) {
    const produtoId = sanitizeInt(inputProdutoId);
    if (!produtoId) return { produtoId: null, produtoNome: "" };
    const [produtos] = await pool.query("SELECT id, nome, business_unit_id FROM produtos WHERE id = ?", [produtoId]);
    if (!produtos.length) {
      return { error: { status: 400, payload: { error: "Produto inválido", code: "PRODUTO_INVALIDO" } } };
    }
    if (Number(produtos[0].business_unit_id) !== Number(businessUnitId)) {
      return { error: { status: 400, payload: { error: "O produto deve pertencer à mesma Business Unit do projeto", code: "PRODUTO_BUSINESS_UNIT_MISMATCH" } } };
    }
    return { produtoId, produtoNome: produtos[0].nome };
  }

  router.get("/", requireAuth, async (req, res) => {
    try {
      const access = await getAccessibleProjectIdsFilter(req.authUser);
      const query = access.all
        ? "SELECT * FROM projetos ORDER BY id"
        : "SELECT * FROM projetos WHERE id IN (?) ORDER BY id";
      const params = access.all ? [] : [access.projectIds.length ? access.projectIds : [0]];
      const [rows] = await pool.query(query, params);
      res.json(rows.map(mapProjeto));
    } catch (err) {
      console.error("Error fetching projetos:", err);
      res.status(500).json({ error: "Erro ao buscar projetos", code: "FETCH_PROJETOS" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      if (req.authUser.role === "pmo") {
        return res.status(403).json({ error: "PMO não pode criar projetos sem atribuição do administrador", code: "PMO_PROJECT_CREATE_DENIED" });
      }
      const b = req.body;
      const projectCode = buildProjectCode(b.projectId, b.projeto);
      const businessUnitId = sanitizeInt(b.businessUnitId);
      if (!businessUnitId) return res.status(400).json({ error: "Business Unit é obrigatória", code: "BUSINESS_UNIT_REQUIRED" });
      const [businessUnits] = await pool.query("SELECT id, nome FROM business_units WHERE id = ?", [businessUnitId]);
      if (!businessUnits.length) return res.status(400).json({ error: "Business Unit inválida", code: "BUSINESS_UNIT_INVALID" });
      const produto = await resolveProduto(b.produtoId, businessUnitId);
      if (produto.error) return res.status(produto.error.status).json(produto.error.payload);
      const dataInicioPlanej = sanitizeString(b.dataInicioPlanej, 20);
      const dataFimPlanej = sanitizeString(b.dataFimPlanej, 20);
      const dataInicioReal = sanitizeString(b.dataInicio, 20);
      const dataFimReal = sanitizeString(b.dataFimReal, 50);
      const [result] = await pool.query(
        `INSERT INTO projetos (project_code, project_type, business_unit_id, business_unit_nome, produto_id, produto_nome, projeto, descricao, prioridade, responsavel, ftes, valor_previsto, valor_gasto, data_inicio_planej, data_inicio_planej_date, data_fim_planej, data_fim_planej_date, data_inicio, data_inicio_real_date, data_fim_real, data_fim_real_date, total_tarefas, tarefas_concluidas, tarefas_andamento, tarefas_atrasadas, tarefas_nao_iniciadas, status, conclusao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectCode,
          sanitizeString(b.projectType, 30) || "Projeto",
          businessUnitId,
          businessUnits[0].nome,
          produto.produtoId,
          produto.produtoNome,
          sanitizeString(b.projeto, 200),
          sanitizeString(b.descricao, 500),
          sanitizeString(b.prioridade, 50),
          sanitizeString(b.responsavel, 200),
          sanitizeNumber(b.ftes),
          sanitizeNumber(b.valorPrevisto),
          sanitizeNumber(b.valorGasto),
          dataInicioPlanej,
          normalizeDateInput(dataInicioPlanej) || null,
          dataFimPlanej,
          normalizeDateInput(dataFimPlanej) || null,
          dataInicioReal,
          normalizeDateInput(dataInicioReal) || null,
          dataFimReal,
          normalizeDateInput(dataFimReal) || null,
          sanitizeInt(b.totalTarefas),
          sanitizeInt(b.tarefasConcluidas),
          sanitizeInt(b.tarefasAndamento),
          sanitizeInt(b.tarefasAtrasadas),
          sanitizeInt(b.tarefasNaoIniciadas),
          sanitizeString(b.status, 50),
          sanitizeNumber(b.conclusao),
        ]
      );
      const [rows] = await pool.query("SELECT * FROM projetos WHERE id = ?", [result.insertId]);
      await supabaseSync.syncProjeto(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "projeto",
        entityId: String(result.insertId),
        projectId: result.insertId,
        summary: `Projeto ${rows[0].projeto} criado`,
        after: rows[0],
      });
      res.status(201).json(mapProjeto(rows[0]));
    } catch (err) {
      console.error("Error creating projeto:", err);
      res.status(500).json({ error: "Erro ao criar projeto", code: "CREATE_PROJETO" });
    }
  });

  router.put("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const access = await getAccessibleProjectIdsFilter(req.authUser);
      if (!access.all && !access.projectIds.includes(Number(req.params.id))) {
        return res.status(403).json({ error: "Sem acesso a este projeto", code: "PROJECT_ACCESS_DENIED" });
      }
      const b = req.body;
      const [beforeRows] = await pool.query("SELECT * FROM projetos WHERE id = ?", [req.params.id]);
      if (!beforeRows.length) return res.status(404).json({ error: "Projeto não encontrado" });
      const projectCode = buildProjectCode(b.projectId, b.projeto);
      const businessUnitId = sanitizeInt(b.businessUnitId);
      if (!businessUnitId) return res.status(400).json({ error: "Business Unit é obrigatória", code: "BUSINESS_UNIT_REQUIRED" });
      const [businessUnits] = await pool.query("SELECT id, nome FROM business_units WHERE id = ?", [businessUnitId]);
      if (!businessUnits.length) return res.status(400).json({ error: "Business Unit inválida", code: "BUSINESS_UNIT_INVALID" });
      const produto = await resolveProduto(b.produtoId, businessUnitId);
      if (produto.error) return res.status(produto.error.status).json(produto.error.payload);
      const dataInicioPlanej = sanitizeString(b.dataInicioPlanej, 20);
      const dataFimPlanej = sanitizeString(b.dataFimPlanej, 20);
      const dataInicioReal = sanitizeString(b.dataInicio, 20);
      const dataFimReal = sanitizeString(b.dataFimReal, 50);
      await pool.query(
        `UPDATE projetos SET project_code=?, project_type=?, business_unit_id=?, business_unit_nome=?, produto_id=?, produto_nome=?, projeto=?, descricao=?, prioridade=?, responsavel=?, ftes=?, valor_previsto=?, valor_gasto=?, data_inicio_planej=?, data_inicio_planej_date=?, data_fim_planej=?, data_fim_planej_date=?, data_inicio=?, data_inicio_real_date=?, data_fim_real=?, data_fim_real_date=?, total_tarefas=?, tarefas_concluidas=?, tarefas_andamento=?, tarefas_atrasadas=?, tarefas_nao_iniciadas=?, status=?, conclusao=? WHERE id=?`,
        [
          projectCode,
          sanitizeString(b.projectType, 30) || "Projeto",
          businessUnitId,
          businessUnits[0].nome,
          produto.produtoId,
          produto.produtoNome,
          sanitizeString(b.projeto, 200),
          sanitizeString(b.descricao, 500),
          sanitizeString(b.prioridade, 50),
          sanitizeString(b.responsavel, 200),
          sanitizeNumber(b.ftes),
          sanitizeNumber(b.valorPrevisto),
          sanitizeNumber(b.valorGasto),
          dataInicioPlanej,
          normalizeDateInput(dataInicioPlanej) || null,
          dataFimPlanej,
          normalizeDateInput(dataFimPlanej) || null,
          dataInicioReal,
          normalizeDateInput(dataInicioReal) || null,
          dataFimReal,
          normalizeDateInput(dataFimReal) || null,
          sanitizeInt(b.totalTarefas),
          sanitizeInt(b.tarefasConcluidas),
          sanitizeInt(b.tarefasAndamento),
          sanitizeInt(b.tarefasAtrasadas),
          sanitizeInt(b.tarefasNaoIniciadas),
          sanitizeString(b.status, 50),
          sanitizeNumber(b.conclusao),
          req.params.id,
        ]
      );
      const [rows] = await pool.query("SELECT * FROM projetos WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Projeto não encontrado" });
      await supabaseSync.syncProjeto(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "projeto",
        entityId: String(req.params.id),
        projectId: Number(req.params.id),
        summary: `Projeto ${rows[0].projeto} atualizado`,
        before: beforeRows[0],
        after: rows[0],
      });
      res.json(mapProjeto(rows[0]));
    } catch (err) {
      console.error("Error updating projeto:", err);
      res.status(500).json({ error: "Erro ao atualizar projeto", code: "UPDATE_PROJETO" });
    }
  });

  router.delete("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const access = await getAccessibleProjectIdsFilter(req.authUser);
      if (!access.all && !access.projectIds.includes(Number(req.params.id))) {
        return res.status(403).json({ error: "Sem acesso a este projeto", code: "PROJECT_ACCESS_DENIED" });
      }
      const [beforeRows] = await pool.query("SELECT * FROM projetos WHERE id = ?", [req.params.id]);
      const [result] = await pool.query("DELETE FROM projetos WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: "Projeto não encontrado" });
      await supabaseSync.deleteProjeto(req.params.id);
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "projeto",
        entityId: String(req.params.id),
        projectId: Number(req.params.id),
        summary: `Projeto ${beforeRows[0]?.projeto || req.params.id} removido`,
        before: beforeRows[0] || null,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting projeto:", err);
      res.status(500).json({ error: "Erro ao excluir projeto", code: "DELETE_PROJETO" });
    }
  });

  return router;
};
