const { normalizeDateInput } = require("./parsing");
const { TASK_STATUSES, deriveTaskStatus, deriveProjectStatus } = require("./statusRules");

function parseDateValue(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMmDdYy(date) {
  if (!(date instanceof Date)) return "";
  const year = String(date.getFullYear()).slice(-2);
  return `${date.getMonth() + 1}/${date.getDate()}/${year}`;
}

function buildProjectCode(projeto) {
  const normalized = String(projeto || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `PRJ-${normalized || Date.now()}`;
}

async function syncProjectMetrics(pool, projeto) {
  if (!projeto) return;

  const [existing] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [projeto]);
  const projectId = existing[0]?.id || null;
  const [taskRows] = await pool.query(
    "SELECT * FROM tarefas WHERE projeto_id = ? OR projeto = ? ORDER BY sort_order, id",
    [projectId || 0, projeto]
  );

  const tasksWithDerivedStatus = taskRows.map((task) => ({
    ...task,
    status: deriveTaskStatus({
      status: task.status,
      percentual: task.percentual,
      dataInicioPlanej: task.data_inicio_planej_date || task.data_inicio_planej,
      dataFimPlanej: task.data_fim_planej_date || task.data_fim_planej,
      dataInicioReal: task.data_inicio_real_date || task.data_inicio_real,
      dataFimReal: task.data_fim_real_date || task.data_fim_real,
    }),
  }));
  const totalTarefas = tasksWithDerivedStatus.length;
  const tarefasConcluidas = tasksWithDerivedStatus.filter((task) => task.status === TASK_STATUSES.DONE).length;
  const tarefasAndamento = tasksWithDerivedStatus.filter((task) => task.status === TASK_STATUSES.IN_PROGRESS).length;
  const tarefasAtrasadas = tasksWithDerivedStatus.filter((task) => task.status === TASK_STATUSES.LATE).length;
  const tarefasNaoIniciadas = tasksWithDerivedStatus.filter((task) => task.status === TASK_STATUSES.NOT_STARTED).length;
  const conclusao = totalTarefas
    ? Math.round(taskRows.reduce((sum, task) => sum + Number(task.percentual || 0), 0) / totalTarefas)
    : 0;
  const valorPrevisto = taskRows.reduce((sum, task) => sum + Number(task.valor_previsto || 0), 0);
  const valorGasto = taskRows.reduce((sum, task) => sum + Number(task.valor_gasto || 0), 0);
  const projectStatus = deriveProjectStatus(tasksWithDerivedStatus);

  const starts = taskRows
    .map((task) => parseDateValue(task.data_inicio_planej_date || task.data_inicio_planej))
    .filter(Boolean);
  const finishes = taskRows
    .map((task) => parseDateValue(task.data_fim_planej_date || task.data_fim_planej))
    .filter(Boolean);
  const earliestStart = starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : null;
  const latestFinish = finishes.length ? new Date(Math.max(...finishes.map((date) => date.getTime()))) : null;

  const plannedStartText = formatMmDdYy(earliestStart);
  const plannedStartDate = normalizeDateInput(earliestStart) || null;
  const plannedFinishText = formatMmDdYy(latestFinish);
  const plannedFinishDate = normalizeDateInput(latestFinish) || null;

  if (existing.length) {
    await pool.query(
      `UPDATE projetos
       SET data_inicio_planej = ?, data_inicio_planej_date = ?, data_fim_planej = ?, data_fim_planej_date = ?, total_tarefas = ?, tarefas_concluidas = ?, tarefas_andamento = ?,
           tarefas_atrasadas = ?, tarefas_nao_iniciadas = ?, status = ?, conclusao = ?, valor_previsto = ?, valor_gasto = ?
       WHERE id = ?`,
      [
        plannedStartText,
        plannedStartDate,
        plannedFinishText,
        plannedFinishDate,
        totalTarefas,
        tarefasConcluidas,
        tarefasAndamento,
        tarefasAtrasadas,
        tarefasNaoIniciadas,
        projectStatus,
        conclusao,
        valorPrevisto,
        valorGasto,
        existing[0].id,
      ]
    );
    return existing[0].id;
  }

  const [insert] = await pool.query(
    `INSERT INTO projetos
      (project_code, projeto, descricao, prioridade, responsavel, ftes, valor_previsto, valor_gasto, data_inicio_planej, data_inicio_planej_date, data_fim_planej, data_fim_planej_date, data_inicio, data_fim_real,
       total_tarefas, tarefas_concluidas, tarefas_andamento, tarefas_atrasadas, tarefas_nao_iniciadas, status, conclusao)
     VALUES (?, ?, '', '2- Média', '', 0, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?)`,
    [
      buildProjectCode(projeto),
      projeto,
      valorPrevisto,
      valorGasto,
      plannedStartText,
      plannedStartDate,
      plannedFinishText,
      plannedFinishDate,
      totalTarefas,
      tarefasConcluidas,
      tarefasAndamento,
      tarefasAtrasadas,
      tarefasNaoIniciadas,
      projectStatus,
      conclusao,
    ]
  );
  await pool.query(
    "UPDATE tarefas SET projeto_id = ? WHERE projeto_id IS NULL AND projeto = ?",
    [insert.insertId, projeto]
  );
  return insert.insertId;
}

module.exports = { syncProjectMetrics };
