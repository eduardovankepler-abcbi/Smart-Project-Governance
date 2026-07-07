import { formatDateForDisplay, parseFlexibleDate } from "@/utils/dateUtils";

export function parseDashboardDate(value?: unknown): Date | null {
  return parseFlexibleDate(value);
}

export function formatDashboardDate(value?: unknown, fallback = "Sem prazo") {
  return formatDateForDisplay(value) || fallback;
}

export function getMonthBucket(value?: unknown) {
  const date = parseDashboardDate(value);
  if (!date) return null;
  return {
    key: `${date.getUTCMonth() + 1}/${date.getUTCFullYear() % 100}`,
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear() % 100,
  };
}

export function daysUntil(value: unknown, now = new Date()) {
  const date = parseDashboardDate(value);
  if (!date) return null;
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((date.getTime() - todayUtc) / (1000 * 60 * 60 * 24));
}
