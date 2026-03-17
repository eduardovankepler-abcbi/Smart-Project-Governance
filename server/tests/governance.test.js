const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canCreateOrAssignRole,
  canManageTargetUser,
  canSeeAllProjects,
  canWriteData,
  canManageUsers,
  canImportData,
} = require("../utils/auth");

test("admin has full governance capabilities", () => {
  assert.equal(canCreateOrAssignRole("admin", "admin"), true);
  assert.equal(canCreateOrAssignRole("admin", "pmo"), true);
  assert.equal(canManageTargetUser("admin", "viewer"), true);
  assert.equal(canSeeAllProjects("admin"), true);
  assert.equal(canWriteData("admin"), true);
  assert.equal(canManageUsers("admin"), true);
  assert.equal(canImportData("admin"), true);
});

test("pmo governance is restricted to BI and Viewer", () => {
  assert.equal(canCreateOrAssignRole("pmo", "bi"), true);
  assert.equal(canCreateOrAssignRole("pmo", "viewer"), true);
  assert.equal(canCreateOrAssignRole("pmo", "admin"), false);
  assert.equal(canCreateOrAssignRole("pmo", "pmo"), false);
  assert.equal(canManageTargetUser("pmo", "viewer"), true);
  assert.equal(canManageTargetUser("pmo", "bi"), true);
  assert.equal(canManageTargetUser("pmo", "pmo"), false);
  assert.equal(canManageTargetUser("pmo", "admin"), false);
  assert.equal(canSeeAllProjects("pmo"), false);
  assert.equal(canWriteData("pmo"), true);
  assert.equal(canManageUsers("pmo"), true);
});

test("bi and viewer are read-only", () => {
  assert.equal(canWriteData("bi"), false);
  assert.equal(canWriteData("viewer"), false);
  assert.equal(canManageUsers("bi"), false);
  assert.equal(canManageUsers("viewer"), false);
  assert.equal(canImportData("bi"), false);
  assert.equal(canImportData("viewer"), false);
  assert.equal(canSeeAllProjects("bi"), true);
  assert.equal(canSeeAllProjects("viewer"), false);
});
