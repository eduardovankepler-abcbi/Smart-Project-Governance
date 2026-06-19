const test = require("node:test");
const assert = require("node:assert/strict");

const { parseProjectDate, validateProjectPayload } = require("../utils/projectValidation");

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

test("backend project validation accepts valid payload", () => {
  assert.deepEqual(validateProjectPayload(validProject), {});
});

test("backend project validation rejects invalid dates and reversed ranges", () => {
  const errors = validateProjectPayload({
    ...validProject,
    dataInicioPlanej: "2026-07-01",
    dataFimPlanej: "2026-06-30",
    dataInicio: "31/02/2026",
  });

  assert.match(errors.dataInicioPlanej, /Início previsto/);
  assert.match(errors.dataFimPlanej, /Fim previsto/);
  assert.equal(errors.dataInicio, "Início real deve ser uma data válida.");
});

test("backend project validation rejects numeric values outside limits", () => {
  const errors = validateProjectPayload({
    ...validProject,
    ftes: 1000,
    valorPrevisto: 1000000000,
    orcamentoAprovado: -1,
    valorGasto: "abc",
    conclusao: 999,
  });

  assert.match(errors.ftes, /FTEs previstos/);
  assert.match(errors.valorPrevisto, /Custo planejado/);
  assert.match(errors.orcamentoAprovado, /Orçamento aprovado/);
  assert.match(errors.valorGasto, /Valor gasto/);
  assert.equal(errors.conclusao, "Conclusão física deve estar entre 0 e 100.");
});

test("backend project validation parses ISO, pt-BR and legacy slash dates safely", () => {
  assert.equal(parseProjectDate("2026-06-19").toISOString().slice(0, 10), "2026-06-19");
  assert.equal(parseProjectDate("19/06/2026").toISOString().slice(0, 10), "2026-06-19");
  assert.equal(parseProjectDate("1/16/25").toISOString().slice(0, 10), "2025-01-16");
  assert.equal(parseProjectDate("2026-02-31"), null);
});
