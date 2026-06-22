import type { Projeto } from "@/data/projectData";
import { formatCurrency } from "@/data/projectData";
import { formatDateForExport } from "@/utils/dateUtils";
import { calculateProjectFinancialMetrics, type FinancialStatus } from "@/utils/financialMetrics";
import type { PdfExportOptions } from "@/utils/exportUtils";

export const PROJECT_FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  no_budget: "Sem orçamento",
  healthy: "Saudável",
  attention: "Atenção",
  overrun: "Estouro projetado",
};

export const PROJECT_EXPORT_HEADERS = [
  "ID do Projeto",
  "Unidade de Negócio",
  "Produto",
  "Projeto",
  "Responsável",
  "Prioridade",
  "Status",
  "Início Prev.",
  "Fim Prev.",
  "Conclusão",
  "Custo Planejado",
  "Orçamento Aprovado",
  "Valor Gasto",
  "EAC",
  "ETC",
  "Saldo Projetado",
  "Saúde Financeira",
];

export const PROJECT_EXCEL_HEADERS = [
  "ID do Projeto",
  "Unidade de Negócio",
  "Produto",
  "Projeto",
  "Responsável",
  "Prioridade",
  "Status",
  "Início Previsto",
  "Fim Previsto",
  "Conclusão %",
  "Custo Planejado",
  "Orçamento Aprovado",
  "Valor Gasto",
  "EAC",
  "ETC",
  "Saldo Projetado",
  "Saúde Financeira",
];

export const PROJECT_PDF_OPTIONS: PdfExportOptions = {
  format: "a3",
  fontSize: 6,
  cellPadding: 1.4,
  columnStyles: {
    0: { cellWidth: 22 },
    1: { cellWidth: 24 },
    2: { cellWidth: 24 },
    3: { cellWidth: 40 },
    4: { cellWidth: 30 },
    5: { cellWidth: 18 },
    6: { cellWidth: 22 },
    7: { cellWidth: 18, halign: "center" },
    8: { cellWidth: 18, halign: "center" },
    9: { cellWidth: 16, halign: "right" },
    10: { cellWidth: 24, halign: "right" },
    11: { cellWidth: 24, halign: "right" },
    12: { cellWidth: 24, halign: "right" },
    13: { cellWidth: 22, halign: "right" },
    14: { cellWidth: 22, halign: "right" },
    15: { cellWidth: 24, halign: "right" },
    16: { cellWidth: 24 },
  },
};

export function buildProjectPdfRows(projects: Projeto[]): (string | number)[][] {
  return projects.map((project) => {
    const finance = calculateProjectFinancialMetrics(project);
    return [
      project.projectId || "",
      project.businessUnitName || "",
      project.produtoName || "",
      project.projeto,
      project.responsavel,
      project.prioridade,
      project.status,
      formatDateForExport(project.dataInicioPlanej),
      formatDateForExport(project.dataFimPlanej),
      `${project.conclusao}%`,
      formatCurrency(finance.plannedCost),
      formatCurrency(finance.approvedBudget),
      formatCurrency(finance.spent),
      formatCurrency(finance.eac),
      formatCurrency(finance.etc),
      formatCurrency(finance.projectedBalance),
      PROJECT_FINANCIAL_STATUS_LABELS[finance.status],
    ];
  });
}

export function buildProjectExcelRows(projects: Projeto[]): (string | number)[][] {
  return projects.map((project) => {
    const finance = calculateProjectFinancialMetrics(project);
    return [
      project.projectId || "",
      project.businessUnitName || "",
      project.produtoName || "",
      project.projeto,
      project.responsavel,
      project.prioridade,
      project.status,
      formatDateForExport(project.dataInicioPlanej),
      formatDateForExport(project.dataFimPlanej),
      project.conclusao,
      finance.plannedCost,
      finance.approvedBudget,
      finance.spent,
      finance.eac,
      finance.etc,
      finance.projectedBalance,
      PROJECT_FINANCIAL_STATUS_LABELS[finance.status],
    ];
  });
}
