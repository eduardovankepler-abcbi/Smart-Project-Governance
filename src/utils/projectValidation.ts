import type { Projeto } from "@/data/projectData";
import { formatDateForInput, parseFlexibleDate } from "@/utils/dateUtils";

type ProjectInput = Partial<Omit<Projeto, "id">>;

export type ProjectValidationErrors = Partial<Record<keyof ProjectInput, string>>;

export const PROJECT_FIELD_LIMITS = {
  projectId: 50,
  projeto: 200,
  descricao: 500,
  responsavel: 200,
  ftes: 999,
  money: 999999999,
} as const;

function normalizeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export const parseProjectDate = parseFlexibleDate;
export const formatProjectDateForInput = formatDateForInput;

function validateTextLength(errors: ProjectValidationErrors, field: keyof ProjectInput, label: string, value: unknown, maxLength: number) {
  if (String(value || "").trim().length > maxLength) {
    errors[field] = `${label} deve ter no máximo ${maxLength} caracteres.`;
  }
}

function validateNumberRange(errors: ProjectValidationErrors, field: keyof ProjectInput, label: string, value: unknown, min: number, max: number) {
  const parsed = normalizeNumber(value);
  if (parsed == null) {
    errors[field] = `${label} deve ser um número válido.`;
    return;
  }
  if (parsed < min || parsed > max) {
    errors[field] = `${label} deve estar entre ${min} e ${max}.`;
  }
}

function validateDateRange(
  errors: ProjectValidationErrors,
  startField: keyof ProjectInput,
  endField: keyof ProjectInput,
  startLabel: string,
  endLabel: string,
  startValue?: string,
  endValue?: string
) {
  const startRaw = String(startValue || "").trim();
  const endRaw = String(endValue || "").trim();
  const start = parseProjectDate(startRaw);
  const end = parseProjectDate(endRaw);

  if (startRaw && !start) errors[startField] = `${startLabel} deve ser uma data válida.`;
  if (endRaw && !end) errors[endField] = `${endLabel} deve ser uma data válida.`;
  if (start && end && start.getTime() > end.getTime()) {
    errors[startField] = `${startLabel} não pode ser posterior a ${endLabel.toLowerCase()}.`;
    errors[endField] = `${endLabel} não pode ser anterior a ${startLabel.toLowerCase()}.`;
  }
}

export function validateProjectInput(project: ProjectInput): ProjectValidationErrors {
  const errors: ProjectValidationErrors = {};

  if (!String(project.projeto || "").trim()) {
    errors.projeto = "Nome do projeto é obrigatório.";
  }
  if (!project.businessUnitId) {
    errors.businessUnitId = "Business Unit é obrigatória.";
  }

  validateTextLength(errors, "projectId", "ID do projeto", project.projectId, PROJECT_FIELD_LIMITS.projectId);
  validateTextLength(errors, "projeto", "Nome do projeto", project.projeto, PROJECT_FIELD_LIMITS.projeto);
  validateTextLength(errors, "descricao", "Descrição", project.descricao, PROJECT_FIELD_LIMITS.descricao);
  validateTextLength(errors, "responsavel", "Responsável principal", project.responsavel, PROJECT_FIELD_LIMITS.responsavel);

  validateNumberRange(errors, "ftes", "FTEs previstos", project.ftes ?? 0, 0, PROJECT_FIELD_LIMITS.ftes);
  validateNumberRange(errors, "valorPrevisto", "Custo planejado", project.valorPrevisto ?? 0, 0, PROJECT_FIELD_LIMITS.money);
  validateNumberRange(errors, "orcamentoAprovado", "Orçamento aprovado", project.orcamentoAprovado ?? 0, 0, PROJECT_FIELD_LIMITS.money);
  validateNumberRange(errors, "valorGasto", "Valor gasto", project.valorGasto ?? 0, 0, PROJECT_FIELD_LIMITS.money);
  validateNumberRange(errors, "conclusao", "Conclusão física", project.conclusao ?? 0, 0, 100);

  validateDateRange(errors, "dataInicioPlanej", "dataFimPlanej", "Início previsto", "Fim previsto", project.dataInicioPlanej, project.dataFimPlanej);
  validateDateRange(errors, "dataInicio", "dataFimReal", "Início real", "Fim real", project.dataInicio, project.dataFimReal);

  return errors;
}

export function hasProjectValidationErrors(errors: ProjectValidationErrors) {
  return Object.keys(errors).length > 0;
}
