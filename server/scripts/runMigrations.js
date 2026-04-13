const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { withMysqlSsl } = require("../utils/mysqlConnection");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env"), override: false });

function resolveOptionalEnvPath(candidate) {
  if (!candidate) return "";
  if (path.isAbsolute(candidate)) return candidate;
  return path.resolve(__dirname, "..", candidate);
}

const optionalEnvPath = resolveOptionalEnvPath(process.env.APP_ENV_FILE);
if (optionalEnvPath) {
  require("dotenv").config({ path: optionalEnvPath, override: true });
}

async function ensureBaseSchema(connection) {
  const requiredTables = ["users", "projetos", "tarefas", "task_assignments", "recursos"];
  const placeholders = requiredTables.map(() => "?").join(", ");
  const [existingRows] = await connection.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})`,
    requiredTables
  );

  if (existingRows.length === requiredTables.length) return;

  console.log("Base schema not found. Bootstrapping schema.sql...");

  const schemaPath = path.resolve(__dirname, "..", "database", "schema.sql");
  let schemaSql = fs.readFileSync(schemaPath, "utf8");

  schemaSql = schemaSql
    .replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?USE\s+[^\n;]+;\s*/i, "")
    .replace(/DROP TABLE IF EXISTS schema_migrations;\s*CREATE TABLE schema_migrations\s*\([\s\S]*?\)\s*ENGINE=InnoDB;\s*/i, "");

  await connection.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    await connection.query(schemaSql);
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  }
  console.log("Base schema bootstrap completed.");
}

async function main() {
  const migrationsDir = path.resolve(__dirname, "..", "database", "migrations", "mysql");
  if (!fs.existsSync(migrationsDir)) {
    console.log("No migration directory found.");
    return;
  }

  const connection = await mysql.createConnection(withMysqlSsl({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4",
    multipleStatements: true,
  }));

  try {
    await ensureBaseSchema(connection);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [appliedRows] = await connection.query("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedRows.map((row) => row.filename));
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`Applying migration: ${file}`);
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    console.log("Migrations applied successfully.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Migration runner failed:", error);
  process.exit(1);
});
