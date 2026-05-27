export function normalizeMaxUnits(value: number | string | undefined | null, defaultValue = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return defaultValue;
  return numeric > 10 ? numeric / 100 : numeric;
}

export function formatCapacityPercent(value: number | string | undefined | null) {
  return `${Math.round(normalizeMaxUnits(value) * 100)}%`;
}
