function isValidUtcDate(date: Date, year: number, month: number, day: number) {
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseFlexibleDate(value?: unknown) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return isValidUtcDate(parsed, year, month, day) ? parsed : null;
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const day = second > 12 && first <= 12 ? second : first;
    const month = second > 12 && first <= 12 ? first : second;
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return isValidUtcDate(parsed, year, month, day) ? parsed : null;
  }

  return null;
}

export function formatDateForInput(value?: unknown) {
  const parsed = parseFlexibleDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
}

export function formatDateForDisplay(value?: unknown) {
  const parsed = parseFlexibleDate(value);
  return parsed ? parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
}

export function formatDateForExport(value?: unknown) {
  return formatDateForDisplay(value);
}
