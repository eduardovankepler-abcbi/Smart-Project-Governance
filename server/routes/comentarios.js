const express = require("express");
const router = express.Router();
const { sanitizeInt, sanitizeString } = require("../utils/parsing");
const { logAudit } = require("../utils/audit");

module.exports = function (pool, auth) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectIdsFilter } = auth;
  const supabaseSync = require("../utils/supabaseSync");

  async function canAccessProject(req, projectId) {
    const access = await getAccessibleProjectIdsFilter(req.authUser);
    return access.all || access.projectIds.includes(Number(projectId));
  }

  async function loadTaskProjectId(taskId) {
    const [rows] = await pool.query(
      `SELECT p.id as project_id, t.tarefa, p.projeto
       FROM tarefas t
       INNER JOIN projetos p ON p.projeto = t.projeto
       WHERE t.id = ?
       LIMIT 1`,
      [taskId],
    );
    return rows[0] || null;
  }

  router.get("/", requireAuth, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.query.projectId);
      const taskId = sanitizeString(req.query.taskId, 20);
      const access = await getAccessibleProjectIdsFilter(req.authUser);

      const conditions = [];
      const params = [];

      if (!access.all) {
        conditions.push("c.project_id IN (?)");
        params.push(access.projectIds.length ? access.projectIds : [0]);
      }
      if (projectId) {
        conditions.push("c.project_id = ?");
        params.push(projectId);
      }
      if (taskId) {
        conditions.push("c.task_id = ?");
        params.push(taskId);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await pool.query(
        `SELECT c.*
         FROM comentarios c
         ${whereClause}
         ORDER BY c.created_at DESC, c.id DESC`,
        params,
      );

      res.json(rows.map((row) => ({
        id: row.id,
        entityType: row.entity_type,
        projectId: row.project_id || undefined,
        projectName: row.project_name || "",
        taskId: row.task_id || "",
        taskName: row.task_name || "",
        authorUserId: row.author_user_id || undefined,
        authorName: row.author_nome || "",
        content: row.content || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })));
    } catch (err) {
      console.error("Error fetching comentarios:", err);
      res.status(500).json({ error: "Erro ao buscar comentários", code: "FETCH_COMENTARIOS" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const entityType = sanitizeString(req.body.entityType, 20);
      const content = sanitizeString(req.body.content, 4000);
      if (!["projeto", "tarefa"].includes(entityType)) {
        return res.status(400).json({ error: "Tipo de comentário inválido", code: "COMMENT_ENTITY_INVALID" });
      }
      if (!content) {
        return res.status(400).json({ error: "Comentário é obrigatório", code: "COMMENT_CONTENT_REQUIRED" });
      }

      let projectId = sanitizeInt(req.body.projectId);
      let projectName = "";
      let taskId = "";
      let taskName = "";

      if (entityType === "projeto") {
        if (!projectId) return res.status(400).json({ error: "Projeto é obrigatório", code: "COMMENT_PROJECT_REQUIRED" });
        if (!(await canAccessProject(req, projectId))) {
          return res.status(403).json({ error: "Sem acesso a este projeto", code: "COMMENT_PROJECT_ACCESS_DENIED" });
        }
        const [projectRows] = await pool.query("SELECT id, projeto FROM projetos WHERE id = ? LIMIT 1", [projectId]);
        if (!projectRows.length) return res.status(404).json({ error: "Projeto não encontrado", code: "COMMENT_PROJECT_NOT_FOUND" });
        projectName = projectRows[0].projeto;
      } else {
        taskId = sanitizeString(req.body.taskId, 20);
        if (!taskId) return res.status(400).json({ error: "Tarefa é obrigatória", code: "COMMENT_TASK_REQUIRED" });
        const task = await loadTaskProjectId(taskId);
        if (!task) return res.status(404).json({ error: "Tarefa não encontrada", code: "COMMENT_TASK_NOT_FOUND" });
        projectId = task.project_id;
        projectName = task.projeto;
        taskName = task.tarefa;
        if (!(await canAccessProject(req, projectId))) {
          return res.status(403).json({ error: "Sem acesso a esta tarefa", code: "COMMENT_TASK_ACCESS_DENIED" });
        }
      }

      const [result] = await pool.query(
        `INSERT INTO comentarios
          (entity_type, project_id, project_name, task_id, task_name, author_user_id, author_nome, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          projectId || null,
          projectName,
          taskId || null,
          taskName,
          req.authUser.id || null,
          req.authUser.nome || "Sistema",
          content,
        ],
      );
      const [rows] = await pool.query("SELECT * FROM comentarios WHERE id = ?", [result.insertId]);
      await supabaseSync.syncComentario(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "comentario",
        entityId: String(result.insertId),
        projectId,
        summary: `Comentário criado em ${entityType === "projeto" ? `projeto ${projectName}` : `tarefa ${taskName}`}`,
        after: rows[0],
      });
      res.status(201).json({
        id: rows[0].id,
        entityType: rows[0].entity_type,
        projectId: rows[0].project_id || undefined,
        projectName: rows[0].project_name || "",
        taskId: rows[0].task_id || "",
        taskName: rows[0].task_name || "",
        authorUserId: rows[0].author_user_id || undefined,
        authorName: rows[0].author_nome || "",
        content: rows[0].content || "",
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      });
    } catch (err) {
      console.error("Error creating comentario:", err);
      res.status(500).json({ error: "Erro ao criar comentário", code: "CREATE_COMENTARIO" });
    }
  });

  router.put("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const content = sanitizeString(req.body.content, 4000);
      if (!content) {
        return res.status(400).json({ error: "Comentário é obrigatório", code: "COMMENT_CONTENT_REQUIRED" });
      }
      const [existingRows] = await pool.query("SELECT * FROM comentarios WHERE id = ? LIMIT 1", [req.params.id]);
      if (!existingRows.length) return res.status(404).json({ error: "Comentário não encontrado", code: "COMMENT_NOT_FOUND" });
      if (!(await canAccessProject(req, existingRows[0].project_id))) {
        return res.status(403).json({ error: "Sem acesso a este comentário", code: "COMMENT_ACCESS_DENIED" });
      }
      await pool.query("UPDATE comentarios SET content = ? WHERE id = ?", [content, req.params.id]);
      const [rows] = await pool.query("SELECT * FROM comentarios WHERE id = ?", [req.params.id]);
      await supabaseSync.syncComentario(rows[0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "comentario",
        entityId: String(req.params.id),
        projectId: existingRows[0].project_id || null,
        summary: `Comentário atualizado em ${existingRows[0].entity_type === "projeto" ? `projeto ${existingRows[0].project_name}` : `tarefa ${existingRows[0].task_name}`}`,
        before: existingRows[0],
        after: rows[0],
      });
      res.json({
        id: rows[0].id,
        entityType: rows[0].entity_type,
        projectId: rows[0].project_id || undefined,
        projectName: rows[0].project_name || "",
        taskId: rows[0].task_id || "",
        taskName: rows[0].task_name || "",
        authorUserId: rows[0].author_user_id || undefined,
        authorName: rows[0].author_nome || "",
        content: rows[0].content || "",
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      });
    } catch (err) {
      console.error("Error updating comentario:", err);
      res.status(500).json({ error: "Erro ao atualizar comentário", code: "UPDATE_COMENTARIO" });
    }
  });

  router.delete("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const [existingRows] = await pool.query("SELECT * FROM comentarios WHERE id = ? LIMIT 1", [req.params.id]);
      if (!existingRows.length) return res.status(404).json({ error: "Comentário não encontrado", code: "COMMENT_NOT_FOUND" });
      if (!(await canAccessProject(req, existingRows[0].project_id))) {
        return res.status(403).json({ error: "Sem acesso a este comentário", code: "COMMENT_ACCESS_DENIED" });
      }
      await pool.query("DELETE FROM comentarios WHERE id = ?", [req.params.id]);
      await supabaseSync.deleteComentario(req.params.id);
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "comentario",
        entityId: String(req.params.id),
        projectId: existingRows[0].project_id || null,
        summary: `Comentário removido de ${existingRows[0].entity_type === "projeto" ? `projeto ${existingRows[0].project_name}` : `tarefa ${existingRows[0].task_name}`}`,
        before: existingRows[0],
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting comentario:", err);
      res.status(500).json({ error: "Erro ao excluir comentário", code: "DELETE_COMENTARIO" });
    }
  });

  return router;
};
