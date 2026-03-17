function trimText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function toJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "SERIALIZATION_FAILED" });
  }
}

async function logAudit(pool, payload) {
  const actor = payload.actor || {};
  let result;
  try {
    [result] = await pool.query(
      `INSERT INTO audit_logs
        (entity_type, entity_id, action, actor_user_id, actor_nome, actor_role, project_id, summary, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trimText(payload.entityType, 50),
        trimText(payload.entityId, 100),
        trimText(payload.action, 20),
        actor.id || null,
        trimText(actor.nome, 120) || "Sistema",
        trimText(actor.role, 20) || "system",
        payload.projectId || null,
        trimText(payload.summary, 500),
        toJson(payload.before),
        toJson(payload.after),
      ],
    );
  } catch (error) {
    console.error("Audit log write failed:", error.message || error);
    return;
  }
  try {
    const [rows] = await pool.query("SELECT * FROM audit_logs WHERE id = ?", [result.insertId]);
    if (rows.length) {
      const supabaseSync = require("./supabaseSync");
      await supabaseSync.syncAuditLog(rows[0]);
    }
  } catch (_) {}
}

module.exports = { logAudit };
