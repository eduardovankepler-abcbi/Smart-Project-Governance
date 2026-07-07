import { parseFlexibleDate } from "@/utils/dateUtils";

export function parseGanttDate(value?: unknown): Date | null {
  return parseFlexibleDate(value);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
