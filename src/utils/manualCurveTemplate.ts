export function normalizeManualCurveTemplatePercent(value: unknown) {
  if (value == null || value === "") return "";
  const raw = typeof value === "object" && value && "result" in value ? (value as { result: unknown }).result : value;
  const parsed = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(parsed)) return "";
  const percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return String(Math.min(100, Math.max(0, Number(percent.toFixed(2)))));
}

export function normalizeManualCurveTemplateDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 1 && value < 200000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 86400000).toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
    return parsed.toISOString().slice(0, 10);
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return "";
}

export function normalizeManualCurveTemplateHeader(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
