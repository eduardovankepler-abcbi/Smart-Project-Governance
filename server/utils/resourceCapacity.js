function normalizeMaxUnits(value, defaultValue = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return defaultValue;
  return numeric > 10 ? numeric / 100 : numeric;
}

module.exports = { normalizeMaxUnits };
