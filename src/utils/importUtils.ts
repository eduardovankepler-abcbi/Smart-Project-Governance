import ExcelJS from "exceljs";
import type { Projeto, Tarefa, Recurso } from "@/data/projectData";

function str(val: unknown, maxLen = 255): string {
  if (val == null) return "";
  return String(val).slice(0, maxLen).trim();
}

function num(val: unknown, def = 0): number {
  const n = parseFloat(String(val));
  return isNaN(n) ? def : n;
}

function int(val: unknown, def = 0): number {
  const n = parseInt(String(val), 10);
  return isNaN(n) ? def : n;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();
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

  // Find header row (first row with at least 2 non-empty cells)
  let headerRowNum = 0;
  for (let r = 1; r <= Math.min(rowCount, 10); r++) {
    const row = sheet.getRow(r);
    let nonEmpty = 0;
    for (let c = 1; c <= colCount; c++) {
      const val = row.getCell(c).value;
      if (val != null && String(val).trim() !== "") nonEmpty++;
    }
    if (nonEmpty >= 2) {
      headerRowNum = r;
      break;
    }
  }

  if (headerRowNum === 0) {
    console.warn(`[ExcelImport] Nenhuma linha de cabeçalho encontrada na aba "${sheet.name}"`);
    return rows;
  }

  // Read headers
  const headerRow = sheet.getRow(headerRowNum);
  for (let c = 1; c <= colCount; c++) {
    const val = headerRow.getCell(c).value;
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
      const val = cell.value;
      if (val != null && val !== "") {
        // Handle ExcelJS rich text
        if (typeof val === "object" && "richText" in (val as object)) {
          obj[headers[c]] = (val as { richText: { text: string }[] }).richText.map(rt => rt.text).join("");
        } else if (typeof val === "object" && "result" in (val as object)) {
          // Formula cell — use computed result
          obj[headers[c]] = (val as { result: unknown }).result;
        } else {
          obj[headers[c]] = val;
        }
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

export interface ImportResult {
  projetos?: Projeto[];
  tarefas?: Tarefa[];
  recursos?: Recurso[];
  counts: { projetos: number; tarefas: number; recursos: number };
}

export async function parseExcelFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
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

  return result;
}
