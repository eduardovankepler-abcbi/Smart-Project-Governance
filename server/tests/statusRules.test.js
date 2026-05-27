const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveProjectStatus, deriveTaskStatus, TASK_STATUSES } = require("../utils/statusRules");

const TODAY = new Date("2026-05-27T12:00:00");

test("deriveTaskStatus marks completed tasks by progress or real finish", () => {
  assert.equal(deriveTaskStatus({ percentual: 100 }, { today: TODAY }), TASK_STATUSES.DONE);
  assert.equal(deriveTaskStatus({ percentual: 20, dataFimReal: "2026-05-20" }, { today: TODAY }), TASK_STATUSES.DONE);
});

test("deriveTaskStatus marks unfinished overdue tasks as late", () => {
  assert.equal(
    deriveTaskStatus({ percentual: 90, dataFimPlanej: "2026-05-26" }, { today: TODAY }),
    TASK_STATUSES.LATE
  );
});

test("deriveTaskStatus derives in-progress and not-started states", () => {
  assert.equal(
    deriveTaskStatus({ percentual: 10, dataFimPlanej: "2026-06-10" }, { today: TODAY }),
    TASK_STATUSES.IN_PROGRESS
  );
  assert.equal(
    deriveTaskStatus({ percentual: 0, dataInicioPlanej: "2026-06-01", dataFimPlanej: "2026-06-10" }, { today: TODAY }),
    TASK_STATUSES.NOT_STARTED
  );
});

test("deriveProjectStatus summarizes task statuses by management severity", () => {
  assert.equal(deriveProjectStatus([{ status: "Concluído", percentual: 100 }]), TASK_STATUSES.DONE);
  assert.equal(
    deriveProjectStatus([
      { status: "Concluído", percentual: 100 },
      { percentual: 20, dataFimPlanej: "2026-05-26" },
    ]),
    TASK_STATUSES.LATE
  );
});
