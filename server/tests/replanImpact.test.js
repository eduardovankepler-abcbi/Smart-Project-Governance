const test = require("node:test");
const assert = require("node:assert/strict");
const { requireReplanJustification, summarizeIncomingTasks } = require("../utils/replanImpact");

function createConn(rows) {
  return {
    async query(sql, params = []) {
      assert.match(sql, /FROM project_baselines/);
      assert.deepEqual(params, [42]);
      return [rows];
    },
  };
}

test("summarizeIncomingTasks totals count, effort and cost", () => {
  const summary = summarizeIncomingTasks([
    { esforcoPlanej: 8, valorPrevisto: 100 },
    { plannedEffort: 4, plannedCost: 50 },
  ]);

  assert.deepEqual(summary, {
    taskCount: 2,
    totalPlannedEffort: 12,
    totalPlannedCost: 150,
  });
});

test("requireReplanJustification allows projects without official baseline", async () => {
  const result = await requireReplanJustification(createConn([]), 42, "");

  assert.equal(result.hasOfficialBaseline, false);
  assert.equal(result.justification, "");
});

test("requireReplanJustification rejects official baseline replacement without reason", async () => {
  await assert.rejects(
    () => requireReplanJustification(createConn([{ id: 7, baseline_number: 1 }]), 42, " "),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "REPLAN_JUSTIFICATION_REQUIRED");
      return true;
    }
  );
});

test("requireReplanJustification accepts official baseline replacement with reason", async () => {
  const result = await requireReplanJustification(createConn([{ id: 7, baseline_number: 1 }]), 42, " Mudança aprovada pelo cliente ");

  assert.equal(result.hasOfficialBaseline, true);
  assert.equal(result.baseline.id, 7);
  assert.equal(result.justification, "Mudança aprovada pelo cliente");
});
