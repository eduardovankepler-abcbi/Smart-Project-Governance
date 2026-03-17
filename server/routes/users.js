const express = require("express");
const router = express.Router();
const { sanitizeString, sanitizeInt } = require("../utils/parsing");
const {
  hashPassword,
  validatePasswordPolicy,
  buildUserResponse,
  canCreateOrAssignRole,
  canManageTargetUser,
  normalizeRole,
} = require("../utils/auth");
const { logAudit } = require("../utils/audit");

module.exports = function (pool, auth) {
  const { requireAuth, requireManageUsers } = auth;

  async function loadUserWithProjects(id) {
    const [rows] = await pool.query(
      `SELECT u.*, r.nome as resource_nome
       FROM users u
       LEFT JOIN recursos r ON r.id = u.resource_id
       WHERE u.id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const [allocations] = await pool.query("SELECT project_id FROM user_project_access WHERE user_id = ? ORDER BY project_id", [id]);
    return buildUserResponse(rows[0], allocations.map((item) => item.project_id));
  }

  router.get("/", requireAuth, requireManageUsers, async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT u.*, r.nome as resource_nome
         FROM users u
         LEFT JOIN recursos r ON r.id = u.resource_id
         ORDER BY u.nome`
      );
      const [allocations] = await pool.query("SELECT user_id, project_id FROM user_project_access ORDER BY user_id, project_id");
      const projectIdsByUser = new Map();
      allocations.forEach((item) => {
        const current = projectIdsByUser.get(item.user_id) || [];
        current.push(item.project_id);
        projectIdsByUser.set(item.user_id, current);
      });
      const visibleUsers = req.authUser.role === "admin"
        ? users
        : users.filter((row) => row.role === "bi" || row.role === "viewer");
      res.json(visibleUsers.map((row) => buildUserResponse(row, projectIdsByUser.get(row.id) || [])));
    } catch (err) {
      console.error("Error fetching users:", err);
      res.status(500).json({ error: "Erro ao buscar usuários", code: "FETCH_USERS" });
    }
  });

  router.post("/", requireAuth, requireManageUsers, async (req, res) => {
    try {
      const role = normalizeRole(req.body?.role);
      if (!canCreateOrAssignRole(req.authUser.role, role)) {
        return res.status(403).json({ error: "Perfil sem permissão para criar esse tipo de usuário", code: "USER_ROLE_DENIED" });
      }

      const nome = sanitizeString(req.body?.nome, 120);
      const email = sanitizeString(req.body?.email, 200).toLowerCase();
      const password = String(req.body?.password || "");
      const resourceId = sanitizeInt(req.body?.linkedResourceId);
      const assignedProjectIds = Array.isArray(req.body?.assignedProjectIds)
        ? req.body.assignedProjectIds.map((item) => sanitizeInt(item)).filter(Boolean)
        : [];
      if (role === "viewer" && !resourceId) {
        return res.status(400).json({ error: "Viewer exige recurso vinculado", code: "USER_VIEWER_RESOURCE_REQUIRED" });
      }

      if (!nome || !email || !password) {
        return res.status(400).json({ error: "Nome, email e senha são obrigatórios", code: "USER_INVALID_INPUT" });
      }
      const passwordPolicyError = validatePasswordPolicy(password);
      if (passwordPolicyError) {
        return res.status(400).json({ error: passwordPolicyError, code: "USER_PASSWORD_POLICY" });
      }

      const [result] = await pool.query(
        "INSERT INTO users (nome, email, password_hash, role, active, resource_id) VALUES (?, ?, ?, ?, 1, ?)",
        [nome, email, hashPassword(password), role, resourceId || null]
      );

      if (role === "pmo" && assignedProjectIds.length) {
        for (const projectId of assignedProjectIds) {
          await pool.query(
            "INSERT INTO user_project_access (user_id, project_id) VALUES (?, ?)",
            [result.insertId, projectId]
          );
        }
      }

      const user = await loadUserWithProjects(result.insertId);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "user",
        entityId: String(result.insertId),
        summary: `Usuário ${nome} criado com perfil ${role}`,
        after: user,
      });
      res.status(201).json(user);
    } catch (err) {
      console.error("Error creating user:", err);
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Email já cadastrado", code: "USER_DUPLICATE_EMAIL" });
      }
      res.status(500).json({ error: "Erro ao criar usuário", code: "CREATE_USER" });
    }
  });

  router.put("/:id", requireAuth, requireManageUsers, async (req, res) => {
    const targetId = sanitizeInt(req.params.id);
    try {
      const [existingRows] = await pool.query("SELECT * FROM users WHERE id = ?", [targetId]);
      if (!existingRows.length) return res.status(404).json({ error: "Usuário não encontrado" });

      if (!canManageTargetUser(req.authUser.role, existingRows[0].role)) {
        return res.status(403).json({ error: "Sem permissão para editar este usuário", code: "USER_EDIT_DENIED" });
      }

      const nextRole = normalizeRole(req.body?.role || existingRows[0].role);
      if (!canCreateOrAssignRole(req.authUser.role, nextRole)) {
        return res.status(403).json({ error: "Sem permissão para atribuir este perfil", code: "USER_ASSIGN_DENIED" });
      }

      const nome = sanitizeString(req.body?.nome, 120) || existingRows[0].nome;
      const email = sanitizeString(req.body?.email, 200).toLowerCase() || existingRows[0].email;
      const password = String(req.body?.password || "");
      const active = req.body?.active === false ? 0 : 1;
      const resourceId = sanitizeInt(req.body?.linkedResourceId);
      if (password) {
        const passwordPolicyError = validatePasswordPolicy(password);
        if (passwordPolicyError) {
          return res.status(400).json({ error: passwordPolicyError, code: "USER_PASSWORD_POLICY" });
        }
      }
      if (nextRole === "viewer" && !resourceId) {
        return res.status(400).json({ error: "Viewer exige recurso vinculado", code: "USER_VIEWER_RESOURCE_REQUIRED" });
      }
      await pool.query(
        `UPDATE users
         SET nome=?, email=?, role=?, active=?, password_hash=?, resource_id=?
         WHERE id=?`,
        [
          nome,
          email,
          nextRole,
          active,
          password ? hashPassword(password) : existingRows[0].password_hash,
          resourceId || null,
          targetId,
        ]
      );

      await pool.query("DELETE FROM user_project_access WHERE user_id = ?", [targetId]);
      const assignedProjectIds = Array.isArray(req.body?.assignedProjectIds)
        ? req.body.assignedProjectIds.map((item) => sanitizeInt(item)).filter(Boolean)
        : [];
      if (nextRole === "pmo") {
        for (const projectId of assignedProjectIds) {
          await pool.query("INSERT INTO user_project_access (user_id, project_id) VALUES (?, ?)", [targetId, projectId]);
        }
      }

      const updatedUser = await loadUserWithProjects(targetId);
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "user",
        entityId: String(targetId),
        summary: `Usuário ${updatedUser.nome} atualizado para perfil ${updatedUser.role}`,
        before: existingRows[0],
        after: updatedUser,
      });
      res.json(updatedUser);
    } catch (err) {
      console.error("Error updating user:", err);
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Email já cadastrado", code: "USER_DUPLICATE_EMAIL" });
      }
      res.status(500).json({ error: "Erro ao atualizar usuário", code: "UPDATE_USER" });
    }
  });

  router.delete("/:id", requireAuth, requireManageUsers, async (req, res) => {
    const targetId = sanitizeInt(req.params.id);
    try {
      const [existingRows] = await pool.query("SELECT * FROM users WHERE id = ?", [targetId]);
      if (!existingRows.length) return res.status(404).json({ error: "Usuário não encontrado" });
      if (req.authUser.id === targetId) {
        return res.status(400).json({ error: "Não é permitido excluir a própria conta", code: "USER_SELF_DELETE" });
      }
      if (!canManageTargetUser(req.authUser.role, existingRows[0].role)) {
        return res.status(403).json({ error: "Sem permissão para excluir este usuário", code: "USER_DELETE_DENIED" });
      }

      await pool.query("DELETE FROM user_project_access WHERE user_id = ?", [targetId]);
      await pool.query("DELETE FROM user_sessions WHERE user_id = ?", [targetId]);
      await pool.query("DELETE FROM users WHERE id = ?", [targetId]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "user",
        entityId: String(targetId),
        summary: `Usuário ${existingRows[0].nome} removido`,
        before: existingRows[0],
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting user:", err);
      res.status(500).json({ error: "Erro ao excluir usuário", code: "DELETE_USER" });
    }
  });

  router.post("/:id/reset-password", requireAuth, requireManageUsers, async (req, res) => {
    const targetId = sanitizeInt(req.params.id);
    try {
      const [existingRows] = await pool.query("SELECT * FROM users WHERE id = ?", [targetId]);
      if (!existingRows.length) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
      if (!canManageTargetUser(req.authUser.role, existingRows[0].role)) {
        return res.status(403).json({ error: "Sem permissão para redefinir a senha deste usuário", code: "USER_RESET_DENIED" });
      }

      const nextPassword = String(req.body?.password || "");
      if (!nextPassword) {
        return res.status(400).json({ error: "Nova senha é obrigatória", code: "USER_RESET_PASSWORD_REQUIRED" });
      }
      const passwordPolicyError = validatePasswordPolicy(nextPassword);
      if (passwordPolicyError) {
        return res.status(400).json({ error: passwordPolicyError, code: "USER_PASSWORD_POLICY" });
      }

      await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(nextPassword), targetId]);
      await pool.query("DELETE FROM user_sessions WHERE user_id = ?", [targetId]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "reset_password",
        entityType: "user",
        entityId: String(targetId),
        summary: `Senha redefinida para o usuário ${existingRows[0].nome}`,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error resetting user password:", err);
      res.status(500).json({ error: "Erro ao redefinir senha", code: "RESET_USER_PASSWORD" });
    }
  });

  return router;
};
