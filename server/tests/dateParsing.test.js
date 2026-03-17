const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDateInput } = require("../utils/parsing");

test("normalizeDateInput accepts ISO dates", () => {
  assert.equal(normalizeDateInput("2026-03-13"), "2026-03-13");
});

test("normalizeDateInput converts US-style slash dates", () => {
  assert.equal(normalizeDateInput("1/16/26"), "2026-01-16");
  assert.equal(normalizeDateInput("12/3/25"), "2025-12-03");
});

test("normalizeDateInput converts BR-style slash dates when day exceeds 12", () => {
  assert.equal(normalizeDateInput("25/3/26"), "2026-03-25");
});

test("normalizeDateInput rejects non-date strings", () => {
  assert.equal(normalizeDateInput("Em andamento"), "");
  assert.equal(normalizeDateInput(""), "");
});

test("normalizeDateInput handles Date objects and ISO values used by typed columns", () => {
  assert.equal(normalizeDateInput(new Date("2026-03-16T12:00:00Z")), "2026-03-16");
  assert.equal(normalizeDateInput("2026-04-01"), "2026-04-01");
});
