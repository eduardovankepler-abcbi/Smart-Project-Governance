import type { Projeto } from "@/data/projectData";

export type FinancialStatus = "no_budget" | "healthy" | "attention" | "overrun";

export interface ProjectFinancialMetrics {
  plannedCost: number;
  approvedBudget: number;
  spent: number;
  progressPct: number;
  actualBalance: number;
  projectedBalance: number;
  consumptionPct: number;
  plannedConsumptionPct: number;
  planVariance: number;
  planVariancePct: number;
  eac: number;
  etc: number;
  status: FinancialStatus;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculateProjectFinancialMetrics(project: Projeto): ProjectFinancialMetrics {
  const plannedCost = Number(project.valorPrevisto || 0);
  const approvedBudget = Number(project.orcamentoAprovado || 0);
  const spent = Number(project.valorGasto || 0);
  const progressPct = clampPercent(Number(project.conclusao || 0));
  const progressRatio = progressPct / 100;
  const actualBalance = approvedBudget - spent;
  const consumptionPct = approvedBudget > 0 ? (spent / approvedBudget) * 100 : 0;
  const plannedConsumptionPct = approvedBudget > 0 ? (plannedCost / approvedBudget) * 100 : 0;
  const planVariance = approvedBudget - plannedCost;
  const planVariancePct = approvedBudget > 0 ? (planVariance / approvedBudget) * 100 : 0;

  const eac =
    progressRatio > 0 && spent > 0
      ? spent / progressRatio
      : Math.max(plannedCost, spent);
  const etc = Math.max(eac - spent, 0);
  const projectedBalance = approvedBudget - eac;

  let status: FinancialStatus = "healthy";
  if (approvedBudget <= 0) status = "no_budget";
  else if (spent > approvedBudget || eac > approvedBudget) status = "overrun";
  else if (consumptionPct >= 85 || plannedConsumptionPct > 100 || projectedBalance < approvedBudget * 0.1) status = "attention";

  return {
    plannedCost: roundMoney(plannedCost),
    approvedBudget: roundMoney(approvedBudget),
    spent: roundMoney(spent),
    progressPct,
    actualBalance: roundMoney(actualBalance),
    projectedBalance: roundMoney(projectedBalance),
    consumptionPct: Math.round(consumptionPct),
    plannedConsumptionPct: Math.round(plannedConsumptionPct),
    planVariance: roundMoney(planVariance),
    planVariancePct: Math.round(planVariancePct),
    eac: roundMoney(eac),
    etc: roundMoney(etc),
    status,
  };
}

export function summarizeProjectFinancials(projects: Projeto[]) {
  const totals = projects.reduce(
    (acc, project) => {
      const metrics = calculateProjectFinancialMetrics(project);
      acc.plannedCost += metrics.plannedCost;
      acc.approvedBudget += metrics.approvedBudget;
      acc.spent += metrics.spent;
      acc.eac += metrics.eac;
      acc.etc += metrics.etc;
      if (metrics.status === "overrun") acc.overrun += 1;
      if (metrics.status === "attention") acc.attention += 1;
      if (metrics.status === "no_budget") acc.noBudget += 1;
      return acc;
    },
    { plannedCost: 0, approvedBudget: 0, spent: 0, eac: 0, etc: 0, overrun: 0, attention: 0, noBudget: 0 }
  );

  const actualBalance = totals.approvedBudget - totals.spent;
  const projectedBalance = totals.approvedBudget - totals.eac;

  return {
    plannedCost: roundMoney(totals.plannedCost),
    approvedBudget: roundMoney(totals.approvedBudget),
    spent: roundMoney(totals.spent),
    eac: roundMoney(totals.eac),
    etc: roundMoney(totals.etc),
    actualBalance: roundMoney(actualBalance),
    projectedBalance: roundMoney(projectedBalance),
    consumptionPct: totals.approvedBudget > 0 ? Math.round((totals.spent / totals.approvedBudget) * 100) : 0,
    projectedConsumptionPct: totals.approvedBudget > 0 ? Math.round((totals.eac / totals.approvedBudget) * 100) : 0,
    overrun: totals.overrun,
    attention: totals.attention,
    noBudget: totals.noBudget,
  };
}
