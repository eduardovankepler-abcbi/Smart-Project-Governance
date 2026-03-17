const { createClient } = require("@supabase/supabase-js");
const { normalizeDateInput } = require("./parsing");

let supabaseClient = null;

function dateOrNull(value) {
  return normalizeDateInput(value) || null;
}

function isSupabaseSyncEnabled() {
  return process.env.SUPABASE_SYNC_ENABLED === "true"
    && !!process.env.SUPABASE_URL
    && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function getSupabaseClient() {
  if (!isSupabaseSyncEnabled()) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return supabaseClient;
}

function toBusinessUnitRow(row) {
  return {
    id: row.id,
    nome: row.nome,
    head: row.head || "",
    lider_tec: row.lider_tec || "",
    lider_op: row.lider_op || "",
    comercial: row.comercial || "",
  };
}

function toProjetoRow(row) {
  return {
    id: row.id,
    project_code: row.project_code || "",
    project_type: row.project_type || "Projeto",
    business_unit_id: row.business_unit_id || null,
    business_unit_nome: row.business_unit_nome || "",
    produto_id: row.produto_id || null,
    produto_nome: row.produto_nome || "",
    projeto: row.projeto,
    descricao: row.descricao,
    prioridade: row.prioridade,
    responsavel: row.responsavel,
    ftes: Number(row.ftes || 0),
    valor_previsto: Number(row.valor_previsto || 0),
    valor_gasto: Number(row.valor_gasto || 0),
    data_inicio_planej: row.data_inicio_planej || "",
    data_inicio_planej_date: dateOrNull(row.data_inicio_planej_date || row.data_inicio_planej),
    data_fim_planej: row.data_fim_planej || "",
    data_fim_planej_date: dateOrNull(row.data_fim_planej_date || row.data_fim_planej),
    data_inicio: row.data_inicio || "",
    data_inicio_real_date: dateOrNull(row.data_inicio_real_date || row.data_inicio),
    data_fim_real: row.data_fim_real || "",
    data_fim_real_date: dateOrNull(row.data_fim_real_date || row.data_fim_real),
    total_tarefas: Number(row.total_tarefas || 0),
    tarefas_concluidas: Number(row.tarefas_concluidas || 0),
    tarefas_andamento: Number(row.tarefas_andamento || 0),
    tarefas_atrasadas: Number(row.tarefas_atrasadas || 0),
    tarefas_nao_iniciadas: Number(row.tarefas_nao_iniciadas || 0),
    status: row.status || "",
    conclusao: Number(row.conclusao || 0),
  };
}

function toProdutoRow(row) {
  return {
    id: row.id,
    nome: row.nome,
    business_unit_id: row.business_unit_id || null,
    business_unit_nome: row.business_unit_nome || "",
  };
}

function toTarefaRow(row) {
  return {
    id: row.id,
    parent_id: row.parent_id || null,
    external_id: row.external_id || "",
    wbs: row.wbs || row.id,
    outline_level: Number(row.outline_level || 1),
    sort_order: Number(row.sort_order || 0),
    projeto: row.projeto,
    tarefa: row.tarefa || "",
    subtarefa: row.subtarefa || "",
    responsavel: row.responsavel || "",
    funcao: row.funcao || "",
    data_inicio_planej: row.data_inicio_planej || "",
    data_inicio_planej_date: dateOrNull(row.data_inicio_planej_date || row.data_inicio_planej),
    esforco_planej: Number(row.esforco_planej || 0),
    data_fim_planej: row.data_fim_planej || "",
    data_fim_planej_date: dateOrNull(row.data_fim_planej_date || row.data_fim_planej),
    data_inicio_real: row.data_inicio_real || "",
    data_inicio_real_date: dateOrNull(row.data_inicio_real_date || row.data_inicio_real),
    esforco_real: Number(row.esforco_real || 0),
    data_fim_real: row.data_fim_real || "",
    data_fim_real_date: dateOrNull(row.data_fim_real_date || row.data_fim_real),
    percentual: Number(row.percentual || 0),
    status: row.status || "",
    task_type: row.task_type || "fixed_units",
    is_milestone: !!row.is_milestone,
    duration_minutes: Number(row.duration_minutes || 0),
    is_manual: !!row.is_manual,
    constraint_type: row.constraint_type || "",
    constraint_date: row.constraint_date || "",
    constraint_date_date: dateOrNull(row.constraint_date_date || row.constraint_date),
    notes: row.notes || "",
    valor_previsto: Number(row.valor_previsto || 0),
    valor_gasto: Number(row.valor_gasto || 0),
    dias_planejados: Number(row.dias_planejados || 0),
    dias_real: Number(row.dias_real || 0),
    dias_completados: Number(row.dias_completados || 0),
  };
}

function toAssignmentRow(row) {
  return {
    id: row.id,
    task_id: row.task_id,
    resource_id: row.resource_id || null,
    resource_name: row.resource_name || "",
    units: Number(row.units || 0),
    work: Number(row.work || 0),
    actual_work: Number(row.actual_work || 0),
    remaining_work: Number(row.remaining_work || 0),
    cost: Number(row.cost || 0),
  };
}

function toDependencyRow(row) {
  return {
    id: row.id,
    task_id: row.task_id,
    predecessor_task_id: row.predecessor_task_id,
    dependency_type: row.dependency_type || "FS",
    lag_minutes: Number(row.lag_minutes || 0),
  };
}

function toRecursoRow(row) {
  return {
    id: row.id,
    external_id: row.external_id || "",
    nome: row.nome,
    funcao: row.funcao || "",
    seniority: row.seniority || "",
    specialties_json: row.specialties_json || "[]",
    resource_type: row.resource_type || "work",
    initials: row.initials || "",
    max_units: Number(row.max_units || 1),
    standard_rate: Number(row.standard_rate || 0),
    overtime_rate: Number(row.overtime_rate || 0),
    email: row.email || "",
  };
}

function toComentarioRow(row) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    project_id: row.project_id || null,
    project_name: row.project_name || "",
    task_id: row.task_id || null,
    task_name: row.task_name || "",
    author_user_id: row.author_user_id || null,
    author_nome: row.author_nome || "",
    content: row.content || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toAuditLogRow(row) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id || "",
    action: row.action || "",
    actor_user_id: row.actor_user_id || null,
    actor_nome: row.actor_nome || "",
    actor_role: row.actor_role || "",
    project_id: row.project_id || null,
    summary: row.summary || "",
    before_json: row.before_json || null,
    after_json: row.after_json || null,
    created_at: row.created_at,
  };
}

async function upsert(table, payload, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.from(table).upsert(payload, options);
  if (error) throw error;
}

async function deleteById(table, column, id) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq(column, id);
  if (error) throw error;
}

async function deleteWhere(table, column, id) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq(column, id);
  if (error) throw error;
}

async function syncProjeto(row) {
  if (!row) return;
  await upsert("projetos", toProjetoRow(row));
}

async function syncProduto(row) {
  if (!row) return;
  await upsert("produtos", toProdutoRow(row));
}

async function syncBusinessUnit(row) {
  if (!row) return;
  await upsert("business_units", toBusinessUnitRow(row));
}

async function syncTaskBundle(taskRow, assignmentRows = [], dependencyRows = []) {
  if (!taskRow) return;
  await upsert("tarefas", toTarefaRow(taskRow));
  await deleteWhere("task_assignments", "task_id", taskRow.id);
  await deleteWhere("task_dependencies", "task_id", taskRow.id);
  if (assignmentRows.length) await upsert("task_assignments", assignmentRows.map(toAssignmentRow));
  if (dependencyRows.length) await upsert("task_dependencies", dependencyRows.map(toDependencyRow));
}

async function syncRecurso(row) {
  if (!row) return;
  await upsert("recursos", toRecursoRow(row));
}

async function syncComentario(row) {
  if (!row) return;
  await upsert("comentarios", toComentarioRow(row));
}

async function syncAuditLog(row) {
  if (!row) return;
  await upsert("audit_logs", toAuditLogRow(row));
}

async function deleteProjeto(id) {
  await deleteById("projetos", "id", id);
}

async function deleteProduto(id) {
  await deleteById("produtos", "id", id);
}

async function deleteBusinessUnit(id) {
  await deleteById("business_units", "id", id);
}

async function deleteTaskBundle(id) {
  await deleteById("tarefas", "id", id);
  await deleteWhere("task_assignments", "task_id", id);
  await deleteWhere("task_dependencies", "task_id", id);
  await deleteWhere("task_dependencies", "predecessor_task_id", id);
}

async function deleteRecurso(id) {
  await deleteById("recursos", "id", id);
  await deleteWhere("task_assignments", "resource_id", id);
}

async function deleteComentario(id) {
  await deleteById("comentarios", "id", id);
}

async function syncFullSnapshot(pool) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const [
    [projetos],
    [businessUnits],
    [produtos],
    [tarefas],
    [recursos],
    [assignments],
    [dependencies],
    [comentarios],
    [auditLogs],
  ] = await Promise.all([
    pool.query("SELECT * FROM projetos ORDER BY id"),
    pool.query("SELECT * FROM business_units ORDER BY id"),
    pool.query("SELECT * FROM produtos ORDER BY id"),
    pool.query("SELECT * FROM tarefas ORDER BY sort_order, id"),
    pool.query("SELECT * FROM recursos ORDER BY id"),
    pool.query("SELECT * FROM task_assignments ORDER BY id"),
    pool.query("SELECT * FROM task_dependencies ORDER BY id"),
    pool.query("SELECT * FROM comentarios ORDER BY id"),
    pool.query("SELECT * FROM audit_logs ORDER BY id"),
  ]);

  let error = null;
  ({ error } = await supabase.from("audit_logs").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("comentarios").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("task_dependencies").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("task_assignments").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("tarefas").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("projetos").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("produtos").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("business_units").delete().not("id", "is", null));
  if (error) throw error;
  ({ error } = await supabase.from("recursos").delete().not("id", "is", null));
  if (error) throw error;

  if (businessUnits.length) await upsert("business_units", businessUnits.map(toBusinessUnitRow));
  if (produtos.length) await upsert("produtos", produtos.map(toProdutoRow));
  if (recursos.length) await upsert("recursos", recursos.map(toRecursoRow));
  if (projetos.length) await upsert("projetos", projetos.map(toProjetoRow));
  if (tarefas.length) await upsert("tarefas", tarefas.map(toTarefaRow));
  if (assignments.length) await upsert("task_assignments", assignments.map(toAssignmentRow));
  if (dependencies.length) await upsert("task_dependencies", dependencies.map(toDependencyRow));
  if (comentarios.length) await upsert("comentarios", comentarios.map(toComentarioRow));
  if (auditLogs.length) await upsert("audit_logs", auditLogs.map(toAuditLogRow));
}

async function checkSupabaseHealth() {
  const supabase = getSupabaseClient();
  if (!supabase) return { enabled: false, status: "disabled" };
  const { error } = await supabase.from("projetos").select("id", { head: true, count: "exact" });
  if (error) return { enabled: true, status: "error", message: error.message };
  return { enabled: true, status: "connected" };
}

module.exports = {
  isSupabaseSyncEnabled,
  syncBusinessUnit,
  syncProduto,
  syncProjeto,
  syncTaskBundle,
  syncRecurso,
  syncComentario,
  syncAuditLog,
  deleteBusinessUnit,
  deleteProduto,
  deleteProjeto,
  deleteTaskBundle,
  deleteRecurso,
  deleteComentario,
  syncFullSnapshot,
  checkSupabaseHealth,
};
