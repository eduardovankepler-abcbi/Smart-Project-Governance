import { parseFlexibleDate } from "@/utils/dateUtils";

export function parseKanbanDate(value?: unknown): Date | null {
  return parseFlexibleDate(value);
}

export function formatKanbanShortDate(value?: unknown) {
  const date = parseKanbanDate(value);
  if (!date) return "Sem prazo";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function formatKanbanFullDate(value?: unknown) {
  const date = parseKanbanDate(value);
  if (!date) return "Não informado";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}
