import { describe, expect, it } from "vitest";
import { formatProjectDateForInput, parseProjectDate, PROJECT_FIELD_LIMITS, validateProjectInput } from "@/utils/projectValidation";

const validProject = {
  projectId: "PRJ-001",
  projeto: "Projeto Valido",
  descricao: "Descricao curta",
  responsavel: "Maria",
  businessUnitId: 1,
  ftes: 2,
  valorPrevisto: 1000,
  orcamentoAprovado: 1200,
  valorGasto: 100,
  dataInicioPlanej: "2026-06-01",
  dataFimPlanej: "2026-06-30",
  dataInicio: "2026-06-02",
  dataFimReal: "2026-06-20",
  conclusao: 50,
};

describe("project validation", () => {
  it("accepts a valid project payload", () => {
    expect(validateProjectInput(validProject)).toEqual({});
  });

  it("requires project name and business unit", () => {
    const errors = validateProjectInput({ ...validProject, projeto: " ", businessUnitId: undefined });

    expect(errors.projeto).toBe("Nome do projeto é obrigatório.");
    expect(errors.businessUnitId).toBe("Business Unit é obrigatória.");
  });

  it("rejects planned and actual start dates after finish dates", () => {
    const errors = validateProjectInput({
      ...validProject,
      dataInicioPlanej: "2026-07-01",
      dataFimPlanej: "2026-06-30",
      dataInicio: "2026-06-21",
      dataFimReal: "2026-06-20",
    });

    expect(errors.dataInicioPlanej).toContain("Início previsto");
    expect(errors.dataFimPlanej).toContain("Fim previsto");
    expect(errors.dataInicio).toContain("Início real");
    expect(errors.dataFimReal).toContain("Fim real");
  });

  it("rejects impossible dates instead of allowing JavaScript rollover", () => {
    const errors = validateProjectInput({ ...validProject, dataInicioPlanej: "31/02/2026" });

    expect(errors.dataInicioPlanej).toBe("Início previsto deve ser uma data válida.");
  });

  it("accepts ISO and pt-BR dates", () => {
    expect(parseProjectDate("2026-06-19")?.toISOString().slice(0, 10)).toBe("2026-06-19");
    expect(parseProjectDate("19/06/2026")?.toISOString().slice(0, 10)).toBe("2026-06-19");
  });

  it("formats legacy slash dates for date inputs", () => {
    expect(formatProjectDateForInput("2026-06-19")).toBe("2026-06-19");
    expect(formatProjectDateForInput("19/06/2026")).toBe("2026-06-19");
    expect(formatProjectDateForInput("1/16/25")).toBe("2025-01-16");
    expect(formatProjectDateForInput("31/02/2026")).toBe("");
  });

  it("rejects out-of-range numeric values", () => {
    const errors = validateProjectInput({
      ...validProject,
      ftes: PROJECT_FIELD_LIMITS.ftes + 1,
      valorPrevisto: PROJECT_FIELD_LIMITS.money + 1,
      orcamentoAprovado: -1,
      valorGasto: Number.NaN,
      conclusao: 999,
    });

    expect(errors.ftes).toContain("FTEs previstos");
    expect(errors.valorPrevisto).toContain("Custo planejado");
    expect(errors.orcamentoAprovado).toContain("Orçamento aprovado");
    expect(errors.valorGasto).toContain("Valor gasto");
    expect(errors.conclusao).toBe("Conclusão física deve estar entre 0 e 100.");
  });

  it("rejects text fields beyond configured limits", () => {
    const errors = validateProjectInput({
      ...validProject,
      projectId: "A".repeat(PROJECT_FIELD_LIMITS.projectId + 1),
      projeto: "B".repeat(PROJECT_FIELD_LIMITS.projeto + 1),
      descricao: "C".repeat(PROJECT_FIELD_LIMITS.descricao + 1),
      responsavel: "D".repeat(PROJECT_FIELD_LIMITS.responsavel + 1),
    });

    expect(errors.projectId).toContain("ID do projeto");
    expect(errors.projeto).toContain("Nome do projeto");
    expect(errors.descricao).toContain("Descrição");
    expect(errors.responsavel).toContain("Responsável principal");
  });
});
