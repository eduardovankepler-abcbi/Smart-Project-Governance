import ExcelJS from "exceljs";
import type { Projeto, Tarefa, Recurso } from "@/data/projectData";

function str(val: unknown, maxLen = 255): string {
  if (val == null) return "";
  const unwrapped = unwrapCellValue(val);
  if (unwrapped instanceof Date) return formatDate(unwrapped).slice(0, maxLen);
  return String(unwrapped ?? "").slice(0, maxLen).trim();
}

function num(val: unknown, def = 0): number {
  const unwrapped = unwrapCellValue(val);
  if (unwrapped == null || unwrapped === "") return def;
  if (typeof unwrapped === "number") return unwrapped;
  const raw = String(unwrapped).trim().replace(/\s/g, "").replace(/[R$€]/g, "");
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  const normalized = lastComma > lastDot
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const n = parseFloat(normalized);
  return isNaN(n) ? def : n;
}

function int(val: unknown, def = 0): number {
  const n = Math.round(num(val, def));
  return isNaN(n) ? def : n;
}

function normalize(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s%.-]+/g, " ")
    .trim();
}

function formatDate(date: Date): string {
  if (isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
}

function dateStr(val: unknown): string {
  const unwrapped = unwrapCellValue(val);
  if (!unwrapped) return "";
  if (unwrapped instanceof Date) return formatDate(unwrapped);
  if (typeof unwrapped === "number" && unwrapped > 1 && unwrapped < 200000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return formatDate(new Date(epoch.getTime() + unwrapped * 86400000));
  }
  const raw = String(unwrapped).trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${Number(iso[2])}/${Number(iso[3])}/${iso[1].slice(-2)}`;
  }
  return raw.slice(0, 20);
}

function unwrapCellValue(val: unknown): unknown {
  if (val == null) return "";
  if (val instanceof Date) return val;
  if (typeof val !== "object") return val;

  const cell = val as Record<string, unknown>;
  if (Array.isArray(cell.richText)) {
    return cell.richText
      .map((part) => typeof part === "object" && part && "text" in part ? String((part as { text: unknown }).text) : "")
      .join("");
  }
  if ("result" in cell) return unwrapCellValue(cell.result);
  if ("text" in cell) return unwrapCellValue(cell.text);
  if ("formula" in cell && "result" in cell) return unwrapCellValue(cell.result);

  return val;
}

function isEmptyCellValue(val: unknown): boolean {
  const unwrapped = unwrapCellValue(val);
  return unwrapped == null || String(unwrapped).trim() === "";
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Erro ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

function findSheet(workbook: ExcelJS.Workbook, ...names: string[]): ExcelJS.Worksheet | undefined {
  const normalizedNames = names.map(normalize);
  let found: ExcelJS.Worksheet | undefined;

  workbook.eachSheet((ws) => {
    if (found) return;
    const wsName = normalize(ws.name);
    // Exact match
    if (normalizedNames.includes(wsName)) { found = ws; return; }
    // Starts with or contains
    for (const n of normalizedNames) {
      if (wsName.startsWith(n) || wsName.includes(n) || n.includes(wsName)) { found = ws; return; }
    }
  });
  return found;
}

function sheetToObjects(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const headers: string[] = [];
  const rowCount = sheet.rowCount;
  const colCount = sheet.columnCount;

  console.log(`[ExcelImport] Aba "${sheet.name}": ${rowCount} linhas, ${colCount} colunas`);

  // Find the most likely header row. Some exported spreadsheets include
  // titles or blank metadata rows before the real table header.
  let headerRowNum = 0;
  let bestScore = 0;
  const knownHeaders = [
    "id", "projeto", "tarefa", "nome", "responsavel", "status",
    "data inicio", "data fim", "valor previsto", "valor gasto",
    "funcao", "prioridade", "parent id",
  ];

  for (let r = 1; r <= Math.min(rowCount, 10); r++) {
    const row = sheet.getRow(r);
    let nonEmpty = 0;
    let score = 0;
    for (let c = 1; c <= colCount; c++) {
      const val = unwrapCellValue(row.getCell(c).value);
      if (!isEmptyCellValue(val)) {
        nonEmpty++;
        const normalized = normalize(String(val));
        if (knownHeaders.some(h => normalized === h || normalized.includes(h))) score += 2;
      }
    }
    score += Math.min(nonEmpty, 4);
    if (nonEmpty >= 2 && score > bestScore) {
      bestScore = score;
      headerRowNum = r;
    }
  }

  if (headerRowNum === 0) {
    console.warn(`[ExcelImport] Nenhuma linha de cabeçalho encontrada na aba "${sheet.name}"`);
    return rows;
  }

  // Read headers
  const headerRow = sheet.getRow(headerRowNum);
  for (let c = 1; c <= colCount; c++) {
    const val = unwrapCellValue(headerRow.getCell(c).value);
    headers[c] = val != null ? str(val) : "";
  }
  console.log(`[ExcelImport] Cabeçalhos (linha ${headerRowNum}):`, headers.filter(Boolean));

  // Read data rows
  for (let r = headerRowNum + 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, unknown> = {};
    let hasData = false;
    for (let c = 1; c <= colCount; c++) {
      if (!headers[c]) continue;
      const cell = row.getCell(c);
      const val = unwrapCellValue(cell.value);
      if (!isEmptyCellValue(val)) {
        obj[headers[c]] = val;
        hasData = true;
      }
    }
    if (hasData) rows.push(obj);
  }

  console.log(`[ExcelImport] Aba "${sheet.name}": ${rows.length} registros lidos`);
  if (rows.length > 0) {
    console.log(`[ExcelImport] Primeira linha:`, Object.keys(rows[0]));
  }
  return rows;
}

function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  // Exact match first
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  // Normalized match fallback
  const normalizedKeys = keys.map(normalize);
  for (const [rowKey, val] of Object.entries(row)) {
    const nk = normalize(rowKey);
    for (const nTarget of normalizedKeys) {
      if (nk === nTarget || nk.startsWith(nTarget) || nk.includes(nTarget)) return val;
    }
  }
  return undefined;
}

function hasColumns(row: Record<string, unknown> | undefined, ...keys: string[]): boolean {
  if (!row) return false;
  return keys.every(key => col(row, key) !== undefined);
}

function findSheetByColumns(workbook: ExcelJS.Workbook, ...keys: string[]): ExcelJS.Worksheet | undefined {
  let found: ExcelJS.Worksheet | undefined;
  workbook.eachSheet((sheet) => {
    if (found) return;
    const rows = sheetToObjects(sheet);
    if (hasColumns(rows[0], ...keys)) found = sheet;
  });
  return found;
}

function cleanTaskName(value: unknown): string {
  return str(value, 500).replace(/^\s*\d+(?:\.\d+)*\s*->\s*/, "").trim();
}

function parentFromWbs(wbs: string): string {
  const parts = String(wbs || "").split(".").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(".") : "";
}

function outlineLevelFromWbs(wbs: string): number {
  return String(wbs || "").split(".").filter(Boolean).length || 1;
}

function parseDurationHours(value: unknown): number {
  const raw = str(value, 50);
  if (!raw) return 0;
  const n = num(raw);
  if (/day/i.test(raw)) return n * 8;
  if (/min/i.test(raw)) return n / 60;
  return n;
}

function mapScheduleStatus(value: unknown, progress = 0): string {
  const raw = normalize(str(value, 50));
  if (raw.includes("complete") || raw.includes("concluido")) return "Concluído";
  if (raw.includes("delay") || raw.includes("atras")) return "Atrasado";
  if (raw.includes("not started") || raw.includes("nao iniciado")) return "Não iniciado";
  if (raw.includes("progress") || raw.includes("andamento")) return "Em andamento";
  if (progress >= 100) return "Concluído";
  if (progress > 0) return "Em andamento";
  return "Não iniciado";
}

function buildProjectCode(projectName: string): string {
  return `PRJ-${projectName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || Date.now()}`;
}

function parseEdrawSchedule(workbook: ExcelJS.Workbook, file: File): ImportResult | null {
  const scheduleSheet = findSheetByColumns(workbook, "ID", "WBS", "Task", "Start", "Finish");
  if (!scheduleSheet) return null;

  const scheduleRows = sheetToObjects(scheduleSheet);
  if (!scheduleRows.length) return null;

  const rootRow = scheduleRows[0];
  const projectName = cleanTaskName(col(rootRow, "Task", "Tarefa")) || file.name.replace(/\.(xlsx|xlsm)$/i, "");

  const externalIdToWbs = new Map<string, string>();
  scheduleRows.forEach((row, index) => {
    const wbs = str(col(row, "WBS", "wbs"), 50) || str(col(row, "ID", "id"), 20) || String(index + 1);
    const externalId = str(col(row, "ID", "id"), 50) || String(index + 1);
    externalIdToWbs.set(externalId, wbs);
  });

  const tarefas: Tarefa[] = scheduleRows.map((row, index) => {
    const wbs = str(col(row, "WBS", "wbs"), 50) || str(col(row, "ID", "id"), 20) || String(index + 1);
    const externalId = str(col(row, "ID", "id"), 50) || String(index + 1);
    const effortHours = parseDurationHours(col(row, "Duration", "Duração", "Duracao"));
    const percentual = num(col(row, "Progress", "% Concluído", "% Concluido", "percentual"));
    const status = mapScheduleStatus(col(row, "Status"), percentual);
    const start = dateStr(col(row, "Start", "Início", "Inicio", "Data Início Planejado"));
    const finish = dateStr(col(row, "Finish", "Fim", "Data Fim Planejado"));
    const actualStart = dateStr(col(row, "ActualStart", "Actual Start", "Data Início Real"));
    const actualFinish = dateStr(col(row, "ActualFinish", "Actual Finish", "Data Fim Real"));
    const diasPlanejados = Math.max(Math.round(effortHours / 8), 0);

    return {
      id: wbs,
      externalId,
      parentId: parentFromWbs(wbs),
      wbs,
      outlineLevel: outlineLevelFromWbs(wbs),
      sortOrder: int(externalId, index + 1),
      projeto: projectName,
      tarefa: cleanTaskName(col(row, "Task", "Tarefa")) || `Tarefa ${externalId}`,
      subtarefa: "",
      responsavel: str(col(row, "Resources", "Recursos", "Responsável", "Responsavel"), 500),
      funcao: "",
      dataInicioPlanej: start,
      esforcoPlanej: effortHours,
      dataFimPlanej: finish,
      dataInicioReal: actualStart,
      esforcoReal: actualStart || actualFinish ? effortHours * (percentual / 100) : 0,
      dataFimReal: actualFinish,
      percentual,
      status,
      durationMinutes: Math.round(effortHours * 60),
      valorPrevisto: 0,
      valorGasto: 0,
      diasPlanejados,
      diasReal: diasPlanejados,
      diasCompletados: Math.round(diasPlanejados * (percentual / 100)),
      predecessors: parsePredecessors(str(col(row, "Predecessors", "Predecessoras"), 200), externalIdToWbs),
    };
  });

  const resourceSheet = findSheetByColumns(workbook, "Name", "Max Units", "Type");
  let recursos: Recurso[] = [];
  if (resourceSheet) {
    recursos = sheetToObjects(resourceSheet)
      .map(row => ({
        externalId: str(col(row, "ID", "id"), 50),
        nome: str(col(row, "Name", "Nome"), 200),
        funcao: str(col(row, "Group", "Função", "Funcao", "Type"), 200),
        resourceType: str(col(row, "Type"), 50).toLowerCase().includes("people") ? "work" : str(col(row, "Type"), 50),
        maxUnits: num(col(row, "Max Units", "MaxUnits"), 1),
        standardRate: num(col(row, "Standard Rate", "Cost Per")),
        overtimeRate: num(col(row, "Overtime Rate")),
        email: str(col(row, "E-Mail", "Email"), 200),
      }))
      .filter(resource => resource.nome);
  }

  if (!recursos.length) {
    const names = new Set<string>();
    tarefas.forEach(task => task.responsavel.split(";").map(name => name.trim()).filter(Boolean).forEach(name => names.add(name)));
    recursos = Array.from(names).sort().map(nome => ({ nome, funcao: "" }));
  }

  const conclusao = tarefas.length ? Math.round(tarefas.reduce((sum, task) => sum + task.percentual, 0) / tarefas.length) : 0;
  const projeto: Projeto = {
    id: 1,
    projectId: buildProjectCode(projectName),
    projeto: projectName,
    descricao: `Importado de ${file.name}`,
    prioridade: "2- Média",
    responsavel: tarefas[0]?.responsavel || "",
    ftes: recursos.length,
    valorPrevisto: 0,
    valorGasto: 0,
    dataInicioPlanej: tarefas[0]?.dataInicioPlanej || "",
    dataFimPlanej: tarefas[0]?.dataFimPlanej || "",
    dataInicio: tarefas[0]?.dataInicioPlanej || "",
    dataFimReal: "",
    totalTarefas: tarefas.length,
    tarefasConcluidas: tarefas.filter(task => task.status === "Concluído").length,
    tarefasAndamento: tarefas.filter(task => task.status === "Em andamento").length,
    tarefasAtrasadas: tarefas.filter(task => task.status === "Atrasado").length,
    tarefasNaoIniciadas: tarefas.filter(task => task.status === "Não iniciado").length,
    status: mapScheduleStatus(tarefas[0]?.status, conclusao),
    conclusao,
  };

  return {
    projetos: [projeto],
    tarefas,
    recursos,
    counts: { projetos: 1, tarefas: tarefas.length, recursos: recursos.length },
  };
}

function parsePredecessors(value: string, externalIdToTaskId = new Map<string, string>()): Tarefa["predecessors"] {
  return String(value || "")
    .split(";")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const match = item.match(/^(.+?)(FS|SS|FF|SF)?$/i);
      const rawId = match?.[1]?.trim() || item;
      return {
        predecessorTaskId: externalIdToTaskId.get(rawId) || rawId,
        type: (match?.[2]?.toUpperCase() || "FS") as string,
        lagMinutes: 0,
      };
    });
}

export interface ImportResult {
  projetos?: Projeto[];
  tarefas?: Tarefa[];
  recursos?: Recurso[];
  counts: { projetos: number; tarefas: number; recursos: number };
}

export async function parseExcelFile(file: File): Promise<ImportResult> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetNames: string[] = [];
  workbook.eachSheet((ws) => sheetNames.push(ws.name));
  console.log("[ExcelImport] Abas encontradas:", sheetNames);

  const result: ImportResult = { counts: { projetos: 0, tarefas: 0, recursos: 0 } };

  // Projetos
  const projetoSheet = findSheet(workbook, "Projeto", "Projetos");
  if (projetoSheet) {
    const data = sheetToObjects(projetoSheet);
    result.projetos = data.map(r => ({
      id: int(col(r, "ID", "id")),
      projeto: str(col(r, "Projeto", "projeto"), 200),
      descricao: str(col(r, "Descrição", "descricao"), 500),
      prioridade: str(col(r, "Prioridade", "prioridade"), 50),
      responsavel: str(col(r, "Responsável", "responsavel"), 200),
      ftes: num(col(r, "FTEs", "ftes")),
      valorPrevisto: num(col(r, "Valor Previsto", "valor_previsto")),
      valorGasto: num(col(r, "Valor Gasto", "valor_gasto")),
      dataInicioPlanej: str(col(r, "Data Início Planejado", "data_inicio_planej"), 20),
      dataFimPlanej: str(col(r, "Data Fim Planejado", "data_fim_planej"), 20),
      dataInicio: str(col(r, "Data Início", "data_inicio"), 20),
      dataFimReal: str(col(r, "Data Fim Real", "data_fim_real"), 20),
      totalTarefas: int(col(r, "Total Tarefas", "total_tarefas")),
      tarefasConcluidas: int(col(r, "Tarefas Concluídas", "tarefas_concluidas")),
      tarefasAndamento: int(col(r, "Tarefas em Andamento", "tarefas_andamento")),
      tarefasAtrasadas: int(col(r, "Tarefas Atrasadas", "tarefas_atrasadas")),
      tarefasNaoIniciadas: int(col(r, "Tarefas Não Iniciadas", "tarefas_nao_iniciadas")),
      status: str(col(r, "Status", "status"), 50),
      conclusao: num(col(r, "% Conclusão", "conclusao")),
    }));
    result.counts.projetos = result.projetos.length;
  }

  // Tarefas
  const tarefaSheet = findSheet(workbook, "Tarefa", "Tarefas");
  if (tarefaSheet) {
    const data = sheetToObjects(tarefaSheet);
    result.tarefas = data.map(r => ({
      id: str(col(r, "ID", "id"), 20),
      parentId: str(col(r, "Parent ID", "parentId", "parent_id"), 20),
      projeto: str(col(r, "Projeto", "projeto"), 200),
      tarefa: str(col(r, "Tarefa", "tarefa"), 500),
      subtarefa: str(col(r, "Sub-tarefa", "subtarefa"), 500),
      responsavel: str(col(r, "Responsável", "responsavel"), 500),
      funcao: str(col(r, "Função", "funcao"), 200),
      dataInicioPlanej: str(col(r, "Data Início Planejado", "data_inicio_planej"), 20),
      esforcoPlanej: num(col(r, "Esforço Planejado", "esforco_planej")),
      dataFimPlanej: str(col(r, "Data Fim Planejado", "data_fim_planej"), 20),
      dataInicioReal: str(col(r, "Data Início Real", "data_inicio_real"), 20),
      esforcoReal: num(col(r, "Esforço Real", "esforco_real")),
      dataFimReal: str(col(r, "Data Fim Real", "data_fim_real"), 20),
      percentual: num(col(r, "% Concluído", "percentual")),
      status: str(col(r, "Status", "status"), 50),
      valorPrevisto: num(col(r, "Valor Previsto", "valor_previsto")),
      valorGasto: num(col(r, "Valor Gasto", "valor_gasto")),
      diasPlanejados: int(col(r, "Dias Planejados", "dias_planejados")),
      diasReal: int(col(r, "Dias Real", "dias_real")),
      diasCompletados: int(col(r, "Dias Completados", "dias_completados")),
    }));
    result.counts.tarefas = result.tarefas.length;
  }

  // Recursos
  const recursoSheet = findSheet(workbook, "Recurso", "Recursos");
  if (recursoSheet) {
    const data = sheetToObjects(recursoSheet);
    result.recursos = data.map(r => ({
      nome: str(col(r, "Nome", "nome"), 200),
      funcao: str(col(r, "Função", "funcao"), 200),
    }));
    result.counts.recursos = result.recursos.length;
  }

  if (!result.counts.projetos && !result.counts.tarefas && !result.counts.recursos) {
    const edrawResult = parseEdrawSchedule(workbook, file);
    if (edrawResult) return edrawResult;
  }

  return result;
}
