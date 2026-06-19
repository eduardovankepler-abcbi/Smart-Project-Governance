const { normalizeDateInput, sanitizeNumber, sanitizeString } = require("./parsing");

const PROJECT_FIELD_LIMITS = {
  projectId: 50,
  projeto: 200,
  descricao: 500,
  responsavel: 200,
  ftes: 999,
  money: 999999999,
};

function createValidationError(errors) {
  const error = new Error("Dados do projeto inválidos");
  error.status = 400;
  error.code = "PROJECT_VALIDATION";
  error.errors = errors;
  return error;
}

function addError(errors, field, message) {
  if (!errors[field]) errors[field] = message;
}

function normalizeNumber(value) {
  if (value == null || value === "") return 0;
  const parsed = sanitizeNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateTextLength(errors, field, label, value, maxLength) {
  if (sanitizeString(value, maxLength + 1).length > maxLength) {
    addError(errors, field, `${label} deve ter no máximo ${maxLength} caracteres.`);
  }
}

function validateNumberRange(errors, field, label, value, min, max) {
  const parsed = normalizeNumber(value);
  if (parsed == null) {
    addError(errors, field, `${label} deve ser um número válido.`);
    return;
  }
  if (parsed < min || parsed > max) {
    addError(errors, field, `${label} deve estar entre ${min} e ${max}.`);
  }
}

function parseProjectDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return parsed;
}

function validateDateRange(errors, startField, endField, startLabel, endLabel, startValue, endValue) {
  const startRaw = sanitizeString(startValue, 40);
  const endRaw = sanitizeString(endValue, 40);
  const start = parseProjectDate(startRaw);
  const end = parseProjectDate(endRaw);

  if (startRaw && !start) addError(errors, startField, `${startLabel} deve ser uma data válida.`);
  if (endRaw && !end) addError(errors, endField, `${endLabel} deve ser uma data válida.`);
  if (start && end && start.getTime() > end.getTime()) {
    addError(errors, startField, `${startLabel} não pode ser posterior a ${endLabel.toLowerCase()}.`);
    addError(errors, endField, `${endLabel} não pode ser anterior a ${startLabel.toLowerCase()}.`);
  }
}

function validateProjectPayload(project) {
  const errors = {};

  if (!sanitizeString(project.projeto, PROJECT_FIELD_LIMITS.projeto).trim()) {
    addError(errors, "projeto", "Nome do projeto é obrigatório.");
  }

  validateTextLength(errors, "projectId", "ID do projeto", project.projectId, PROJECT_FIELD_LIMITS.projectId);
  validateTextLength(errors, "projeto", "Nome do projeto", project.projeto, PROJECT_FIELD_LIMITS.projeto);
  validateTextLength(errors, "descricao", "Descrição", project.descricao, PROJECT_FIELD_LIMITS.descricao);
  validateTextLength(errors, "responsavel", "Responsável principal", project.responsavel, PROJECT_FIELD_LIMITS.responsavel);

  validateNumberRange(errors, "ftes", "FTEs previstos", project.ftes, 0, PROJECT_FIELD_LIMITS.ftes);
  validateNumberRange(errors, "valorPrevisto", "Custo planejado", project.valorPrevisto, 0, PROJECT_FIELD_LIMITS.money);
  validateNumberRange(errors, "orcamentoAprovado", "Orçamento aprovado", project.orcamentoAprovado, 0, PROJECT_FIELD_LIMITS.money);
  validateNumberRange(errors, "valorGasto", "Valor gasto", project.valorGasto, 0, PROJECT_FIELD_LIMITS.money);
  validateNumberRange(errors, "conclusao", "Conclusão física", project.conclusao, 0, 100);

  validateDateRange(errors, "dataInicioPlanej", "dataFimPlanej", "Início previsto", "Fim previsto", project.dataInicioPlanej, project.dataFimPlanej);
  validateDateRange(errors, "dataInicio", "dataFimReal", "Início real", "Fim real", project.dataInicio, project.dataFimReal);

  return errors;
}

function assertValidProjectPayload(project) {
  const errors = validateProjectPayload(project);
  if (Object.keys(errors).length > 0) throw createValidationError(errors);
}

module.exports = {
  PROJECT_FIELD_LIMITS,
  assertValidProjectPayload,
  parseProjectDate,
  validateProjectPayload,
};
