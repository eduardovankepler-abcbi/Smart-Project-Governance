export interface CapacityPeriod {
  start: Date | null;
  end: Date | null;
}

function normalizeDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function countWorkingDays(start: Date | null, end: Date | null) {
  if (!start || !end) return 0;
  const first = normalizeDateOnly(new Date(Math.min(start.getTime(), end.getTime())));
  const last = normalizeDateOnly(new Date(Math.max(start.getTime(), end.getTime())));
  let days = 0;
  for (let cursor = new Date(first); cursor.getTime() <= last.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

export function calculateBusinessDayOverlapFactor(startDate: Date | null, finishDate: Date | null, period: CapacityPeriod) {
  if (!period.start || !period.end) return 1;
  if (!startDate && !finishDate) return 0;
  const taskStart = startDate || finishDate;
  const taskEnd = finishDate || startDate;
  if (!taskStart || !taskEnd) return 0;

  const normalizedTaskStart = normalizeDateOnly(taskStart);
  const normalizedTaskEnd = normalizeDateOnly(taskEnd);
  const normalizedPeriodStart = normalizeDateOnly(period.start);
  const normalizedPeriodEnd = normalizeDateOnly(period.end);

  const overlapStart = new Date(Math.max(normalizedTaskStart.getTime(), normalizedPeriodStart.getTime()));
  const overlapEnd = new Date(Math.min(normalizedTaskEnd.getTime(), normalizedPeriodEnd.getTime()));
  if (overlapEnd.getTime() < overlapStart.getTime()) return 0;

  const totalWorkingDays = countWorkingDays(normalizedTaskStart, normalizedTaskEnd);
  if (totalWorkingDays <= 0) return 0;
  const overlapWorkingDays = countWorkingDays(overlapStart, overlapEnd);
  return Math.min(overlapWorkingDays / totalWorkingDays, 1);
}
