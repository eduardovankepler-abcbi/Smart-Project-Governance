const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  canCreateOrAssignRole,
  canManageTargetUser,
  normalizeRole,
} = require("../utils/auth");

test("password hashing and verification work together", () => {
  const password = "Admin@123";
  const hash = hashPassword(password);
  assert.equal(typeof hash, "string");
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("Wrong@123", hash), false);
});

test("password policy rejects weak passwords", () => {
  assert.ok(validatePasswordPolicy("short"));
  assert.ok(validatePasswordPolicy("alllowercase1!"));
  assert.ok(validatePasswordPolicy("ALLUPPERCASE1!"));
  assert.ok(validatePasswordPolicy("NoNumber!"));
  assert.equal(validatePasswordPolicy("Strong@123"), "");
});

test("role normalization and governance helpers behave correctly", () => {
  assert.equal(normalizeRole("ADMIN"), "admin");
  assert.equal(canCreateOrAssignRole("admin", "pmo"), true);
  assert.equal(canCreateOrAssignRole("pmo", "bi"), true);
  assert.equal(canCreateOrAssignRole("pmo", "admin"), false);
  assert.equal(canManageTargetUser("pmo", "viewer"), true);
  assert.equal(canManageTargetUser("pmo", "pmo"), false);
});
