const express = require("express");
const router = express.Router();
const { sanitizeInt, sanitizeNumber, sanitizeString } = require("../utils/parsing");
const { hasDuplicateAssignment } = require("../utils/allocationRules");
const { logAudit } = require("../utils/audit");

async function syncTaskAssignmentState(pool, supabaseSync, taskId) {
  const [taskRows] = await pool.query("SELECT * FROM tarefas WHERE id = ?", [taskId]);
  if (!taskRows.length) return null;

  const [assignmentRows] = await pool.query("SELECT * FROM task_assignments WHERE task_id = ? ORDER BY id", [taskId]);
  const [dependencyRows] = await pool.query("SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY id", [taskId]);
  const responsavel = assignmentRows.map((item) => item.resource_name).filter(Boolean).join("; ");
  await pool.query("UPDATE tarefas SET responsavel = ? WHERE id = ?", [responsavel, taskId]);
  const [updatedTaskRows] = await pool.query("SELECT * FROM tarefas WHERE id = ?", [taskId]);
  await supabaseSync.syncTaskBundle(updatedTaskRows[0], assignmentRows, dependencyRows);
  return updatedTaskRows[0];
}

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectNamesFilter } = auth;
  const supabaseSync = require("../utils/supabaseSync");

  async function canWriteTask(req, taskId) {
    if (req.authUser.role === "admin") return true;
    const [taskRows] = await pool.query("SELECT projeto FROM tarefas WHERE id = ?", [taskId]);
    if (!taskRows.length) return false;
    const access = await getAccessibleProjectNamesFilter(req.authUser);
    return access.projectNames.includes(taskRows[0].projeto);
  }

  router.get("/", requireAuth, async (req, res) => {
    try {
      let query = `
        SELECT ta.*, t.projeto, t.tarefa, t.wbs, t.status as task_status, r.nome as recurso_nome
        FROM task_assignments ta
        INNER JOIN tarefas t ON t.id = ta.task_id
        LEFT JOIN recursos r ON r.id = ta.resource_id
      `;
      let params = [];

      if (req.authUser.role === "viewer") {
        if (!req.authUser.linkedResourceId) return res.json([]);
        query += " WHERE ta.resource_id = ? ";
        params = [req.authUser.linkedResourceId];
      } else if (req.authUser.role === "pmo") {
        const access = await getAccessibleProjectNamesFilter(req.authUser);
        query += " WHERE t.projeto IN (?) ";
        params = [access.projectNames.length ? access.projectNames : ["__none__"]];
      }

      query += " ORDER BY t.projeto, ta.task_id, ta.id";
      const [rows] = await pool.query(query, params);
      res.json(rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        projeto: row.projeto,
        tarefa: row.tarefa,
        wbs: row.wbs || row.task_id,
        taskStatus: row.task_status || "",
        resourceId: row.resource_id || undefined,
        resourceName: row.resource_name || row.recurso_nome || "",
        units: Number(row.units || 0),
        work: Number(row.work || 0),
        actualWork: Number(row.actual_work || 0),
        remainingWork: Number(row.remaining_work || 0),
        cost: Number(row.cost || 0),
      })));
    } catch (err) {
      console.error("Error fetching alocacoes:", err);
      res.status(500).json({ error: "Erro ao buscar alocações", code: "FETCH_ALOCACOES" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const taskId = sanitizeString(req.body.taskId, 20);
      const resourceId = sanitizeInt(req.body.resourceId);
      if (!taskId || !resourceId) return res.status(400).json({ error: "Tarefa e recurso são obrigatórios", code: "ALOCACAO_INVALID" });
      if (req.authUser.role === "pmo" && !(await canWriteTask(req, taskId))) {
        return res.status(403).json({ error: "Sem acesso a esta tarefa", code: "ALOCACAO_ACCESS_DENIED" });
      }

      const [resourceRows] = await pool.query("SELECT id, nome FROM recursos WHERE id = ?", [resourceId]);
      if (!resourceRows.length) return res.status(400).json({ error: "Recurso inválido", code: "ALOCACAO_RESOURCE_INVALID" });
      const [duplicateRows] = await pool.query("SELECT * FROM task_assignments WHERE task_id = ?", [taskId]);
      if (hasDuplicateAssignment(duplicateRows, { taskId, resourceId })) {
        return res.status(409).json({
          error: "Este recurso já está alocado nesta tarefa. Edite a alocação existente em vez de duplicar.",
          code: "ALOCACAO_DUPLICATE",
        });
      }

      const [result] = await pool.query(
        `INSERT INTO task_assignments (task_id, resource_id, resource_name, units, work, actual_work, remaining_work, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId,
          resourceId,
          resourceRows[0].nome,
          sanitizeNumber(req.body.units, 1),
          sanitizeNumber(req.body.work),
          sanitizeNumber(req.body.actualWork),
          sanitizeNumber(req.body.remainingWork),
          sanitizeNumber(req.body.cost),
        ]
      );

      await syncTaskAssignmentState(pool, supabaseSync, taskId);
      const [rows] = await pool.query("SELECT * FROM task_assignments WHERE id = ?", [result.insertId]);
      const [taskRows] = await pool.query("SELECT projeto, tarefa FROM tarefas WHERE id = ?", [taskId]);
      const [projectRows] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [taskRows[0]?.projeto || ""]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "alocacao",
        entityId: String(result.insertId),
        projectId: projectRows[0]?.id || null,
        summary: `Alocação criada para ${resourceRows[0].nome} na tarefa ${taskRows[0]?.tarefa || taskId}`,
        after: rows[0],
      });
      res.status(201).json({
        id: rows[0].id,
        taskId: rows[0].task_id,
        resourceId: rows[0].resource_id,
        resourceName: rows[0].resource_name,
        units: Number(rows[0].units || 0),
        work: Number(rows[0].work || 0),
        actualWork: Number(rows[0].actual_work || 0),
        remainingWork: Number(rows[0].remaining_work || 0),
        cost: Number(rows[0].cost || 0),
      });
    } catch (err) {
      console.error("Error creating alocacao:", err);
      res.status(500).json({ error: "Erro ao criar alocação", code: "CREATE_ALOCACAO" });
    }
  });

  router.put("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const [existingRows] = await pool.query("SELECT * FROM task_assignments WHERE id = ?", [req.params.id]);
      if (!existingRows.length) return res.status(404).json({ error: "Alocação não encontrada", code: "ALOCACAO_NOT_FOUND" });
      if (req.authUser.role === "pmo" && !(await canWriteTask(req, existingRows[0].task_id))) {
        return res.status(403).json({ error: "Sem acesso a esta tarefa", code: "ALOCACAO_ACCESS_DENIED" });
      }

      const resourceId = sanitizeInt(req.body.resourceId) || existingRows[0].resource_id;
      const [resourceRows] = await pool.query("SELECT id, nome FROM recursos WHERE id = ?", [resourceId]);
      if (!resourceRows.length) return res.status(400).json({ error: "Recurso inválido", code: "ALOCACAO_RESOURCE_INVALID" });
      const [duplicateRows] = await pool.query("SELECT * FROM task_assignments WHERE task_id = ?", [existingRows[0].task_id]);
      if (hasDuplicateAssignment(duplicateRows, { taskId: existingRows[0].task_id, resourceId, excludeId: req.params.id })) {
        return res.status(409).json({
          error: "Este recurso já está alocado nesta tarefa. Edite a alocação existente em vez de duplicar.",
          code: "ALOCACAO_DUPLICATE",
        });
      }

      await pool.query(
        `UPDATE task_assignments
         SET resource_id=?, resource_name=?, units=?, work=?, actual_work=?, remaining_work=?, cost=?
         WHERE id=?`,
        [
          resourceId,
          resourceRows[0].nome,
          sanitizeNumber(req.body.units, existingRows[0].units),
          sanitizeNumber(req.body.work, existingRows[0].work),
          sanitizeNumber(req.body.actualWork, existingRows[0].actual_work),
          sanitizeNumber(req.body.remainingWork, existingRows[0].remaining_work),
          sanitizeNumber(req.body.cost, existingRows[0].cost),
          req.params.id,
        ]
      );

      await syncTaskAssignmentState(pool, supabaseSync, existingRows[0].task_id);
      const [rows] = await pool.query("SELECT * FROM task_assignments WHERE id = ?", [req.params.id]);
      const [taskRows] = await pool.query("SELECT projeto, tarefa FROM tarefas WHERE id = ?", [existingRows[0].task_id]);
      const [projectRows] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [taskRows[0]?.projeto || ""]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "alocacao",
        entityId: String(req.params.id),
        projectId: projectRows[0]?.id || null,
        summary: `Alocação atualizada para ${resourceRows[0].nome} na tarefa ${taskRows[0]?.tarefa || existingRows[0].task_id}`,
        before: existingRows[0],
        after: rows[0],
      });
      res.json({
        id: rows[0].id,
        taskId: rows[0].task_id,
        resourceId: rows[0].resource_id,
        resourceName: rows[0].resource_name,
        units: Number(rows[0].units || 0),
        work: Number(rows[0].work || 0),
        actualWork: Number(rows[0].actual_work || 0),
        remainingWork: Number(rows[0].remaining_work || 0),
        cost: Number(rows[0].cost || 0),
      });
    } catch (err) {
      console.error("Error updating alocacao:", err);
      res.status(500).json({ error: "Erro ao atualizar alocação", code: "UPDATE_ALOCACAO" });
    }
  });

  router.delete("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const [existingRows] = await pool.query("SELECT * FROM task_assignments WHERE id = ?", [req.params.id]);
      if (!existingRows.length) return res.status(404).json({ error: "Alocação não encontrada", code: "ALOCACAO_NOT_FOUND" });
      if (req.authUser.role === "pmo" && !(await canWriteTask(req, existingRows[0].task_id))) {
        return res.status(403).json({ error: "Sem acesso a esta tarefa", code: "ALOCACAO_ACCESS_DENIED" });
      }

      await pool.query("DELETE FROM task_assignments WHERE id = ?", [req.params.id]);
      await syncTaskAssignmentState(pool, supabaseSync, existingRows[0].task_id);
      const [taskRows] = await pool.query("SELECT projeto, tarefa FROM tarefas WHERE id = ?", [existingRows[0].task_id]);
      const [projectRows] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [taskRows[0]?.projeto || ""]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "alocacao",
        entityId: String(req.params.id),
        projectId: projectRows[0]?.id || null,
        summary: `Alocação removida de ${existingRows[0].resource_name || "recurso"} na tarefa ${taskRows[0]?.tarefa || existingRows[0].task_id}`,
        before: existingRows[0],
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting alocacao:", err);
      res.status(500).json({ error: "Erro ao excluir alocação", code: "DELETE_ALOCACAO" });
    }
  });

  return router;
};
