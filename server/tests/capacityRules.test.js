const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAllocationCapacityWarning,
  calculateOccupancyPercent,
  countWorkingDays,
} = require("../utils/capacityRules");

function createConn(handler) {
  return {
    query(sql, params = []) {
      return handler(sql, params);
    },
  };
}

test("countWorkingDays ignores weekends", () => {
  assert.equal(countWorkingDays(new Date("2026-05-25T00:00:00"), new Date("2026-05-31T00:00:00")), 5);
});

test("calculateOccupancyPercent compares planned work with available hours", () => {
  const result = calculateOccupancyPercent(48, 1, new Date("2026-05-25T00:00:00"), new Date("2026-05-29T00:00:00"));
  assert.equal(result.availableHours, 40);
  assert.equal(result.occupancyPct, 120);
});

test("buildAllocationCapacityWarning warns when projected work exceeds task-window capacity", async () => {
  const pool = createConn((sql, params) => {
    if (sql.includes("FROM tarefas WHERE id = ?")) {
      assert.deepEqual(params, ["T1"]);
      return [[{
        id: "T1",
        data_inicio_planej_date: "2026-05-25",
        data_fim_planej_date: "2026-05-29",
      }]];
    }
    if (sql.includes("FROM recursos WHERE id = ?")) {
      assert.deepEqual(params, [7]);
      return [[{ id: 7, nome: "Maria", max_units: 1 }]];
    }
    if (sql.includes("FROM task_assignments ta")) {
      assert.deepEqual(params, [7]);
      return [[{
        id: 10,
        work: 24,
        data_inicio_planej_date: "2026-05-25",
        data_fim_planej_date: "2026-05-29",
      }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const warning = await buildAllocationCapacityWarning(pool, {
    taskId: "T1",
    resourceId: 7,
    plannedWork: 24,
  });

  assert.equal(warning.code, "RESOURCE_OVERALLOCATED");
  assert.equal(warning.occupancyPct, 120);
});
