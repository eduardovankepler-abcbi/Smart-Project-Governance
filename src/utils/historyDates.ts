import { formatDateForDisplay, formatDateForInput } from "@/utils/dateUtils";

export function formatHistoryDate(value?: unknown, fallback = "—") {
  return formatDateForDisplay(value) || fallback;
}

export function formatHistoryDateForInput(value?: unknown) {
  return formatDateForInput(value);
}

export function formatHistoryDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
