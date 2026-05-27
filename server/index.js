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

const {
  sanitizeString,
  sanitizeNumber,
  sanitizeInt,
  parseExcelDate,
  normalizeDateInput,
  col,
  sheetToObjects,
  findSheetByColumns,
  cleanTaskName,
  parentFromWbs,
  outlineLevelFromWbs,
  parseDurationHours,
} = require("./utils/parsing");
const { syncFullSnapshot, checkSupabaseHealth, isSupabaseSyncEnabled } = require("./utils/supabaseSync");
const { syncProjectMetrics } = require("./utils/projectMetrics");
const { parseMsProjectXml, remapTasksForProjectImport } = require("./utils/msProjectXml");
const { logAudit } = require("./utils/audit");
const { BASELINE_SOURCE_TYPES, createProjectBaseline } = require("./utils/baselines");
const { withMysqlSsl } = require("./utils/mysqlConnection");
const { buildExcelImportPreview } = require("./utils/excelImportPreview");
const { buildMsProjectImportPreview } = require("./utils/msProjectImportPreview");
const { requireReplanJustification } = require("./utils/replanImpact");
const { deriveTaskStatus } = require("./utils/statusRules");
const { normalizeMaxUnits } = require("./utils/resourceCapacity");
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
const IMPORT_CONFIRM_PHRASES = {
  excel: "SUBSTITUIR TUDO",
  msProject: "SUBSTITUIR CRONOGRAMA",
};
const FULL_IMPORT_BACKUP_CONFIRMATION = "CONFIRMO BACKUP";

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

function requireImportConfirmation(req, options) {
  const mode = sanitizeString(req.body?.importMode, 50).toLowerCase();
  const confirmationText = sanitizeString(req.body?.confirmationText, 80).toUpperCase();
  if (mode !== options.mode || confirmationText !== options.phrase) {
    throw createHttpError(options.errorMessage, "IMPORT_CONFIRMATION_REQUIRED", 400);
  }
  if (options.requireBackupConfirmation) {
    const destructiveConfirmation = sanitizeString(req.body?.destructiveConfirmation, 80).toUpperCase();
    const backupAcknowledged = String(req.body?.backupAcknowledged || "").toLowerCase() === "true";
    if (!backupAcknowledged || destructiveConfirmation !== FULL_IMPORT_BACKUP_CONFIRMATION) {
      throw createHttpError(
        `Importação completa bloqueada. Confirme que há backup recente digitando "${FULL_IMPORT_BACKUP_CONFIRMATION}" e marcando a confirmação de backup.`,
        "IMPORT_BACKUP_CONFIRMATION_REQUIRED",
        400
      );
    }
  }
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

function parsePredecessors(value, externalIdToTaskId = new Map()) {
  return sanitizeString(value, 300)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.+?)(FS|SS|FF|SF)?$/i);
      const rawId = sanitizeString(match?.[1] || item, 50);
      return {
        predecessorTaskId: externalIdToTaskId.get(rawId) || rawId,
        type: sanitizeString(match?.[2] || "FS", 2).toUpperCase() || "FS",
        lagMinutes: 0,
      };
    })
    .filter((item) => item.predecessorTaskId);
}

function buildImportedTaskId(projectId, sequence) {
  return `p${projectId}-${sequence}`.slice(0, 20);
}

async function upsertScheduleProject(conn, { projectName, fileName, rootRow, edrawScheduleRows, recursos }) {
  const percentual = sanitizeNumber(col(rootRow, "Progress", "% Concluído", "% Concluido"));
  const dataInicioPlanej = parseExcelDate(col(rootRow, "Start", "Data Início Planejado"));
  const dataFimPlanej = parseExcelDate(col(rootRow, "Finish", "Data Fim Planejado"));
  const status = deriveTaskStatus({
    status: col(rootRow, "Status"),
    percentual,
    dataInicioPlanej,
    dataFimPlanej,
  });
  const scheduleStatuses = edrawScheduleRows.map((row) => deriveTaskStatus({
    status: col(row, "Status"),
    percentual: sanitizeNumber(col(row, "Progress")),
    dataInicioPlanej: parseExcelDate(col(row, "Start", "Data Início Planejado")),
    dataFimPlanej: parseExcelDate(col(row, "Finish", "Data Fim Planejado")),
    dataInicioReal: parseExcelDate(col(row, "ActualStart", "Actual Start", "Data Início Real")),
    dataFimReal: parseExcelDate(col(row, "ActualFinish", "Actual Finish", "Data Fim Real")),
  }));
  const stats = {
    concluidas: scheduleStatuses.filter((item) => item === "Concluído").length,
    andamento: scheduleStatuses.filter((item) => item === "Em andamento").length,
    atrasadas: scheduleStatuses.filter((item) => item === "Atrasado").length,
    naoIniciadas: scheduleStatuses.filter((item) => item === "Não iniciado").length,
  };

  const [existingProjects] = await conn.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [projectName]);
  if (existingProjects.length) {
    const projectId = existingProjects[0].id;
    await conn.query(
      `UPDATE projetos
       SET project_code=?, business_unit_id=COALESCE(business_unit_id, 1), business_unit_nome=COALESCE(NULLIF(business_unit_nome, ''), 'Corporativo'),
           descricao=?, prioridade=COALESCE(NULLIF(prioridade, ''), '2- Média'), responsavel=?, ftes=?,
           data_inicio_planej=?, data_inicio_planej_date=?, data_fim_planej=?, data_fim_planej_date=?,
           data_inicio=?, data_inicio_real_date=?, data_fim_real='', data_fim_real_date=NULL,
           total_tarefas=?, tarefas_concluidas=?, tarefas_andamento=?, tarefas_atrasadas=?, tarefas_nao_iniciadas=?, status=?, conclusao=?
       WHERE id=?`,
      [
        buildProjectCode("", projectName),
        `Importado de ${fileName}`,
        sanitizeString(col(rootRow, "Resources", "Recursos"), 200),
        recursos.size,
        dataInicioPlanej,
        normalizeDateInput(dataInicioPlanej) || null,
        dataFimPlanej,
        normalizeDateInput(dataFimPlanej) || null,
        dataInicioPlanej,
        normalizeDateInput(dataInicioPlanej) || null,
        edrawScheduleRows.length,
        stats.concluidas,
        stats.andamento,
        stats.atrasadas,
        stats.naoIniciadas,
        status,
        percentual,
        projectId,
      ]
    );
    return projectId;
  }

  const [insertProject] = await conn.query(
    `INSERT INTO projetos (project_code, business_unit_id, business_unit_nome, projeto, descricao, prioridade, responsavel, ftes, valor_previsto, valor_gasto, data_inicio_planej, data_inicio_planej_date, data_fim_planej, data_fim_planej_date, data_inicio, data_inicio_real_date, data_fim_real, data_fim_real_date, total_tarefas, tarefas_concluidas, tarefas_andamento, tarefas_atrasadas, tarefas_nao_iniciadas, status, conclusao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      buildProjectCode("", projectName),
      1,
      "Corporativo",
      projectName,
      `Importado de ${fileName}`,
      "2- Média",
      sanitizeString(col(rootRow, "Resources", "Recursos"), 200),
      recursos.size,
      0,
      0,
      dataInicioPlanej,
      normalizeDateInput(dataInicioPlanej) || null,
      dataFimPlanej,
      normalizeDateInput(dataFimPlanej) || null,
      dataInicioPlanej,
      normalizeDateInput(dataInicioPlanej) || null,
      "",
      null,
      edrawScheduleRows.length,
      stats.concluidas,
      stats.andamento,
      stats.atrasadas,
      stats.naoIniciadas,
      status,
      percentual,
    ]
  );
  return insertProject.insertId;
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

const pool = mysql.createPool(withMysqlSsl({
  host: requireEnv("DB_HOST"),
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
}));

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
const ENABLE_GLOBAL_API_KEY = process.env.ENABLE_GLOBAL_API_KEY === "true";

if (API_KEY && !ENABLE_GLOBAL_API_KEY) {
  console.warn("Global API_KEY authentication is configured but disabled. Set ENABLE_GLOBAL_API_KEY=true only if strictly necessary.");
}

app.use(async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return next();
    if (ENABLE_GLOBAL_API_KEY && API_KEY && token === API_KEY) {
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

function requireReplaceAllImportAccess(req, res, next) {
  if (req.authUser?.role === ROLES.ADMIN) return next();
  return res.status(403).json({
    error: "A importação Excel com substituição total é restrita a administradores",
    code: "AUTH_IMPORT_REPLACE_DENIED",
  });
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
       INNER JOIN tarefas t ON t.projeto_id = p.id OR (t.projeto_id IS NULL AND t.projeto = p.projeto)
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
  requireReplaceAllImportAccess,
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

app.post("/api/import-excel/preview", requireAuth, requireImportAccess, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado", code: "NO_FILE" });

  const filePath = req.file.path;

  try {
    assertExcelFileIntegrity(req.file);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const conn = await pool.getConnection();
    try {
      const preview = await buildExcelImportPreview({
        workbook,
        file: req.file,
        conn,
        authUser: req.authUser,
        roles: ROLES,
        maxRows: MAX_ROWS,
        importConfirmPhrases: IMPORT_CONFIRM_PHRASES,
        fullImportBackupConfirmation: FULL_IMPORT_BACKUP_CONFIRMATION,
      });
      return res.json(preview);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("Import preview error:", err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Erro ao gerar prévia da importação",
      code: err.code || "IMPORT_PREVIEW_ERROR",
    });
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
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
    const edrawScheduleSheet = findSheetByColumns(workbook, "ID", "WBS", "Task", "Start", "Finish");
    const projetoSheet = workbook.getWorksheet("Projeto") || workbook.getWorksheet("Projetos");
    const edrawScheduleRows = edrawScheduleSheet ? sheetToObjects(edrawScheduleSheet) : [];
    const isScheduleImport = !projetoSheet && edrawScheduleRows.length > 0;
    let replanProtection = { hasOfficialBaseline: false, justification: "" };

    if (!isScheduleImport && req.authUser?.role !== ROLES.ADMIN) {
      return res.status(403).json({
        error: "A importação Excel com substituição total é restrita a administradores",
        code: "AUTH_IMPORT_REPLACE_DENIED",
      });
    }

    requireImportConfirmation(req, isScheduleImport
      ? {
          mode: "replace_project",
          phrase: IMPORT_CONFIRM_PHRASES.msProject,
          errorMessage: `Confirme a operação digitando "${IMPORT_CONFIRM_PHRASES.msProject}" para substituir o cronograma existente do projeto importado.`,
        }
      : {
          mode: "replace_all",
          phrase: IMPORT_CONFIRM_PHRASES.excel,
          errorMessage: `Confirme a operação digitando "${IMPORT_CONFIRM_PHRASES.excel}" para substituir todos os dados importáveis.`,
          requireBackupConfirmation: true,
        });

    const conn = await pool.getConnection();

    try {
      if (isScheduleImport) {
        const rootRow = edrawScheduleRows[0];
        const projectName = cleanTaskName(col(rootRow, "Task", "Tarefa")) || sanitizeString(req.file.originalname.replace(/\.(xlsx|xlsm)$/i, ""), 200);
        const [existingProjectRows] = await conn.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [projectName]);
        replanProtection = await requireReplanJustification(
          conn,
          existingProjectRows[0]?.id || null,
          req.body?.replanJustification
        );
      }

      await conn.beginTransaction();

      let scheduleProjectName = "";
      let scheduleProjectId = null;
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
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      } else if (edrawScheduleRows.length) {
        const rootRow = edrawScheduleRows[0];
        const projectName = cleanTaskName(col(rootRow, "Task", "Tarefa")) || sanitizeString(req.file.originalname.replace(/\.(xlsx|xlsm)$/i, ""), 200);
        const recursos = new Set();
        edrawScheduleRows.forEach((row) => {
          sanitizeString(col(row, "Resources", "Recursos", "Responsável", "Responsavel"), 500)
            .split(";")
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((item) => recursos.add(item));
        });
        scheduleProjectName = projectName;
        scheduleProjectId = await upsertScheduleProject(conn, {
          projectName,
          fileName: req.file.originalname,
          rootRow,
          edrawScheduleRows,
          recursos,
        });
        imported.projetos++;
      }

      const tarefaSheet = workbook.getWorksheet("Tarefa") || workbook.getWorksheet("Tarefas") || edrawScheduleSheet;
      if (tarefaSheet) {
        const data = sheetToObjects(tarefaSheet);
        if (data.length > MAX_ROWS) throw new Error(`Limite de ${MAX_ROWS} linhas excedido na aba Tarefa`);
        const isEdrawSchedule = data.length > 0 && col(data[0], "Task") !== undefined && col(data[0], "WBS") !== undefined;
        const projectIdByName = new Map();
        if (!isEdrawSchedule) {
          const [projectRows] = await conn.query("SELECT id, projeto FROM projetos");
          projectRows.forEach((row) => projectIdByName.set(row.projeto, row.id));
        }
        const externalIdToTaskId = new Map();
        if (isEdrawSchedule) {
          data.forEach((row, index) => {
            const externalId = sanitizeString(col(row, "ID", "id"), 50) || String(index + 1);
            const wbs = sanitizeString(col(row, "WBS", "wbs"), 50) || externalId;
            externalIdToTaskId.set(externalId, buildImportedTaskId(scheduleProjectId, index + 1));
            externalIdToTaskId.set(wbs, buildImportedTaskId(scheduleProjectId, index + 1));
          });
        }
        if (isEdrawSchedule) {
          await conn.query(
            "DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?)",
            [scheduleProjectId || 0, scheduleProjectName]
          );
          await conn.query(
            "DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?) OR predecessor_task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?)",
            [scheduleProjectId || 0, scheduleProjectName, scheduleProjectId || 0, scheduleProjectName]
          );
          await conn.query("DELETE FROM tarefas WHERE projeto_id = ? OR projeto = ?", [scheduleProjectId || 0, scheduleProjectName]);
        } else {
          await conn.query("DELETE FROM task_assignments");
          await conn.query("DELETE FROM task_dependencies");
          await conn.query("DELETE FROM tarefas");
        }
        const pendingDependencies = [];
        for (let index = 0; index < data.length; index++) {
          const r = data[index];
          const wbs = sanitizeString(col(r, "WBS", "wbs"), 50) || sanitizeString(col(r, "ID", "id"), 20) || String(index + 1);
          const taskId = isEdrawSchedule
            ? buildImportedTaskId(scheduleProjectId, index + 1)
            : sanitizeString(col(r, "ID", "id"), 20);
          const externalId = isEdrawSchedule
            ? sanitizeString(col(r, "ID", "id"), 50) || String(index + 1)
            : sanitizeString(col(r, "External ID", "externalId", "external_id"), 50);
          const parentId = isEdrawSchedule
            ? externalIdToTaskId.get(parentFromWbs(wbs)) || ""
            : sanitizeString(col(r, "Parent ID", "parentId", "parent_id"), 20);
          const effortHours = isEdrawSchedule
            ? parseDurationHours(col(r, "Duration", "Duração", "Duracao"))
            : sanitizeNumber(col(r, "Esforço Planejado", "esforco_planej", "Esforco Planejado"));
          const percentual = isEdrawSchedule
            ? sanitizeNumber(col(r, "Progress", "% Concluído", "% Concluido", "percentual"))
            : sanitizeNumber(col(r, "% Concluído", "percentual", "% Concluido"));
          const taskProjectName = isEdrawSchedule ? scheduleProjectName : sanitizeString(col(r, "Projeto", "projeto"), 200);
          const taskProjectId = isEdrawSchedule ? scheduleProjectId : projectIdByName.get(taskProjectName) || null;
          const dataInicioPlanej = parseExcelDate(col(r, "Data Início Planejado", "data_inicio_planej", "Start"));
          const dataFimPlanej = parseExcelDate(col(r, "Data Fim Planejado", "data_fim_planej", "Finish"));
          const dataInicioReal = parseExcelDate(col(r, "Data Início Real", "data_inicio_real", "ActualStart", "Actual Start"));
          const dataFimReal = parseExcelDate(col(r, "Data Fim Real", "data_fim_real", "ActualFinish", "Actual Finish"));
          const status = deriveTaskStatus({
            status: isEdrawSchedule ? col(r, "Status") : col(r, "Status", "status"),
            percentual,
            dataInicioPlanej,
            dataFimPlanej,
            dataInicioReal,
            dataFimReal,
          });
          const constraintDate = parseExcelDate(col(r, "Data da Restrição", "Data Restrição", "constraint_date"));
          await conn.query(
            `INSERT INTO tarefas (id, parent_id, external_id, wbs, outline_level, sort_order, projeto, projeto_id, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, data_inicio_planej_date, esforco_planej, data_fim_planej, data_fim_planej_date, data_inicio_real, data_inicio_real_date, esforco_real, data_fim_real, data_fim_real_date, percentual, status, duration_minutes, constraint_date, constraint_date_date, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              taskId,
              parentId || null,
              externalId,
              wbs,
              isEdrawSchedule ? outlineLevelFromWbs(wbs) : sanitizeInt(col(r, "Outline Level", "outlineLevel"), 1),
              isEdrawSchedule ? sanitizeInt(externalId, index + 1) : sanitizeInt(col(r, "Sort Order", "sortOrder"), index + 1),
              taskProjectName,
              taskProjectId,
              isEdrawSchedule ? cleanTaskName(col(r, "Task", "Tarefa")) : sanitizeString(col(r, "Tarefa", "tarefa"), 500),
              isEdrawSchedule ? "" : sanitizeString(col(r, "Sub-tarefa", "subtarefa", "Subtarefa"), 500),
              isEdrawSchedule ? sanitizeString(col(r, "Resources", "Recursos", "Responsável", "Responsavel"), 500) : sanitizeString(col(r, "Responsável", "responsavel", "Responsavel"), 500),
              isEdrawSchedule ? "" : sanitizeString(col(r, "Função", "funcao", "Funcao"), 200),
              dataInicioPlanej,
              normalizeDateInput(dataInicioPlanej) || null,
              effortHours,
              dataFimPlanej,
              normalizeDateInput(dataFimPlanej) || null,
              dataInicioReal,
              normalizeDateInput(dataInicioReal) || null,
              isEdrawSchedule ? (dataInicioReal || dataFimReal ? effortHours * (percentual / 100) : 0) : sanitizeNumber(col(r, "Esforço Real", "esforco_real", "Esforco Real")),
              dataFimReal,
              normalizeDateInput(dataFimReal) || null,
              percentual,
              status,
              Math.round(effortHours * 60),
              constraintDate,
              normalizeDateInput(constraintDate) || null,
              sanitizeNumber(col(r, "Valor Previsto", "valor_previsto")),
              sanitizeNumber(col(r, "Valor Gasto", "valor_gasto")),
              isEdrawSchedule ? Math.round(effortHours / 8) : sanitizeInt(col(r, "Dias Planejados", "dias_planejados")),
              isEdrawSchedule ? Math.round(effortHours / 8) : sanitizeInt(col(r, "Dias Real", "dias_real")),
              isEdrawSchedule ? Math.round((effortHours / 8) * (percentual / 100)) : sanitizeInt(col(r, "Dias Completados", "dias_completados")),
            ]
          );
          if (isEdrawSchedule) {
            parsePredecessors(col(r, "Predecessors", "Predecessoras"), externalIdToTaskId).forEach((dependency) => {
              pendingDependencies.push({ taskId, ...dependency });
            });
          }
          imported.tarefas++;
        }
        for (const dependency of pendingDependencies) {
          await conn.query(
            "INSERT INTO task_dependencies (task_id, predecessor_task_id, dependency_type, lag_minutes) VALUES (?, ?, ?, ?)",
            [dependency.taskId, dependency.predecessorTaskId, dependency.type, dependency.lagMinutes]
          );
        }
      }

      const recursoSheet = workbook.getWorksheet("Recurso") || workbook.getWorksheet("Recursos") || findSheetByColumns(workbook, "Name", "Max Units", "Type");
      if (recursoSheet || isScheduleImport) {
        const hasResourceSheet = !!recursoSheet;
        let data = recursoSheet ? sheetToObjects(recursoSheet) : [];
        if (isScheduleImport && !data.length) {
          const names = new Set();
          edrawScheduleRows.forEach((row) => {
            sanitizeString(col(row, "Resources", "Recursos", "Responsável", "Responsavel"), 500)
              .split(";")
              .map((item) => item.trim())
              .filter(Boolean)
              .forEach((item) => names.add(item));
          });
          data = Array.from(names).map((name) => ({ Name: name }));
        }
        if (data.length > MAX_ROWS) throw new Error(`Limite de ${MAX_ROWS} linhas excedido na aba Recurso`);
        if (!isScheduleImport) {
          await conn.query("DELETE FROM recursos");
        }
        for (const r of data) {
          const nome = sanitizeString(col(r, "Nome", "nome", "Name"), 200);
          const values = [
            sanitizeString(col(r, "ID", "id"), 50),
            nome,
            sanitizeString(col(r, "Função", "funcao", "Funcao", "Group", "Type"), 200),
            sanitizeString(col(r, "Type", "resourceType"), 50).toLowerCase().includes("people") ? "work" : sanitizeString(col(r, "Type", "resourceType"), 50),
            normalizeMaxUnits(sanitizeNumber(col(r, "Max Units", "maxUnits"), 1)),
            sanitizeNumber(col(r, "Standard Rate", "standardRate", "Cost Per")),
            sanitizeNumber(col(r, "Overtime Rate", "overtimeRate")),
            sanitizeString(col(r, "E-Mail", "Email", "email"), 200),
          ];
          if (isScheduleImport) {
            if (!nome) continue;
            const [existingResources] = await conn.query("SELECT id FROM recursos WHERE nome = ? LIMIT 1", [nome]);
            if (existingResources.length) {
              if (hasResourceSheet) {
                await conn.query(
                  `UPDATE recursos SET external_id=?, funcao=?, resource_type=?, max_units=?, standard_rate=?, overtime_rate=?, email=? WHERE id=?`,
                  [values[0], values[2], values[3], values[4], values[5], values[6], values[7], existingResources[0].id]
                );
              }
              imported.recursos++;
            } else {
              await conn.query(
                `INSERT INTO recursos (external_id, nome, funcao, resource_type, max_units, standard_rate, overtime_rate, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                values
              );
              imported.recursos++;
            }
          } else {
            await conn.query(
              `INSERT INTO recursos (external_id, nome, funcao, resource_type, max_units, standard_rate, overtime_rate, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              values
            );
            imported.recursos++;
          }
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
      if (scheduleProjectName) projetosSet.add(scheduleProjectName);
      for (const projeto of projetosSet) {
        await syncProjectMetrics(pool, projeto);
      }
      if (isSupabaseSyncEnabled()) {
        await syncFullSnapshot(pool);
      }
      if (isScheduleImport && replanProtection.hasOfficialBaseline && scheduleProjectId) {
        try {
          await createProjectBaseline(pool, {
            projectId: scheduleProjectId,
            sourceType: BASELINE_SOURCE_TYPES.REPLAN,
            justification: replanProtection.justification,
            actor: req.authUser,
          });
        } catch (baselineError) {
          console.error("Baseline replan creation after Excel import failed:", baselineError);
        }
      }
      await logImportEvent(req.authUser, {
        action: "import",
        entityType: "excel_import",
        entityId: req.file.originalname,
        summary: `Importação Excel executada (${imported.projetos} projetos, ${imported.tarefas} tarefas, ${imported.recursos} recursos)`,
        after: {
          imported,
          file: fileMetadata,
          importMode: isScheduleImport ? "replace_project" : "replace_all",
          replanJustification: replanProtection.justification || undefined,
          baselineId: replanProtection.baseline?.id || undefined,
        },
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
      after: {
        imported,
        file: fileMetadata,
        importMode: sanitizeString(req.body?.importMode, 50),
        errorCode: err.code || "IMPORT_ERROR",
      },
    });
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Erro ao importar planilha",
      code: err.code || "IMPORT_ERROR",
    });
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
});

app.post("/api/import-ms-project/preview", requireAuth, requireImportAccess, uploadMsProject.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo XML enviado", code: "NO_FILE" });

  const filePath = req.file.path;
  try {
    assertXmlFileIntegrity(req.file);
    const xmlContent = fs.readFileSync(filePath, "utf8");
    if (/<!DOCTYPE/i.test(xmlContent)) {
      throw createHttpError("Arquivos XML com DOCTYPE não são permitidos", "FILE_XML_UNSAFE", 415);
    }
    const parsed = parseMsProjectXml(xmlContent);
    const conn = await pool.getConnection();
    try {
      const preview = await buildMsProjectImportPreview({
        parsed,
        file: req.file,
        conn,
        importConfirmPhrases: IMPORT_CONFIRM_PHRASES,
      });
      return res.json(preview);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("MS Project preview error:", err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Erro ao gerar prévia da importação XML do MS Project",
      code: err.code || "IMPORT_MS_PROJECT_PREVIEW",
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
    requireImportConfirmation(req, {
      mode: "replace_project",
      phrase: IMPORT_CONFIRM_PHRASES.msProject,
      errorMessage: `Confirme a operação digitando "${IMPORT_CONFIRM_PHRASES.msProject}" para substituir o cronograma existente do projeto importado.`,
    });
    assertXmlFileIntegrity(req.file);
    const xmlContent = fs.readFileSync(filePath, "utf8");
    if (/<!DOCTYPE/i.test(xmlContent)) {
      throw createHttpError("Arquivos XML com DOCTYPE não são permitidos", "FILE_XML_UNSAFE", 415);
    }
    const parsed = parseMsProjectXml(xmlContent);
    const conn = await pool.getConnection();
    let replanProtection = { hasOfficialBaseline: false, justification: "" };

    try {
      const [existingProjectRows] = await conn.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [parsed.projectName]);
      replanProtection = await requireReplanJustification(
        conn,
        existingProjectRows[0]?.id || null,
        req.body?.replanJustification
      );
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
        "DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?)",
        [projectId || 0, parsed.projectName]
      );
      await conn.query(
        "DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?) OR predecessor_task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?)",
        [projectId || 0, parsed.projectName, projectId || 0, parsed.projectName]
      );
      await conn.query("DELETE FROM tarefas WHERE projeto_id = ? OR projeto = ?", [projectId || 0, parsed.projectName]);

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

      const importTasks = remapTasksForProjectImport(parsed.tasks, projectId);

      for (const task of importTasks) {
        await conn.query(
          `INSERT INTO tarefas
            (id, parent_id, external_id, wbs, outline_level, sort_order, projeto, projeto_id, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, data_inicio_planej_date, esforco_planej,
             data_fim_planej, data_fim_planej_date, data_inicio_real, data_inicio_real_date, esforco_real, data_fim_real, data_fim_real_date, percentual, status, task_type, is_milestone, duration_minutes, is_manual,
             constraint_type, constraint_date, constraint_date_date, notes, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.parentId || null,
            task.externalId,
            task.wbs,
            task.outlineLevel,
            task.sortOrder,
            task.projeto,
            projectId,
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
            sourceType: replanProtection.hasOfficialBaseline ? BASELINE_SOURCE_TYPES.REPLAN : BASELINE_SOURCE_TYPES.XML_IMPORT,
            justification: replanProtection.justification,
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
          importMode: "replace_project",
          replanJustification: replanProtection.justification || undefined,
          baselineId: replanProtection.baseline?.id || undefined,
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
      after: {
        file: fileMetadata,
        importMode: sanitizeString(req.body?.importMode, 50),
        errorCode: err.code || "IMPORT_MS_PROJECT",
      },
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
