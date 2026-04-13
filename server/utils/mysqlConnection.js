const fs = require("fs");
const path = require("path");

function readCaFromEnv() {
  if (process.env.DB_SSL_CA) return process.env.DB_SSL_CA.replace(/\\n/g, "\n");
  if (!process.env.DB_SSL_CA_FILE) return "";

  const filePath = path.isAbsolute(process.env.DB_SSL_CA_FILE)
    ? process.env.DB_SSL_CA_FILE
    : path.resolve(__dirname, "..", process.env.DB_SSL_CA_FILE);

  return fs.readFileSync(filePath, "utf8");
}

function getMysqlSslConfig() {
  const rawMode = (process.env.DB_SSL_MODE || process.env.DB_SSL || "").trim().toLowerCase();
  if (!rawMode || ["false", "0", "off", "disabled", "disable"].includes(rawMode)) return undefined;

  const ca = readCaFromEnv();
  const verifyCertificate = ["verify_ca", "verify-ca", "verify_identity", "verify-identity"].includes(rawMode);

  if (verifyCertificate && !ca) {
    throw new Error("DB_SSL_MODE requires DB_SSL_CA or DB_SSL_CA_FILE for certificate verification.");
  }

  return {
    rejectUnauthorized: verifyCertificate,
    ...(ca ? { ca } : {}),
  };
}

function withMysqlSsl(config) {
  const ssl = getMysqlSslConfig();
  return ssl ? { ...config, ssl } : config;
}

module.exports = {
  getMysqlSslConfig,
  withMysqlSsl,
};
