const test = require("node:test");
const assert = require("node:assert/strict");
const {
  countBusinessDaysInclusive,
  cumulativeBusinessDayValue,
} = require("../utils/baselines");

function utcDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

test("countBusinessDaysInclusive ignores weekends", () => {
  assert.equal(countBusinessDaysInclusive(utcDate("2026-05-01"), utcDate("2026-05-10")), 6);
});

test("cumulativeBusinessDayValue distributes totals by working days", () => {
  const start = utcDate("2026-05-01");
  const finish = utcDate("2026-05-08");

  assert.equal(cumulativeBusinessDayValue(60, start, finish, utcDate("2026-04-30")), 0);
  assert.equal(cumulativeBusinessDayValue(60, start, finish, utcDate("2026-05-03")), 10);
  assert.equal(cumulativeBusinessDayValue(60, start, finish, utcDate("2026-05-06")), 40);
  assert.equal(cumulativeBusinessDayValue(60, start, finish, utcDate("2026-05-08")), 60);
});
