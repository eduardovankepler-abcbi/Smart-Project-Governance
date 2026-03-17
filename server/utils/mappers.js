// ============================================
// DB Row -> API Response Mappers
// ============================================

const { normalizeDateInput } = require("./parsing");

function pickDateValue(legacyValue, typedValue) {
  return legacyValue || normalizeDateInput(typedValue) || "";
}

function mapBusinessUnit(row) {
  return {
    id: row.id,
    nome: row.nome,
    head: row.head || "",
    liderTec: row.lider_tec || "",
    liderOp: row.lider_op || "",
    comercial: row.comercial || "",
  };
}

function mapProjeto(row) {
  return {
    id: row.id,
    projectId: row.project_code,
    projectType: row.project_type || "Projeto",
    businessUnitId: row.business_unit_id || undefined,
    businessUnitName: row.business_unit_nome || "",
    produtoId: row.produto_id || undefined,
    produtoName: row.produto_nome || "",
    projeto: row.projeto,
    descricao: row.descricao,
    prioridade: row.prioridade,
    responsavel: row.responsavel,
    ftes: parseFloat(row.ftes),
    valorPrevisto: parseFloat(row.valor_previsto),
    valorGasto: parseFloat(row.valor_gasto),
    dataInicioPlanej: pickDateValue(row.data_inicio_planej, row.data_inicio_planej_date),
    dataFimPlanej: pickDateValue(row.data_fim_planej, row.data_fim_planej_date),
    dataInicio: pickDateValue(row.data_inicio, row.data_inicio_real_date),
    dataFimReal: pickDateValue(row.data_fim_real, row.data_fim_real_date),
    totalTarefas: row.total_tarefas,
    tarefasConcluidas: row.tarefas_concluidas,
    tarefasAndamento: row.tarefas_andamento,
    tarefasAtrasadas: row.tarefas_atrasadas,
    tarefasNaoIniciadas: row.tarefas_nao_iniciadas,
    status: row.status,
    conclusao: parseFloat(row.conclusao),
  };
}

function mapProduto(row) {
  return {
    id: row.id,
    nome: row.nome,
    businessUnitId: row.business_unit_id || undefined,
    businessUnitName: row.business_unit_nome || "",
  };
}

function mapAssignment(row) {
  return {
    id: row.id,
    resourceId: row.resource_id || undefined,
    resourceName: row.resource_name || "",
    units: parseFloat(row.units || 0),
    work: parseFloat(row.work || 0),
    actualWork: parseFloat(row.actual_work || 0),
    remainingWork: parseFloat(row.remaining_work || 0),
    cost: parseFloat(row.cost || 0),
  };
}

function mapDependency(row) {
  return {
    id: row.id,
    predecessorTaskId: row.predecessor_task_id,
    type: row.dependency_type || "FS",
    lagMinutes: parseInt(row.lag_minutes || 0, 10),
  };
}

function mapTarefa(row, assignments = [], predecessors = []) {
  return {
    id: row.id,
    externalId: row.external_id || "",
    wbs: row.wbs || row.id,
    outlineLevel: row.outline_level || 1,
    sortOrder: row.sort_order || 0,
    parentId: row.parent_id || "",
    projeto: row.projeto,
    tarefa: row.tarefa,
    subtarefa: row.subtarefa,
    responsavel: row.responsavel,
    funcao: row.funcao,
    dataInicioPlanej: pickDateValue(row.data_inicio_planej, row.data_inicio_planej_date),
    esforcoPlanej: parseFloat(row.esforco_planej),
    dataFimPlanej: pickDateValue(row.data_fim_planej, row.data_fim_planej_date),
    dataInicioReal: pickDateValue(row.data_inicio_real, row.data_inicio_real_date),
    esforcoReal: parseFloat(row.esforco_real),
    dataFimReal: pickDateValue(row.data_fim_real, row.data_fim_real_date),
    percentual: parseFloat(row.percentual),
    status: row.status,
    taskType: row.task_type || "fixed_units",
    milestone: !!row.is_milestone,
    durationMinutes: parseInt(row.duration_minutes || 0, 10),
    isManual: !!row.is_manual,
    constraintType: row.constraint_type || "",
    constraintDate: pickDateValue(row.constraint_date, row.constraint_date_date),
    notes: row.notes || "",
    valorPrevisto: parseFloat(row.valor_previsto),
    valorGasto: parseFloat(row.valor_gasto),
    diasPlanejados: row.dias_planejados,
    diasReal: row.dias_real,
    diasCompletados: row.dias_completados,
    assignments: assignments.map(mapAssignment),
    predecessors: predecessors.map(mapDependency),
  };
}

function mapRecurso(row) {
  return {
    externalId: row.external_id || "",
    nome: row.nome,
    funcao: row.funcao,
    seniority: row.seniority || "",
    specialties: (() => {
      try { return JSON.parse(row.specialties_json || "[]"); } catch { return []; }
    })(),
    resourceType: row.resource_type || "work",
    initials: row.initials || "",
    maxUnits: parseFloat(row.max_units || 1),
    standardRate: parseFloat(row.standard_rate || 0),
    overtimeRate: parseFloat(row.overtime_rate || 0),
    email: row.email || "",
  };
}

module.exports = { mapBusinessUnit, mapProduto, mapProjeto, mapTarefa, mapRecurso };
