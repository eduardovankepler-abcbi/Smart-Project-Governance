import type { Tarefa } from "@/data/projectData";
import type { PdfExportOptions } from "@/utils/exportUtils";
import { formatDateForExport } from "@/utils/dateUtils";
import {
  formatDurationHours,
  getTaskPredecessorLabel,
  getTaskResourceLabel,
} from "@/utils/projectModel";
import { getTaskBusinessId, getTaskDisplayHierarchy } from "@/utils/taskIdentity";

export const TASK_EXPORT_HEADERS = [
  "ID",
  "WBS",
  "Pai",
  "Projeto",
  "Tarefa",
  "Recursos",
  "Pred.",
  "Início Prev.",
  "Fim Prev.",
  "Início Real",
  "Fim Real",
  "Duração",
  "%",
  "Status",
];

export const TASK_EXCEL_HEADERS = [
  "ID",
  "WBS",
  "Pai",
  "Projeto",
  "Tarefa",
  "Recursos",
  "Predecessoras",
  "Início Previsto",
  "Fim Previsto",
  "Início Real",
  "Fim Real",
  "Duração (h)",
  "%",
  "Status",
];

export const TASK_PDF_OPTIONS: PdfExportOptions = {
  format: "a3",
  fontSize: 6.5,
  cellPadding: 1.4,
  columnStyles: {
    0: { cellWidth: 18 },
    1: { cellWidth: 16 },
    2: { cellWidth: 16 },
    3: { cellWidth: 32 },
    4: { cellWidth: 48 },
    5: { cellWidth: 34 },
    6: { cellWidth: 34 },
    7: { cellWidth: 18, halign: "center" },
    8: { cellWidth: 18, halign: "center" },
    9: { cellWidth: 18, halign: "center" },
    10: { cellWidth: 18, halign: "center" },
    11: { cellWidth: 18, halign: "right" },
    12: { cellWidth: 12, halign: "right" },
    13: { cellWidth: 24 },
  },
};

export function buildTaskPdfRows(tasks: Tarefa[]): (string | number)[][] {
  return tasks.map((task) => [
    getTaskBusinessId(task),
    getTaskDisplayHierarchy(task),
    task.parentId || "—",
    task.projeto,
    task.tarefa,
    getTaskResourceLabel(task),
    getTaskPredecessorLabel(task),
    formatDateForExport(task.dataInicioPlanej),
    formatDateForExport(task.dataFimPlanej),
    formatDateForExport(task.dataInicioReal),
    formatDateForExport(task.dataFimReal),
    formatDurationHours(task.durationMinutes || 0),
    `${task.percentual}%`,
    task.status,
  ]);
}

export function buildTaskExcelRows(tasks: Tarefa[]): (string | number)[][] {
  return tasks.map((task) => [
    getTaskBusinessId(task),
    getTaskDisplayHierarchy(task),
    task.parentId || "",
    task.projeto,
    task.tarefa,
    getTaskResourceLabel(task),
    getTaskPredecessorLabel(task),
    formatDateForExport(task.dataInicioPlanej),
    formatDateForExport(task.dataFimPlanej),
    formatDateForExport(task.dataInicioReal),
    formatDateForExport(task.dataFimReal),
    (task.durationMinutes || 0) / 60,
    task.percentual,
    task.status,
  ]);
}
