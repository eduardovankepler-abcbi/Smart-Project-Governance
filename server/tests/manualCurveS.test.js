const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateProjectWeeklyDates,
  generateWeeklyDates,
  normalizePercent,
} = require("../utils/manualCurveS");

test("generateWeeklyDates creates one point for each Monday in project range", () => {
  assert.deepEqual(
    generateWeeklyDates("2026-06-02", "2026-06-30"),
    ["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]
  );
});

test("generateWeeklyDates keeps Monday when project starts on Monday", () => {
  assert.deepEqual(
    generateWeeklyDates("2026-06-01", "2026-06-15"),
    ["2026-06-01", "2026-06-08", "2026-06-15"]
  );
});

test("generateProjectWeeklyDates reads typed project date fields", () => {
  assert.deepEqual(
    generateProjectWeeklyDates({
      data_inicio_planej_date: "2026-07-03",
      data_fim_planej_date: "2026-07-17",
    }),
    ["2026-07-06", "2026-07-13"]
  );
});

test("normalizePercent accepts template decimal values and clamps range", () => {
  assert.equal(normalizePercent(0.35), 35);
  assert.equal(normalizePercent("65"), 65);
  assert.equal(normalizePercent("-10"), 0);
  assert.equal(normalizePercent("140"), 100);
});
