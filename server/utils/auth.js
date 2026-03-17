const crypto = require("crypto");

const ROLES = {
  ADMIN: "admin",
  PMO: "pmo",
  BI: "bi",
  VIEWER: "viewer",
};

const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.PMO]: "PMO",
  [ROLES.BI]: "BI",
  [ROLES.VIEWER]: "Viewer",
};

function normalizeRole(role) {
  const value = String(role || "").toLowerCase().trim();
  return Object.values(ROLES).includes(value) ? value : ROLES.VIEWER;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function validatePasswordPolicy(password) {
  const value = String(password || "");
  if (value.length < 8) return "A senha deve ter pelo menos 8 caracteres";
  if (!/[a-z]/.test(value)) return "A senha deve conter ao menos uma letra minúscula";
  if (!/[A-Z]/.test(value)) return "A senha deve conter ao menos uma letra maiúscula";
  if (!/\d/.test(value)) return "A senha deve conter ao menos um número";
  if (!/[^A-Za-z0-9]/.test(value)) return "A senha deve conter ao menos um caractere especial";
  return "";
}

function verifyPassword(password, storedHash) {
  try {
    if (!storedHash || !storedHash.includes(":")) return false;
    const [salt, hash] = storedHash.split(":");
    const computed = crypto.scryptSync(String(password), salt, 64).toString("hex");
    const expected = Buffer.from(hash, "hex");
    const actual = Buffer.from(computed, "hex");
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function getSessionExpiration(days = 7) {
  const configuredDays = Math.max(1, parseInt(process.env.SESSION_DAYS || String(days), 10) || days);
  const result = new Date();
  result.setDate(result.getDate() + configuredDays);
  return result;
}

function buildUserResponse(row, projectIds = []) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    role: normalizeRole(row.role),
    roleLabel: ROLE_LABELS[normalizeRole(row.role)],
    active: !!row.active,
    assignedProjectIds: projectIds,
    linkedResourceId: row.resource_id || undefined,
    linkedResourceName: row.resource_nome || "",
  };
}

function canCreateOrAssignRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === ROLES.ADMIN) return true;
  if (actor === ROLES.PMO) return target === ROLES.BI || target === ROLES.VIEWER;
  return false;
}

function canManageTargetUser(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === ROLES.ADMIN) return true;
  if (actor === ROLES.PMO) return target === ROLES.BI || target === ROLES.VIEWER;
  return false;
}

function canWriteData(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLES.ADMIN || normalized === ROLES.PMO;
}

function canManageUsers(role) {
  return canWriteData(role);
}

function canImportData(role) {
  return canWriteData(role);
}

function canSeeGovernance(role) {
  return canWriteData(role);
}

function canSeeCadastro(role) {
  return canWriteData(role);
}

function canSeeAllProjects(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLES.ADMIN || normalized === ROLES.BI;
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  normalizeRole,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
  generateSessionToken,
  hashToken,
  getSessionExpiration,
  buildUserResponse,
  canCreateOrAssignRole,
  canManageTargetUser,
  canWriteData,
  canManageUsers,
  canImportData,
  canSeeGovernance,
  canSeeCadastro,
  canSeeAllProjects,
};
