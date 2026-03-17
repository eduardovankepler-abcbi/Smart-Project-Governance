const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const supabaseSync = require("../utils/supabaseSync");
const audit = require("../utils/audit");

supabaseSync.syncProjeto = async () => {};
supabaseSync.syncTaskBundle = async () => {};
supabaseSync.syncAuditLog = async () => {};
supabaseSync.deleteProjeto = async () => {};
audit.logAudit = async () => {};

function createPool(handler) {
  return {
    async query(sql, params) {
      return handler(sql, params);
    },
  };
}

function createAuth(authUser, options = {}) {
  return {
    requireAuth(req, _res, next) {
      req.authUser = authUser;
      next();
    },
    requireWriteAccess(req, res, next) {
      if (authUser.role === "admin" || authUser.role === "pmo") return next();
      return res.status(403).json({ error: "Sem permissão de escrita", code: "AUTH_WRITE_DENIED" });
    },
    requireManageUsers(req, res, next) {
      if (authUser.role === "admin" || authUser.role === "pmo") return next();
      return res.status(403).json({ error: "Sem permissão para governança de usuários", code: "AUTH_GOVERNANCE_DENIED" });
    },
    async getAccessibleProjectIdsFilter() {
      return options.projectIdsFilter || { all: authUser.role === "admin", projectIds: authUser.assignedProjectIds || [] };
    },
    async getAccessibleProjectNamesFilter() {
      return options.projectNamesFilter || { all: authUser.role === "admin", projectNames: options.projectNames || [] };
    },
  };
}

async function withServer(routerFactory, pool, auth, fn) {
  const app = express();
  app.use(express.json());
  app.use("/", routerFactory(pool, auth));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function loadRouteFactory(relativePath) {
  const resolved = require.resolve(relativePath);
  delete require.cache[resolved];
  return require(relativePath);
}

test("PMO cannot create projects directly", async () => {
  const routeFactory = loadRouteFactory("../routes/projetos");
  const pool = createPool(async () => {
    throw new Error("pool.query should not be called for denied PMO create");
  });
  const auth = createAuth({
    id: 2,
    nome: "PMO Teste",
    role: "pmo",
    assignedProjectIds: [10],
  });

  await withServer(routeFactory, pool, auth, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projeto: "Projeto Indevido", businessUnitId: 1 }),
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "PMO_PROJECT_CREATE_DENIED");
  });
});

test("PMO cannot update project outside assigned scope", async () => {
  const routeFactory = loadRouteFactory("../routes/projetos");
  const pool = createPool(async () => {
    throw new Error("pool.query should not be called for denied PMO update");
  });
  const auth = createAuth(
    { id: 2, nome: "PMO Teste", role: "pmo", assignedProjectIds: [10] },
    { projectIdsFilter: { all: false, projectIds: [10] } },
  );

  await withServer(routeFactory, pool, auth, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/99`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessUnitId: 1, projeto: "Projeto 99" }),
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "PROJECT_ACCESS_DENIED");
  });
});

test("Viewer only receives allocations for linked resource", async () => {
  const routeFactory = loadRouteFactory("../routes/alocacoes");
  const pool = createPool(async (sql, params) => {
    if (sql.includes("FROM task_assignments ta") && sql.includes("WHERE ta.resource_id = ?")) {
      assert.deepEqual(params, [77]);
      return [[
        {
          id: 1,
          task_id: "1.1",
          projeto: "Projeto Viewer",
          tarefa: "Tarefa Viewer",
          wbs: "1.1",
          task_status: "Em andamento",
          resource_id: 77,
          resource_name: "Recurso Viewer",
          units: 1,
          work: 8,
          actual_work: 2,
          remaining_work: 6,
          cost: 100,
        },
      ]];
    }
    throw new Error(`Unexpected SQL in viewer allocation test: ${sql}`);
  });
  const auth = createAuth({ id: 5, nome: "Viewer", role: "viewer", linkedResourceId: 77 });

  await withServer(routeFactory, pool, auth, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].resourceId, 77);
    assert.equal(body[0].resourceName, "Recurso Viewer");
  });
});

test("PMO cannot reset admin password, but admin can reset viewer password", async () => {
  const deniedPool = createPool(async (sql) => {
    if (sql.includes("SELECT * FROM users WHERE id = ?")) {
      return [[{ id: 1, nome: "Administrador", role: "admin" }]];
    }
    throw new Error(`Unexpected SQL in denied reset test: ${sql}`);
  });
  const pmoAuth = createAuth({ id: 2, nome: "PMO", role: "pmo" });
  const deniedRouteFactory = loadRouteFactory("../routes/users");

  await withServer(deniedRouteFactory, deniedPool, pmoAuth, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/1/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "NovaSenha@123" }),
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "USER_RESET_DENIED");
  });

  const calls = [];
  const adminPool = createPool(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT * FROM users WHERE id = ?")) {
      return [[{ id: 8, nome: "Viewer Teste", role: "viewer" }]];
    }
    if (sql.startsWith("UPDATE users SET password_hash")) {
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("DELETE FROM user_sessions")) {
      return [{ affectedRows: 2 }];
    }
    if (sql.startsWith("INSERT INTO audit_logs")) {
      return [{ insertId: 1 }];
    }
    if (sql.startsWith("SELECT * FROM audit_logs WHERE id = ?")) {
      return [[{ id: 1 }]];
    }
    throw new Error(`Unexpected SQL in allowed reset test: ${sql}`);
  });
  const adminAuth = createAuth({ id: 1, nome: "Admin", role: "admin" });
  const allowedRouteFactory = loadRouteFactory("../routes/users");

  await withServer(allowedRouteFactory, adminPool, adminAuth, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/8/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "NovaSenha@123" }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
  });

  assert.ok(calls.some((item) => item.sql.startsWith("UPDATE users SET password_hash")));
  assert.ok(calls.some((item) => item.sql.startsWith("DELETE FROM user_sessions")));
});
