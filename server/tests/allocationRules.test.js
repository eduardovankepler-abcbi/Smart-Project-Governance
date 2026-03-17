const test = require("node:test");
const assert = require("node:assert/strict");
const { hasDuplicateAssignment } = require("../utils/allocationRules");

test("duplicate assignment is detected for same task and resource", () => {
  const existing = [
    { id: 1, task_id: "1.1", resource_id: 10 },
    { id: 2, task_id: "1.2", resource_id: 10 },
  ];

  assert.equal(hasDuplicateAssignment(existing, { taskId: "1.1", resourceId: 10 }), true);
  assert.equal(hasDuplicateAssignment(existing, { taskId: "1.1", resourceId: 11 }), false);
  assert.equal(hasDuplicateAssignment(existing, { taskId: "1.1", resourceId: 10, excludeId: 1 }), false);
});
