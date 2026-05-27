// ============================================
// Parsing & Sanitization Helpers
// ============================================

function sanitizeString(val, maxLen = 255) {
  if (val == null) return "";
  const unwrapped = unwrapCellValue(val);
  if (unwrapped instanceof Date) return formatMmDdYy(unwrapped).slice(0, maxLen);
  return String(unwrapped ?? "").slice(0, maxLen).trim();
}

function sanitizeNumber(val, defaultVal = 0) {
  const unwrapped = unwrapCellValue(val);
  if (unwrapped == null || unwrapped === "") return defaultVal;
  if (typeof unwrapped === "number") return unwrapped;
  // Handle locale: "1.234,56" → 1234.56
  let cleaned = String(unwrapped).trim().replace(/\s/g, "").replace(/[R$€$]/g, "");
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, "");
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? defaultVal : n;
}

function sanitizeInt(val, defaultVal = 0) {
  const n = Math.round(sanitizeNumber(val, defaultVal));
  return isNaN(n) ? defaultVal : n;
}

function formatMmDdYy(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  return `${m}/${d}/${y.toString().slice(-2)}`;
}

function unwrapCellValue(val) {
  if (val == null) return "";
  if (val instanceof Date) return val;
  if (typeof val !== "object") return val;

  if (Array.isArray(val.richText)) {
    return val.richText.map((part) => part && typeof part === "object" ? String(part.text || "") : "").join("");
  }
  if (Object.prototype.hasOwnProperty.call(val, "result")) return unwrapCellValue(val.result);
  if (Object.prototype.hasOwnProperty.call(val, "text")) return unwrapCellValue(val.text);
  return val;
}

function isEmptyCellValue(val) {
  const unwrapped = unwrapCellValue(val);
  return unwrapped == null || String(unwrapped).trim() === "";
}

function cleanTaskName(value) {
  return sanitizeString(value, 500).replace(/^\s*\d+(?:\.\d+)*\s*->\s*/, "").trim();
}

function parentFromWbs(wbs) {
  const parts = String(wbs || "").split(".").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(".") : "";
}

function outlineLevelFromWbs(wbs) {
  return String(wbs || "").split(".").filter(Boolean).length || 1;
}

function parseDurationHours(value) {
  const raw = sanitizeString(value, 50);
  if (!raw) return 0;
  const n = sanitizeNumber(raw);
  if (/day/i.test(raw)) return n * 8;
  if (/min/i.test(raw)) return n / 60;
  return n;
}

function mapScheduleStatus(value, progress = 0) {
  if (progress >= 100) return "Concluído";
  if (progress > 0) return "Em andamento";
  return "Não iniciado";
}

/**
 * Parse Excel date: handles serial numbers, Date objects, and strings.
 */
function parseExcelDate(val) {
  const unwrapped = unwrapCellValue(val);
  if (unwrapped == null || unwrapped === "") return "";
  // Date object from exceljs
  if (unwrapped instanceof Date) {
    return formatMmDdYy(unwrapped);
  }
  // Excel serial number
  if (typeof unwrapped === "number" && unwrapped > 1 && unwrapped < 200000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(epoch.getTime() + unwrapped * 86400000);
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const y = date.getUTCFullYear();
    return `${m}/${d}/${y.toString().slice(-2)}`;
  }
  const raw = sanitizeString(unwrapped, 40);
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${Number(isoMatch[2])}/${Number(isoMatch[3])}/${isoMatch[1].slice(-2)}`;
  }
  return sanitizeString(unwrapped, 20);
}

function normalizeDateInput(val) {
  if (val == null || val === "") return "";
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }

  const raw = sanitizeString(val, 40);
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const slashMatch = raw.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/);
  if (!slashMatch) return "";

  let year;
  let month;
  let day;

  const left = parseInt(slashMatch[1], 10);
  const middle = parseInt(slashMatch[2], 10);
  const right = parseInt(slashMatch[3], 10);

  if (slashMatch[1].length === 4) {
    year = left;
    month = middle;
    day = right;
  } else if (left > 12) {
    day = left;
    month = middle;
    year = right;
  } else if (middle > 12) {
    month = left;
    day = middle;
    year = right;
  } else {
    month = left;
    day = middle;
    year = right;
  }

  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Get column value with fallback keys. Uses `!== undefined` to handle falsy values (0, "").
 */
function col(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  const normalizedKeys = keys.map(normalizeColName);
  for (const [rowKey, val] of Object.entries(row)) {
    const normalizedRowKey = normalizeColName(rowKey);
    for (const target of normalizedKeys) {
      if (normalizedRowKey === target || normalizedRowKey.startsWith(target) || normalizedRowKey.includes(target)) {
        return val;
      }
    }
  }
  return undefined;
}

/**
 * Normalize column name for flexible matching.
 */
function normalizeColName(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s%.-]+/g, " ")
    .trim();
}

/**
 * Convert ExcelJS worksheet to array of objects with flexible header matching.
 */
function sheetToObjects(sheet) {
  const rows = [];
  const headers = [];
  const rowCount = sheet.rowCount;
  const colCount = sheet.columnCount;
  const knownHeaders = [
    "id", "projeto", "tarefa", "nome", "responsavel", "status",
    "data inicio", "data fim", "valor previsto", "valor gasto",
    "funcao", "prioridade", "parent id",
  ];

  let headerRowNum = 0;
  let bestScore = 0;
  for (let r = 1; r <= Math.min(rowCount, 10); r++) {
    const row = sheet.getRow(r);
    let nonEmpty = 0;
    let score = 0;
    for (let c = 1; c <= colCount; c++) {
      const val = unwrapCellValue(row.getCell(c).value);
      if (!isEmptyCellValue(val)) {
        nonEmpty++;
        const normalized = normalizeColName(val);
        if (knownHeaders.some((h) => normalized === h || normalized.includes(h))) score += 2;
      }
    }
    score += Math.min(nonEmpty, 4);
    if (nonEmpty >= 2 && score > bestScore) {
      bestScore = score;
      headerRowNum = r;
    }
  }

  if (!headerRowNum) return rows;

  const headerRow = sheet.getRow(headerRowNum);
  for (let c = 1; c <= colCount; c++) {
    headers[c] = sanitizeString(headerRow.getCell(c).value);
  }

  for (let r = headerRowNum + 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const obj = {};
    let hasData = false;
    for (let c = 1; c <= colCount; c++) {
      if (!headers[c]) continue;
      const val = unwrapCellValue(row.getCell(c).value);
      if (!isEmptyCellValue(val)) {
        obj[headers[c]] = val;
        hasData = true;
      }
    }
    if (hasData) rows.push(obj);
  }
  return rows;
}

function hasColumns(row, ...keys) {
  if (!row) return false;
  return keys.every((key) => col(row, key) !== undefined);
}

function findSheetByColumns(workbook, ...keys) {
  for (const sheet of workbook.worksheets) {
    const rows = sheetToObjects(sheet);
    if (hasColumns(rows[0], ...keys)) return sheet;
  }
  return undefined;
}

module.exports = {
  sanitizeString,
  sanitizeNumber,
  sanitizeInt,
  parseExcelDate,
  normalizeDateInput,
  col,
  normalizeColName,
  sheetToObjects,
  unwrapCellValue,
  findSheetByColumns,
  cleanTaskName,
  parentFromWbs,
  outlineLevelFromWbs,
  parseDurationHours,
  mapScheduleStatus,
};
