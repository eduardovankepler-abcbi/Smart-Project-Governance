import { describe, expect, it } from "vitest";
import { calculateProjectFinancialMetrics, summarizeProjectFinancials } from "@/utils/financialMetrics";
import type { Projeto } from "@/data/projectData";

function project(partial: Partial<Projeto>): Projeto {
  return {
    id: 1,
    projeto: "Projeto Teste",
    descricao: "",
    prioridade: "2- Média",
    responsavel: "",
    ftes: 0,
    valorPrevisto: 0,
    orcamentoAprovado: 0,
    valorGasto: 0,
    dataInicioPlanej: "",
    dataFimPlanej: "",
    dataInicio: "",
    dataFimReal: "",
    totalTarefas: 0,
    tarefasConcluidas: 0,
    tarefasAndamento: 0,
    tarefasAtrasadas: 0,
    tarefasNaoIniciadas: 0,
    status: "Não iniciado",
    conclusao: 0,
    ...partial,
  };
}

describe("financial metrics", () => {
  it("calculates budget balance and forecast using progress", () => {
    const metrics = calculateProjectFinancialMetrics(project({
      valorPrevisto: 1000,
      orcamentoAprovado: 1200,
      valorGasto: 400,
      conclusao: 50,
    }));

    expect(metrics.actualBalance).toBe(800);
    expect(metrics.eac).toBe(800);
    expect(metrics.etc).toBe(400);
    expect(metrics.projectedBalance).toBe(400);
    expect(metrics.consumptionPct).toBe(33);
    expect(metrics.status).toBe("healthy");
  });

  it("flags projected budget overrun before actual spend exceeds budget", () => {
    const metrics = calculateProjectFinancialMetrics(project({
      valorPrevisto: 1000,
      orcamentoAprovado: 1000,
      valorGasto: 700,
      conclusao: 50,
    }));

    expect(metrics.eac).toBe(1400);
    expect(metrics.projectedBalance).toBe(-400);
    expect(metrics.status).toBe("overrun");
  });

  it("summarizes portfolio financial exposure", () => {
    const summary = summarizeProjectFinancials([
      project({ id: 1, valorPrevisto: 1000, orcamentoAprovado: 1200, valorGasto: 400, conclusao: 50 }),
      project({ id: 2, valorPrevisto: 500, orcamentoAprovado: 500, valorGasto: 100, conclusao: 25 }),
    ]);

    expect(summary.approvedBudget).toBe(1700);
    expect(summary.spent).toBe(500);
    expect(summary.eac).toBe(1200);
    expect(summary.projectedBalance).toBe(500);
  });
});
