// ============================================
// Parsing & Sanitization Helpers
// ============================================

function sanitizeString(val, maxLen = 255) {
  if (val == null) return "";
  return String(val).slice(0, maxLen).trim();
}

function sanitizeNumber(val, defaultVal = 0) {
  if (val == null || val === "") return defaultVal;
  if (typeof val === "number") return val;
  // Handle locale: "1.234,56" → 1234.56
  let cleaned = String(val).trim().replace(/\s/g, "").replace(/[R$€$]/g, "");
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
  if (val == null || val === "") return defaultVal;
  if (typeof val === "number") return Math.round(val);
  const n = parseInt(String(val), 10);
  return isNaN(n) ? defaultVal : n;
}

/**
 * Parse Excel date: handles serial numbers, Date objects, and strings.
 */
function parseExcelDate(val) {
  if (val == null || val === "") return "";
  // Date object from exceljs
  if (val instanceof Date) {
    const m = val.getMonth() + 1;
    const d = val.getDate();
    const y = val.getFullYear();
    return `${m}/${d}/${y.toString().slice(-2)}`;
  }
  // Excel serial number
  if (typeof val === "number" && val > 1 && val < 200000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(epoch.getTime() + val * 86400000);
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const y = date.getUTCFullYear();
    return `${m}/${d}/${y.toString().slice(-2)}`;
  }
  return sanitizeString(val, 20);
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
    .replace(/[_\s]+/g, " ")
    .trim();
}

/**
 * Convert ExcelJS worksheet to array of objects with flexible header matching.
 */
function sheetToObjects(sheet) {
  const rows = [];
  const headers = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = sanitizeString(cell.value);
      });
    } else {
      const obj = {};
      row.eachCell((cell, colNumber) => {
        if (headers[colNumber]) obj[headers[colNumber]] = cell.value;
      });
      if (Object.keys(obj).length > 0) rows.push(obj);
    }
  });
  return rows;
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
};
