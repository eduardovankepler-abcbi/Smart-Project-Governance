const { normalizeDateInput } = require("./parsing");

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

function deriveProjectStatus(tasks) {
  if (!tasks.length) return "Não iniciado";
  if (tasks.every((task) => task.status === "Concluído")) return "Concluído";
  if (tasks.some((task) => task.status === "Atrasado")) return "Atrasado";
  if (tasks.some((task) => task.status === "Em andamento")) return "Em andamento";
  return "Não iniciado";
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

  const [taskRows] = await pool.query(
    "SELECT * FROM tarefas WHERE projeto = ? ORDER BY sort_order, id",
    [projeto]
  );

  const totalTarefas = taskRows.length;
  const tarefasConcluidas = taskRows.filter((task) => task.status === "Concluído").length;
  const tarefasAndamento = taskRows.filter((task) => task.status === "Em andamento").length;
  const tarefasAtrasadas = taskRows.filter((task) => task.status === "Atrasado").length;
  const tarefasNaoIniciadas = taskRows.filter((task) => task.status === "Não iniciado").length;
  const conclusao = totalTarefas
    ? Math.round(taskRows.reduce((sum, task) => sum + Number(task.percentual || 0), 0) / totalTarefas)
    : 0;
  const valorPrevisto = taskRows.reduce((sum, task) => sum + Number(task.valor_previsto || 0), 0);
  const valorGasto = taskRows.reduce((sum, task) => sum + Number(task.valor_gasto || 0), 0);
  const projectStatus = deriveProjectStatus(taskRows);

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

  const [existing] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [projeto]);

  if (existing.length) {
    await pool.query(
      `UPDATE projetos
       SET data_inicio_planej = ?, data_inicio_planej_date = ?, data_fim_planej = ?, data_fim_planej_date = ?, total_tarefas = ?, tarefas_concluidas = ?, tarefas_andamento = ?,
           tarefas_atrasadas = ?, tarefas_nao_iniciadas = ?, status = ?, conclusao = ?, valor_previsto = ?, valor_gasto = ?
       WHERE projeto = ?`,
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
        projeto,
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
  return insert.insertId;
}

module.exports = { syncProjectMetrics };
