const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env"), override: false });

function resolveOptionalEnvPath(candidate) {
  if (!candidate) return "";
  if (path.isAbsolute(candidate)) return candidate;
  return path.resolve(__dirname, candidate);
}

const optionalEnvPath = resolveOptionalEnvPath(process.env.APP_ENV_FILE);
if (optionalEnvPath) {
  require("dotenv").config({ path: optionalEnvPath, override: true });
}

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const ExcelJS = require("exceljs");
const mysql = require("mysql2/promise");
const fs = require("fs");

const { sanitizeString, sanitizeNumber, sanitizeInt, parseExcelDate, normalizeDateInput, col, sheetToObjects } = require("./utils/parsing");
const { syncFullSnapshot, checkSupabaseHealth, isSupabaseSyncEnabled } = require("./utils/supabaseSync");
const { syncProjectMetrics } = require("./utils/projectMetrics");
const { parseMsProjectXml } = require("./utils/msProjectXml");
const { logAudit } = require("./utils/audit");
const { BASELINE_SOURCE_TYPES, createProjectBaseline } = require("./utils/baselines");
const {
  ROLES,
  canWriteData,
  canManageUsers,
  canImportData,
  canSeeAllProjects,
  buildUserResponse,
  hashToken,
} = require("./utils/auth");

const app = express();
const PORT = process.env.PORT || 3001;
app.disable("x-powered-by");
app.set("trust proxy", 1);

const UPLOAD_DIR = path.resolve(__dirname, "uploads");
const OLE_XLS_SIGNATURE = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function createHttpError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function readFilePrefix(filePath, length = 2048) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function bufferStartsWith(buffer, signature) {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function assertAllowedMimeType(file, allowedMimeTypes, label) {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  if (!mimeType || mimeType === "application/octet-stream") return;
  if (allowedMimeTypes.has(mimeType)) return;
  throw createHttpError(`Tipo MIME inválido para ${label}`, "FILE_TYPE_INVALID", 415);
}

function assertExcelFileIntegrity(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimeTypes = new Set([
    "application/vnd.ms-excel",
    "application/vnd.ms-excel.sheet.macroenabled.12",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ]);
  assertAllowedMimeType(file, allowedMimeTypes, "planilha");

  const prefix = readFilePrefix(file.path, 16);
  if ([".xlsx", ".xlsm"].includes(ext) && !bufferStartsWith(prefix, ZIP_SIGNATURE)) {
    throw createHttpError("Conteúdo do arquivo não corresponde a uma planilha Excel válida", "FILE_CONTENT_INVALID", 415);
  }
  if (ext === ".xls" && !bufferStartsWith(prefix, OLE_XLS_SIGNATURE)) {
    throw createHttpError("Conteúdo do arquivo não corresponde a um arquivo .xls válido", "FILE_CONTENT_INVALID", 415);
  }
}

function assertXmlFileIntegrity(file) {
  const allowedMimeTypes = new Set([
    "application/xml",
    "text/xml",
    "application/msproject",
  ]);
  assertAllowedMimeType(file, allowedMimeTypes, "XML");

  const prefix = readFilePrefix(file.path, 2048).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (!prefix.startsWith("<?xml") && !prefix.startsWith("<Project")) {
    throw createHttpError("Conteúdo do arquivo não corresponde a um XML válido", "FILE_CONTENT_INVALID", 415);
  }
  if (/<!DOCTYPE/i.test(prefix)) {
    throw createHttpError("Arquivos XML com DOCTYPE não são permitidos", "FILE_XML_UNSAFE", 415);
  }
}

function getUploadedFileMetadata(file) {
  if (!file) return null;
  return {
    originalName: sanitizeString(file.originalname, 255),
    mimeType: sanitizeString(file.mimetype, 120),
    size: Number(file.size || 0),
  };
}

async function logImportEvent(actor, payload) {
  await logAudit(pool, {
    actor,
    ...payload,
  });
}

ensureDirectory(UPLOAD_DIR);

function buildProjectCode(projectId, projeto) {
  const explicit = sanitizeString(projectId, 50).toUpperCase();
  if (explicit) return explicit;
  const normalized = sanitizeString(projeto, 50)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `PRJ-${normalized || Date.now()}`;
}

// ============================================
// CORS
// ============================================
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:8080,http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.some((allowed) => {
    if (allowed === "*") return true;
    if (allowed === origin) return true;
    if (allowed.includes("*")) {
      const escaped = allowed
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`, "i").test(origin);
    }
    return false;
  });
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
    console.warn(`CORS blocked for origin: ${origin}`);
    callback(new Error("CORS not allowed"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  next();
});

app.use(express.json({ limit: "1mb" }));

// ============================================
// MySQL Pool
// ============================================
function requireEnv(name) {
  const val = process.env[name];
  if (!val) { console.error(`❌ Missing required env var: ${name}`); process.exit(1); }
  return val;
}

const pool = mysql.createPool({
  host: requireEnv("DB_HOST"),
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
});

// ============================================
// Rate limiter
// ============================================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 30;

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return next();
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return res.status(429).json({ error: "Too many requests" });
  next();
}
app.use(rateLimit);

// ============================================
// Auth
// ============================================
const API_KEY = process.env.API_KEY;

app.use(async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return next();
    if (API_KEY && token === API_KEY) {
      req.authUser = {
        id: 0,
        nome: "Service API Key",
        email: "service@local",
        role: ROLES.ADMIN,
        roleLabel: "Administrador",
        active: true,
        assignedProjectIds: [],
      };
      return next();
    }

    const [rows] = await pool.query(
      `SELECT s.id as session_id, u.*, r.nome as resource_nome
       FROM user_sessions s
       INNER JOIN users u ON u.id = s.user_id
       LEFT JOIN recursos r ON r.id = u.resource_id
       WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.active = 1
       LIMIT 1`,
      [hashToken(token)]
    );
    if (!rows.length) return next();

    const [allocations] = await pool.query(
      "SELECT project_id FROM user_project_access WHERE user_id = ? ORDER BY project_id",
      [rows[0].id]
    );
    req.sessionId = rows[0].session_id;
    req.authUser = buildUserResponse(rows[0], allocations.map((item) => item.project_id));
    return next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    next();
  }
});

function requireAuth(req, res, next) {
  if (req.authUser) return next();
  const provided = req.headers.authorization?.replace("Bearer ", "");
  if (!provided) return res.status(401).json({ error: "Unauthorized", code: "AUTH_REQUIRED" });
  return res.status(401).json({ error: "Sessão inválida ou expirada", code: "AUTH_INVALID" });
}

function requireWriteAccess(req, res, next) {
  if (canWriteData(req.authUser?.role)) return next();
  return res.status(403).json({ error: "Sem permissão de escrita", code: "AUTH_WRITE_DENIED" });
}

function requireManageUsers(req, res, next) {
  if (canManageUsers(req.authUser?.role)) return next();
  return res.status(403).json({ error: "Sem permissão para governança de usuários", code: "AUTH_GOVERNANCE_DENIED" });
}

function requireImportAccess(req, res, next) {
  if (canImportData(req.authUser?.role)) return next();
  return res.status(403).json({ error: "Sem permissão para importar cronogramas", code: "AUTH_IMPORT_DENIED" });
}

async function getAccessibleProjectIdsFilter(user) {
  if (!user || canSeeAllProjects(user.role)) return { all: true, projectIds: [] };
  if (user.role === ROLES.PMO) {
    return { all: false, projectIds: user.assignedProjectIds || [] };
  }
  if (user.role === ROLES.VIEWER) {
    if (!user.linkedResourceId) return { all: false, projectIds: [] };
    const [rows] = await pool.query(
      `SELECT DISTINCT p.id
       FROM projetos p
       INNER JOIN tarefas t ON t.projeto = p.projeto
       INNER JOIN task_assignments ta ON ta.task_id = t.id
       WHERE ta.resource_id = ?
       ORDER BY p.id`,
      [user.linkedResourceId]
    );
    return { all: false, projectIds: rows.map((item) => item.id) };
  }
  return { all: false, projectIds: [] };
}

async function getAccessibleProjectNamesFilter(user) {
  const access = await getAccessibleProjectIdsFilter(user);
  if (access.all) return { all: true, projectNames: [] };
  if (!access.projectIds.length) return { all: false, projectNames: [] };
  const [rows] = await pool.query("SELECT projeto FROM projetos WHERE id IN (?) ORDER BY projeto", [access.projectIds]);
  return { all: false, projectNames: rows.map((item) => item.projeto) };
}

const auth = {
  requireAuth,
  requireWriteAccess,
  requireManageUsers,
  requireImportAccess,
  getAccessibleProjectIdsFilter,
  getAccessibleProjectNamesFilter,
};

// ============================================
// CRUD Routes (modular)
// ============================================
const taskHooks = {
  afterTaskChange: async (projectName) => {
    if (!projectName) return;
    const projectId = await syncProjectMetrics(pool, projectName);
    if (!isSupabaseSyncEnabled() || !projectId) return;
    const [rows] = await pool.query("SELECT * FROM projetos WHERE id = ?", [projectId]);
    if (rows.length) {
      const { syncProjeto } = require("./utils/supabaseSync");
      await syncProjeto(rows[0]);
    }
  },
};
app.use("/api/auth", require("./routes/auth")(pool, auth));
app.use("/api/users", require("./routes/users")(pool, auth));
app.use("/api/projetos", require("./routes/projetos")(pool, auth));
app.use("/api/business-units", require("./routes/businessUnits")(pool, auth));
app.use("/api/produtos", require("./routes/produtos")(pool, auth));
app.use("/api/tarefas", require("./routes/tarefas")(pool, auth, taskHooks));
app.use("/api/alocacoes", require("./routes/alocacoes")(pool, auth));
app.use("/api/recursos", require("./routes/recursos")(pool, auth));
app.use("/api/comentarios", require("./routes/comentarios")(pool, auth));
app.use("/api/auditoria", require("./routes/auditoria")(pool, auth));
app.use("/api/baselines", require("./routes/baselines")(pool, auth));
app.use("/api/project-templates", require("./routes/projectTemplates")(pool, auth, taskHooks));

// ============================================
// Excel Import
// ============================================
const MAX_FILE_SIZE_MB = Math.max(1, parseInt(process.env.IMPORT_MAX_FILE_SIZE_MB || "25", 10) || 25);
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_ROWS = 5000;

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".xlsx", ".xls", ".xlsm"].includes(ext)) {
      return cb(new Error("Apenas arquivos .xlsx, .xls ou .xlsm são permitidos"));
    }
    cb(null, true);
  },
});

const uploadMsProject = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".xml"].includes(ext)) {
      return cb(new Error("Apenas arquivos .xml do MS Project são permitidos"));
    }
    cb(null, true);
  },
});

app.post("/api/import-excel", requireAuth, requireImportAccess, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado", code: "NO_FILE" });

  const filePath = req.file.path;
  const fileMetadata = getUploadedFileMetadata(req.file);
  let imported = { projetos: 0, tarefas: 0, recursos: 0 };

  try {
    assertExcelFileIntegrity(req.file);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const projetoSheet = workbook.getWorksheet("Projeto") || workbook.getWorksheet("Projetos");
      if (projetoSheet) {
        const data = sheetToObjects(projetoSheet);
        if (data.length > MAX_ROWS) throw new Error(`Limite de ${MAX_ROWS} linhas excedido na aba Projeto`);
        await conn.query("DELETE FROM projetos");
        for (const r of data) {
          const dataInicioPlanej = parseExcelDate(col(r, "Data Início Planejado", "data_inicio_planej"));
          const dataFimPlanej = parseExcelDate(col(r, "Data Fim Planejado", "data_fim_planej"));
          const dataInicioReal = parseExcelDate(col(r, "Data Início", "data_inicio"));
          const dataFimReal = sanitizeString(col(r, "Data Fim Real", "data_fim_real"), 50);
          await conn.query(
            `INSERT INTO projetos (id, project_code, business_unit_id, business_unit_nome, projeto, descricao, prioridade, responsavel, ftes, valor_previsto, valor_gasto, data_inicio_planej, data_inicio_planej_date, data_fim_planej, data_fim_planej_date, data_inicio, data_inicio_real_date, data_fim_real, data_fim_real_date, total_tarefas, tarefas_concluidas, tarefas_andamento, tarefas_atrasadas, tarefas_nao_iniciadas, status, conclusao)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              sanitizeInt(col(r, "ID", "id")),
              buildProjectCode(col(r, "Project ID", "projectId", "project_code"), col(r, "Projeto", "projeto")),
              1,
              "Corporativo",
              sanitizeString(col(r, "Projeto", "projeto"), 200),
              sanitizeString(col(r, "Descrição", "descricao", "Descricao"), 500),
              sanitizeString(col(r, "Prioridade", "prioridade"), 50),
              sanitizeString(col(r, "Responsável", "responsavel", "Responsavel"), 200),
              sanitizeNumber(col(r, "FTEs", "ftes")),
              sanitizeNumber(col(r, "Valor Previsto", "valor_previsto")),
              sanitizeNumber(col(r, "Valor Gasto", "valor_gasto")),
              dataInicioPlanej,
              normalizeDateInput(dataInicioPlanej) || null,
              dataFimPlanej,
              normalizeDateInput(dataFimPlanej) || null,
              dataInicioReal,
              normalizeDateInput(dataInicioReal) || null,
              dataFimReal,
              normalizeDateInput(dataFimReal) || null,
              sanitizeInt(col(r, "Total Tarefas", "total_tarefas")),
              sanitizeInt(col(r, "Tarefas Concluídas", "tarefas_concluidas")),
              sanitizeInt(col(r, "Tarefas em Andamento", "tarefas_andamento")),
              sanitizeInt(col(r, "Tarefas Atrasadas", "tarefas_atrasadas")),
              sanitizeInt(col(r, "Tarefas Não Iniciadas", "tarefas_nao_iniciadas", "Tarefas Nao Iniciadas")),
              sanitizeString(col(r, "Status", "status"), 50),
              sanitizeNumber(col(r, "% Conclusão", "conclusao", "% Conclusao")),
            ]
          );
          imported.projetos++;
        }
      }

      const tarefaSheet = workbook.getWorksheet("Tarefa") || workbook.getWorksheet("Tarefas");
      if (tarefaSheet) {
        const data = sheetToObjects(tarefaSheet);
        if (data.length > MAX_ROWS) throw new Error(`Limite de ${MAX_ROWS} linhas excedido na aba Tarefa`);
        await conn.query("DELETE FROM task_assignments");
        await conn.query("DELETE FROM task_dependencies");
        await conn.query("DELETE FROM tarefas");
        for (const r of data) {
          const dataInicioPlanej = parseExcelDate(col(r, "Data Início Planejado", "data_inicio_planej"));
          const dataFimPlanej = parseExcelDate(col(r, "Data Fim Planejado", "data_fim_planej"));
          const dataInicioReal = parseExcelDate(col(r, "Data Início Real", "data_inicio_real"));
          const dataFimReal = parseExcelDate(col(r, "Data Fim Real", "data_fim_real"));
          const constraintDate = parseExcelDate(col(r, "Data da Restrição", "Data Restrição", "constraint_date"));
          await conn.query(
            `INSERT INTO tarefas (id, projeto, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, data_inicio_planej_date, esforco_planej, data_fim_planej, data_fim_planej_date, data_inicio_real, data_inicio_real_date, esforco_real, data_fim_real, data_fim_real_date, percentual, status, constraint_date, constraint_date_date, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              sanitizeString(col(r, "ID", "id"), 20),
              sanitizeString(col(r, "Projeto", "projeto"), 200),
              sanitizeString(col(r, "Tarefa", "tarefa"), 500),
              sanitizeString(col(r, "Sub-tarefa", "subtarefa", "Subtarefa"), 500),
              sanitizeString(col(r, "Responsável", "responsavel", "Responsavel"), 500),
              sanitizeString(col(r, "Função", "funcao", "Funcao"), 200),
              dataInicioPlanej,
              normalizeDateInput(dataInicioPlanej) || null,
              sanitizeNumber(col(r, "Esforço Planejado", "esforco_planej", "Esforco Planejado")),
              dataFimPlanej,
              normalizeDateInput(dataFimPlanej) || null,
              dataInicioReal,
              normalizeDateInput(dataInicioReal) || null,
              sanitizeNumber(col(r, "Esforço Real", "esforco_real", "Esforco Real")),
              dataFimReal,
              normalizeDateInput(dataFimReal) || null,
              sanitizeNumber(col(r, "% Concluído", "percentual", "% Concluido")),
              sanitizeString(col(r, "Status", "status"), 50),
              constraintDate,
              normalizeDateInput(constraintDate) || null,
              sanitizeNumber(col(r, "Valor Previsto", "valor_previsto")),
              sanitizeNumber(col(r, "Valor Gasto", "valor_gasto")),
              sanitizeInt(col(r, "Dias Planejados", "dias_planejados")),
              sanitizeInt(col(r, "Dias Real", "dias_real")),
              sanitizeInt(col(r, "Dias Completados", "dias_completados")),
            ]
          );
          imported.tarefas++;
        }
      }

      const recursoSheet = workbook.getWorksheet("Recurso") || workbook.getWorksheet("Recursos");
      if (recursoSheet) {
        const data = sheetToObjects(recursoSheet);
        if (data.length > MAX_ROWS) throw new Error(`Limite de ${MAX_ROWS} linhas excedido na aba Recurso`);
        await conn.query("DELETE FROM recursos");
        for (const r of data) {
          await conn.query(
            `INSERT INTO recursos (nome, funcao) VALUES (?, ?)`,
            [
              sanitizeString(col(r, "Nome", "nome"), 200),
              sanitizeString(col(r, "Função", "funcao", "Funcao"), 200),
            ]
          );
          imported.recursos++;
        }
      }

      await conn.commit();
      const projetosSet = new Set();
      if (projetoSheet) {
        const data = sheetToObjects(projetoSheet);
        data.forEach((row) => {
          const projeto = sanitizeString(col(row, "Projeto", "projeto"), 200);
          if (projeto) projetosSet.add(projeto);
        });
      }
      for (const projeto of projetosSet) {
        await syncProjectMetrics(pool, projeto);
      }
      if (isSupabaseSyncEnabled()) {
        await syncFullSnapshot(pool);
      }
      await logImportEvent(req.authUser, {
        action: "import",
        entityType: "excel_import",
        entityId: req.file.originalname,
        summary: `Importação Excel executada (${imported.projetos} projetos, ${imported.tarefas} tarefas, ${imported.recursos} recursos)`,
        after: { imported, file: fileMetadata },
      });
      res.json({ success: true, imported });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("Import error:", err);
    await logImportEvent(req.authUser, {
      action: "import_failed",
      entityType: "excel_import",
      entityId: req.file.originalname,
      summary: `Falha na importação Excel: ${sanitizeString(err.message, 300)}`,
      after: { imported, file: fileMetadata, errorCode: err.code || "IMPORT_ERROR" },
    });
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Erro ao importar planilha",
      code: err.code || "IMPORT_ERROR",
    });
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
});

app.post("/api/import-ms-project", requireAuth, requireImportAccess, uploadMsProject.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo XML enviado", code: "NO_FILE" });

  const filePath = req.file.path;
  const fileMetadata = getUploadedFileMetadata(req.file);
  try {
    assertXmlFileIntegrity(req.file);
    const xmlContent = fs.readFileSync(filePath, "utf8");
    if (/<!DOCTYPE/i.test(xmlContent)) {
      throw createHttpError("Arquivos XML com DOCTYPE não são permitidos", "FILE_XML_UNSAFE", 415);
    }
    const parsed = parseMsProjectXml(xmlContent);
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      let projectId = null;
      const [projectRows] = await conn.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [parsed.projectName]);
      if (projectRows.length) {
        projectId = projectRows[0].id;
        await conn.query(
          `UPDATE projetos SET project_code=?, business_unit_id=COALESCE(business_unit_id, 1), business_unit_nome=COALESCE(NULLIF(business_unit_nome, ''), 'Corporativo'), descricao=?, prioridade=?, responsavel=?, ftes=?, valor_previsto=?, valor_gasto=?, data_inicio_planej=?, data_inicio_planej_date=?, data_fim_planej=?, data_fim_planej_date=?, status=?, conclusao=?
           WHERE id = ?`,
          [
            buildProjectCode(parsed.project.projectId, parsed.project.projeto),
            parsed.project.descricao,
            parsed.project.prioridade,
            parsed.project.responsavel,
            parsed.project.ftes,
            parsed.project.valorPrevisto,
            parsed.project.valorGasto,
            parsed.project.dataInicioPlanej,
            normalizeDateInput(parsed.project.dataInicioPlanej) || null,
            parsed.project.dataFimPlanej,
            normalizeDateInput(parsed.project.dataFimPlanej) || null,
            parsed.project.status,
            parsed.project.conclusao,
            projectId,
          ]
        );
      } else {
        const [insert] = await conn.query(
          `INSERT INTO projetos
            (project_code, business_unit_id, business_unit_nome, projeto, descricao, prioridade, responsavel, ftes, valor_previsto, valor_gasto, data_inicio_planej, data_inicio_planej_date, data_fim_planej, data_fim_planej_date, data_inicio, data_inicio_real_date, data_fim_real, data_fim_real_date,
             total_tarefas, tarefas_concluidas, tarefas_andamento, tarefas_atrasadas, tarefas_nao_iniciadas, status, conclusao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, '', NULL, 0, 0, 0, 0, 0, ?, ?)`,
          [
            buildProjectCode(parsed.project.projectId, parsed.project.projeto),
            1,
            "Corporativo",
            parsed.project.projeto,
            parsed.project.descricao,
            parsed.project.prioridade,
            parsed.project.responsavel,
            parsed.project.ftes,
            parsed.project.valorPrevisto,
            parsed.project.valorGasto,
            parsed.project.dataInicioPlanej,
            normalizeDateInput(parsed.project.dataInicioPlanej) || null,
            parsed.project.dataFimPlanej,
            normalizeDateInput(parsed.project.dataFimPlanej) || null,
            parsed.project.status,
            parsed.project.conclusao,
          ]
        );
        projectId = insert.insertId;
      }

      await conn.query(
        "DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tarefas WHERE projeto = ?)",
        [parsed.projectName]
      );
      await conn.query(
        "DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tarefas WHERE projeto = ?) OR predecessor_task_id IN (SELECT id FROM tarefas WHERE projeto = ?)",
        [parsed.projectName, parsed.projectName]
      );
      await conn.query("DELETE FROM tarefas WHERE projeto = ?", [parsed.projectName]);

      const resourceIdByName = new Map();
      for (const resource of parsed.resources) {
        const [existingResources] = await conn.query("SELECT id FROM recursos WHERE nome = ? LIMIT 1", [resource.nome]);
        if (existingResources.length) {
          resourceIdByName.set(resource.nome, existingResources[0].id);
          await conn.query(
            `UPDATE recursos SET external_id=?, funcao=?, resource_type=?, initials=?, max_units=?, standard_rate=?, overtime_rate=?, email=? WHERE id=?`,
            [
              resource.externalId,
              resource.funcao,
              resource.resourceType,
              resource.initials,
              resource.maxUnits,
              resource.standardRate,
              resource.overtimeRate,
              resource.email,
              existingResources[0].id,
            ]
          );
        } else {
          const [insertResource] = await conn.query(
            `INSERT INTO recursos (external_id, nome, funcao, resource_type, initials, max_units, standard_rate, overtime_rate, email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              resource.externalId,
              resource.nome,
              resource.funcao,
              resource.resourceType,
              resource.initials,
              resource.maxUnits,
              resource.standardRate,
              resource.overtimeRate,
              resource.email,
            ]
          );
          resourceIdByName.set(resource.nome, insertResource.insertId);
        }
      }

      for (const task of parsed.tasks) {
        await conn.query(
          `INSERT INTO tarefas
            (id, parent_id, external_id, wbs, outline_level, sort_order, projeto, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, data_inicio_planej_date, esforco_planej,
             data_fim_planej, data_fim_planej_date, data_inicio_real, data_inicio_real_date, esforco_real, data_fim_real, data_fim_real_date, percentual, status, task_type, is_milestone, duration_minutes, is_manual,
             constraint_type, constraint_date, constraint_date_date, notes, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.parentId || null,
            task.externalId,
            task.wbs,
            task.outlineLevel,
            task.sortOrder,
            task.projeto,
            task.tarefa,
            task.subtarefa,
            task.responsavel,
            task.funcao,
            task.dataInicioPlanej,
            normalizeDateInput(task.dataInicioPlanej) || null,
            task.esforcoPlanej,
            task.dataFimPlanej,
            normalizeDateInput(task.dataFimPlanej) || null,
            task.dataInicioReal,
            normalizeDateInput(task.dataInicioReal) || null,
            task.esforcoReal,
            task.dataFimReal,
            normalizeDateInput(task.dataFimReal) || null,
            task.percentual,
            task.status,
            task.taskType,
            task.milestone ? 1 : 0,
            task.durationMinutes,
            task.isManual ? 1 : 0,
            task.constraintType,
            task.constraintDate,
            normalizeDateInput(task.constraintDate) || null,
            task.notes,
            task.valorPrevisto,
            task.valorGasto,
            task.diasPlanejados,
            task.diasReal,
            task.diasCompletados,
          ]
        );

        for (const assignment of task.assignments || []) {
          await conn.query(
            `INSERT INTO task_assignments (task_id, resource_id, resource_name, units, work, actual_work, remaining_work, cost)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              task.id,
              resourceIdByName.get(assignment.resourceName) || null,
              assignment.resourceName,
              assignment.units,
              assignment.work,
              assignment.actualWork,
              assignment.remainingWork,
              assignment.cost,
            ]
          );
        }

        for (const dependency of task.predecessors || []) {
          await conn.query(
            "INSERT INTO task_dependencies (task_id, predecessor_task_id, dependency_type, lag_minutes) VALUES (?, ?, ?, ?)",
            [task.id, dependency.predecessorTaskId, dependency.type, dependency.lagMinutes]
          );
        }
      }

      await conn.commit();
      await syncProjectMetrics(pool, parsed.projectName);
      try {
        if (projectId) {
          await createProjectBaseline(pool, {
            projectId,
            sourceType: BASELINE_SOURCE_TYPES.XML_IMPORT,
            actor: req.authUser,
          });
        }
      } catch (baselineError) {
        console.error("Baseline bootstrap after XML import failed:", baselineError);
      }
      if (isSupabaseSyncEnabled()) await syncFullSnapshot(pool);
      const [auditProjectRows] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [parsed.projectName]);
      await logImportEvent(req.authUser, {
        action: "import",
        entityType: "ms_project_import",
        entityId: parsed.projectName,
        projectId: auditProjectRows[0]?.id || null,
        summary: `Importação MS Project XML executada para ${parsed.projectName}`,
        after: {
          tarefas: parsed.tasks.length,
          recursos: parsed.resources.length,
          file: fileMetadata,
        },
      });
      res.json({
        success: true,
        imported: {
          project: parsed.projectName,
          projetos: 1,
          tarefas: parsed.tasks.length,
          recursos: parsed.resources.length,
        },
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("MS Project import error:", err);
    await logImportEvent(req.authUser, {
      action: "import_failed",
      entityType: "ms_project_import",
      entityId: req.file.originalname,
      summary: `Falha na importação MS Project XML: ${sanitizeString(err.message, 300)}`,
      after: { file: fileMetadata, errorCode: err.code || "IMPORT_MS_PROJECT" },
    });
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Erro ao importar XML do MS Project",
      code: err.code || "IMPORT_MS_PROJECT",
    });
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
});

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const supabase = await checkSupabaseHealth();
    res.json({ status: "ok", database: "connected", supabase });
  } catch {
    const supabase = await checkSupabaseHealth();
    res.json({ status: "ok", database: "disconnected", supabase });
  }
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  if (err.message === "CORS not allowed") return res.status(403).json({ error: "Origin not allowed", code: "CORS_BLOCKED" });
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `Arquivo excede o limite de ${MAX_FILE_SIZE_MB} MB`,
      code: "FILE_TOO_LARGE",
    });
  }
  if (err.status && err.code) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  res.status(500).json({ error: "Internal server error", code: "INTERNAL" });
});

app.listen(PORT, () => {
  console.log(`🚀 ABC Project Manager API running on port ${PORT}`);
});
