const express = require("express");
const router = express.Router();
const { sanitizeString } = require("../utils/parsing");
const {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  generateSessionToken,
  hashToken,
  getSessionExpiration,
  buildUserResponse,
} = require("../utils/auth");
const { logAudit } = require("../utils/audit");

const DUMMY_PASSWORD_HASH = hashPassword("DummyPassword@123");
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

function getAttemptKey(req, email) {
  return `${req.ip || "unknown"}:${email}`;
}

function isLoginBlocked(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function registerLoginFailure(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, startedAt: now });
    return;
  }
  entry.count += 1;
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

module.exports = function (pool, auth) {
  const { requireAuth } = auth;

  router.post("/login", async (req, res) => {
    try {
      const email = sanitizeString(req.body?.email, 200).toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios", code: "AUTH_INVALID_INPUT" });
      }
      const attemptKey = getAttemptKey(req, email);
      if (isLoginBlocked(attemptKey)) {
        return res.status(429).json({ error: "Muitas tentativas de login. Aguarde alguns minutos.", code: "AUTH_RATE_LIMIT" });
      }

      const [rows] = await pool.query(
        `SELECT u.*, r.nome as resource_nome
         FROM users u
         LEFT JOIN recursos r ON r.id = u.resource_id
         WHERE u.email = ? AND u.active = 1
         LIMIT 1`,
        [email]
      );
      const userRow = rows[0] || null;
      const passwordMatches = verifyPassword(password, userRow?.password_hash || DUMMY_PASSWORD_HASH);
      if (!userRow || !passwordMatches) {
        registerLoginFailure(attemptKey);
        return res.status(401).json({ error: "Credenciais inválidas", code: "AUTH_INVALID_CREDENTIALS" });
      }
      clearLoginAttempts(attemptKey);

      await pool.query("DELETE FROM user_sessions WHERE expires_at <= NOW()");
      await pool.query(
        `DELETE FROM user_sessions
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM (
               SELECT id
               FROM user_sessions
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT 4
             ) recent_sessions
           )`,
        [userRow.id, userRow.id]
      );
      const token = generateSessionToken();
      const expiresAt = getSessionExpiration();
      await pool.query(
        "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        [userRow.id, hashToken(token), expiresAt]
      );

      const [allocations] = await pool.query(
        "SELECT project_id FROM user_project_access WHERE user_id = ? ORDER BY project_id",
        [userRow.id]
      );
      await logAudit(pool, {
        actor: { id: userRow.id, nome: userRow.nome, role: userRow.role },
        action: "login",
        entityType: "session",
        entityId: String(userRow.id),
        summary: `Login efetuado por ${userRow.nome}`,
      });

      res.json({
        token,
        expiresAt: expiresAt.toISOString(),
        user: buildUserResponse(userRow, allocations.map((item) => item.project_id)),
      });
    } catch (err) {
      console.error("Error logging in:", err);
      res.status(500).json({ error: "Erro ao autenticar usuário", code: "AUTH_LOGIN" });
    }
  });

  router.get("/me", requireAuth, async (req, res) => {
    res.json({ user: req.authUser });
  });

  router.post("/logout", requireAuth, async (req, res) => {
    try {
      if (req.sessionId) {
        await pool.query("DELETE FROM user_sessions WHERE id = ?", [req.sessionId]);
      }
      await logAudit(pool, {
        actor: req.authUser,
        action: "logout",
        entityType: "session",
        entityId: String(req.authUser.id),
        summary: `Logout efetuado por ${req.authUser.nome}`,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error logging out:", err);
      res.status(500).json({ error: "Erro ao encerrar sessão", code: "AUTH_LOGOUT" });
    }
  });

  router.post("/change-password", requireAuth, async (req, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || "");
      const nextPassword = String(req.body?.nextPassword || "");
      if (!currentPassword || !nextPassword) {
        return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias", code: "AUTH_PASSWORD_INPUT" });
      }
      const policyError = validatePasswordPolicy(nextPassword);
      if (policyError) {
        return res.status(400).json({ error: policyError, code: "AUTH_PASSWORD_POLICY" });
      }

      const [rows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [req.authUser.id]);
      if (!rows.length || !verifyPassword(currentPassword, rows[0].password_hash)) {
        return res.status(401).json({ error: "Senha atual inválida", code: "AUTH_PASSWORD_INVALID" });
      }

      await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(nextPassword), req.authUser.id]);
      await pool.query("DELETE FROM user_sessions WHERE user_id = ? AND id <> ?", [req.authUser.id, req.sessionId || 0]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "change_password",
        entityType: "user",
        entityId: String(req.authUser.id),
        summary: `Senha alterada por ${req.authUser.nome}`,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error changing password:", err);
      res.status(500).json({ error: "Erro ao alterar senha", code: "AUTH_CHANGE_PASSWORD" });
    }
  });

  return router;
};
