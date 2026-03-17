const express = require("express");
const router = express.Router();
const { sanitizeString, sanitizeNumber, sanitizeInt, normalizeDateInput } = require("../utils/parsing");
const { logAudit } = require("../utils/audit");

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const MAX_WBS_DEPTH = 5;

function parseWbsSegments(value) {
  return String(value || "")
    .split(".")
    .map((segment) => parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment) && segment > 0);
}

function depthFromCode(code) {
  return parseWbsSegments(code).length;
}

function getTaskHierarchyCode(task) {
  return sanitizeString(task.wbs, 50) || sanitizeString(task.id, 20);
}

function getNextTaskSequence(tasks = []) {
  const numericIds = tasks
    .map((task, index) => {
      const explicit = parseInt(task.external_id, 10);
      if (Number.isFinite(explicit) && explicit > 0) return explicit;
      return index + 1;
    });
  return (numericIds.length ? Math.max(...numericIds) : 0) + 1;
}

function buildInternalTaskId(projectId, sequence) {
  return `${projectId}-${sequence}`;
}

function buildNextRootWbs(tasks = []) {
  const current = tasks
    .filter((task) => !task.parent_id)
    .map((task) => parseWbsSegments(getTaskHierarchyCode(task))[0] || 0);
  return String((current.length ? Math.max(...current) : 0) + 1);
}

function buildNextChildWbs(parentTask, tasks = []) {
  const parentWbs = getTaskHierarchyCode(parentTask);
  const current = tasks
    .filter((task) => task.parent_id === parentTask.id)
    .map((task) => {
      const segments = parseWbsSegments(getTaskHierarchyCode(task));
      return segments[segments.length - 1] || 0;
    });
  return `${parentWbs}.${(current.length ? Math.max(...current) : 0) + 1}`;
}

async function loadProjectTaskContext(conn, projeto) {
  const [projectRows] = await conn.query("SELECT id, project_code, projeto FROM projetos WHERE projeto = ? LIMIT 1", [projeto]);
  if (!projectRows.length) return null;
  const [taskRows] = await conn.query("SELECT id, parent_id, external_id, wbs, projeto FROM tarefas WHERE projeto = ? ORDER BY sort_order, id", [projeto]);
  return { project: projectRows[0], tasks: taskRows };
}

function buildTaskIdentifiers(context, parentTask = null) {
  const sequence = getNextTaskSequence(context.tasks);
  const wbs = parentTask ? buildNextChildWbs(parentTask, context.tasks) : buildNextRootWbs(context.tasks);
  const outlineLevel = depthFromCode(wbs);

  if (outlineLevel > MAX_WBS_DEPTH) {
    return { error: `Máximo de ${MAX_WBS_DEPTH} níveis de subtarefa permitidos` };
  }

  return {
    id: buildInternalTaskId(context.project.id, sequence),
    externalId: String(sequence),
    wbs,
    outlineLevel,
    sortOrder: sequence,
  };
}

async function loadTaskRelations(pool) {
  const [assignmentRows] = await pool.query("SELECT * FROM task_assignments ORDER BY id");
  const [dependencyRows] = await pool.query("SELECT * FROM task_dependencies ORDER BY id");

  const assignmentsByTask = new Map();
  const dependenciesByTask = new Map();

  assignmentRows.forEach((row) => {
    const current = assignmentsByTask.get(row.task_id) || [];
    current.push(row);
    assignmentsByTask.set(row.task_id, current);
  });

  dependencyRows.forEach((row) => {
    const current = dependenciesByTask.get(row.task_id) || [];
    current.push(row);
    dependenciesByTask.set(row.task_id, current);
  });

  return { assignmentsByTask, dependenciesByTask };
}

async function normalizeAssignments(pool, rawAssignments = [], fallbackResponsavel = "", fallbackFuncao = "") {
  const assignments = [];
  for (const assignment of asArray(rawAssignments)) {
    const resourceName = sanitizeString(assignment.resourceName || assignment.nome, 100);
    let resourceId = sanitizeInt(assignment.resourceId, 0) || null;
    let role = sanitizeString(assignment.resourceRole || assignment.funcao, 100);

    if (!resourceId && resourceName) {
      const [resourceRows] = await pool.query("SELECT id, funcao FROM recursos WHERE nome = ? LIMIT 1", [resourceName]);
      if (resourceRows.length) {
        resourceId = resourceRows[0].id;
        if (!role) role = resourceRows[0].funcao || "";
      }
    }

    assignments.push({
      resourceId,
      resourceName,
      resourceRole: role,
      units: sanitizeNumber(assignment.units, 1),
      work: sanitizeNumber(assignment.work),
      actualWork: sanitizeNumber(assignment.actualWork),
      remainingWork: sanitizeNumber(assignment.remainingWork),
      cost: sanitizeNumber(assignment.cost),
    });
  }

  if (!assignments.length && fallbackResponsavel) {
    fallbackResponsavel.split(";").map((name) => name.trim()).filter(Boolean).forEach((resourceName) => {
      assignments.push({
        resourceId: null,
        resourceName,
        resourceRole: fallbackFuncao,
        units: 1,
        work: 0,
        actualWork: 0,
        remainingWork: 0,
        cost: 0,
      });
    });
  }

  return assignments;
}

function normalizeDependencies(rawDependencies = []) {
  return asArray(rawDependencies)
    .map((dependency) => ({
      predecessorTaskId: sanitizeString(dependency.predecessorTaskId, 20),
      type: sanitizeString(dependency.type, 10) || "FS",
      lagMinutes: sanitizeInt(dependency.lagMinutes),
    }))
    .filter((dependency) => dependency.predecessorTaskId);
}

module.exports = function (pool, auth, taskHooks = {}) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectNamesFilter } = auth;
  const { mapTarefa } = require("../utils/mappers");
  const supabaseSync = require("../utils/supabaseSync");
  const { afterTaskChange = async () => {} } = taskHooks;

  router.get("/", requireAuth, async (req, res) => {
    try {
      let rows;
      if (req.authUser.role === "viewer") {
        if (!req.authUser.linkedResourceId) return res.json([]);
        [rows] = await pool.query(
          `SELECT DISTINCT t.*
           FROM tarefas t
           INNER JOIN task_assignments ta ON ta.task_id = t.id
           WHERE ta.resource_id = ?
           ORDER BY t.sort_order, t.id`,
          [req.authUser.linkedResourceId]
        );
      } else {
        const access = await getAccessibleProjectNamesFilter(req.authUser);
        [rows] = access.all
          ? await pool.query("SELECT * FROM tarefas ORDER BY sort_order, id")
          : await pool.query(
            "SELECT * FROM tarefas WHERE projeto IN (?) ORDER BY sort_order, id",
            [access.projectNames.length ? access.projectNames : ["__none__"]]
          );
      }
      const visibleTaskIds = rows.map((row) => row.id);
      const [assignmentRows] = visibleTaskIds.length
        ? await pool.query("SELECT * FROM task_assignments WHERE task_id IN (?) ORDER BY id", [visibleTaskIds])
        : [[]];
      const [dependencyRows] = visibleTaskIds.length
        ? await pool.query("SELECT * FROM task_dependencies WHERE task_id IN (?) ORDER BY id", [visibleTaskIds])
        : [[]];
      const assignmentsByTask = new Map();
      const dependenciesByTask = new Map();
      assignmentRows.forEach((row) => {
        const current = assignmentsByTask.get(row.task_id) || [];
        current.push(row);
        assignmentsByTask.set(row.task_id, current);
      });
      dependencyRows.forEach((row) => {
        const current = dependenciesByTask.get(row.task_id) || [];
        current.push(row);
        dependenciesByTask.set(row.task_id, current);
      });
      res.json(rows.map((row) => mapTarefa(
        row,
        assignmentsByTask.get(row.id) || [],
        dependenciesByTask.get(row.id) || []
      )));
    } catch (err) {
      console.error("Error fetching tarefas:", err);
      res.status(500).json({ error: "Erro ao buscar tarefas", code: "FETCH_TAREFAS" });
    }
  });

  router.post("/", requireAuth, requireWriteAccess, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const b = req.body;
      const projeto = sanitizeString(b.projeto, 200);
      if (!projeto) return res.status(400).json({ error: "Projeto é obrigatório" });
      if (req.authUser.role === "pmo") {
        const access = await getAccessibleProjectNamesFilter(req.authUser);
        if (!access.projectNames.includes(projeto)) {
          return res.status(403).json({ error: "Sem acesso a este projeto", code: "TASK_PROJECT_ACCESS_DENIED" });
        }
      }

      const parentId = sanitizeString(b.parentId, 20);
      const context = await loadProjectTaskContext(conn, projeto);
      if (!context) return res.status(400).json({ error: "Projeto inválido" });
      const parentTask = parentId ? context.tasks.find((task) => task.id === parentId) : null;

      if (parentId) {
        if (!parentTask) return res.status(400).json({ error: "Tarefa pai não encontrada" });
        if (parentTask.projeto !== projeto) return res.status(400).json({ error: "A tarefa pai deve pertencer ao mesmo projeto" });
      }

      const generated = buildTaskIdentifiers(context, parentTask);
      if (generated.error) return res.status(400).json({ error: generated.error });

      const id = sanitizeString(b.id, 20) || generated.id;

      const assignments = await normalizeAssignments(conn, b.assignments, b.responsavel, b.funcao);
      const dependencies = normalizeDependencies(b.predecessors);
      const responsavel = assignments.map((assignment) => assignment.resourceName).filter(Boolean).join("; ") || sanitizeString(b.responsavel, 500);
      const funcao = sanitizeString(b.funcao || assignments[0]?.resourceRole, 200);
      const externalId = sanitizeString(b.externalId, 50) || generated.externalId;
      const wbs = sanitizeString(b.wbs, 50) || generated.wbs;
      const outlineLevel = sanitizeInt(b.outlineLevel, generated.outlineLevel);
      const dataInicioPlanej = sanitizeString(b.dataInicioPlanej, 20);
      const dataFimPlanej = sanitizeString(b.dataFimPlanej, 20);
      const dataInicioReal = sanitizeString(b.dataInicioReal, 20);
      const dataFimReal = sanitizeString(b.dataFimReal, 20);
      const constraintDate = sanitizeString(b.constraintDate, 20);

      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO tarefas
          (id, parent_id, external_id, wbs, outline_level, sort_order, projeto, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, data_inicio_planej_date, esforco_planej,
           data_fim_planej, data_fim_planej_date, data_inicio_real, data_inicio_real_date, esforco_real, data_fim_real, data_fim_real_date, percentual, status, task_type, is_milestone, duration_minutes, is_manual,
           constraint_type, constraint_date, constraint_date_date, notes, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          parentId || null,
          externalId,
          wbs,
          outlineLevel,
          sanitizeInt(b.sortOrder, generated.sortOrder),
          projeto,
          sanitizeString(b.tarefa, 500),
          sanitizeString(b.subtarefa, 500),
          responsavel,
          funcao,
          dataInicioPlanej,
          normalizeDateInput(dataInicioPlanej) || null,
          sanitizeNumber(b.esforcoPlanej),
          dataFimPlanej,
          normalizeDateInput(dataFimPlanej) || null,
          dataInicioReal,
          normalizeDateInput(dataInicioReal) || null,
          sanitizeNumber(b.esforcoReal),
          dataFimReal,
          normalizeDateInput(dataFimReal) || null,
          sanitizeNumber(b.percentual),
          sanitizeString(b.status, 50),
          sanitizeString(b.taskType, 30) || "fixed_units",
          b.milestone ? 1 : 0,
          sanitizeInt(b.durationMinutes),
          b.isManual ? 1 : 0,
          sanitizeString(b.constraintType, 50),
          constraintDate,
          normalizeDateInput(constraintDate) || null,
          sanitizeString(b.notes, 4000),
          sanitizeNumber(b.valorPrevisto),
          sanitizeNumber(b.valorGasto),
          sanitizeInt(b.diasPlanejados),
          sanitizeInt(b.diasReal),
          sanitizeInt(b.diasCompletados),
        ]
      );

      for (const assignment of assignments) {
        await conn.query(
          `INSERT INTO task_assignments
            (task_id, resource_id, resource_name, units, work, actual_work, remaining_work, cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            assignment.resourceId,
            assignment.resourceName,
            assignment.units,
            assignment.work,
            assignment.actualWork,
            assignment.remainingWork,
            assignment.cost,
          ]
        );
      }

      for (const dependency of dependencies) {
        await conn.query(
          "INSERT INTO task_dependencies (task_id, predecessor_task_id, dependency_type, lag_minutes) VALUES (?, ?, ?, ?)",
          [id, dependency.predecessorTaskId, dependency.type, dependency.lagMinutes]
        );
      }

      await conn.commit();
      const [rows] = await pool.query("SELECT * FROM tarefas WHERE id = ?", [id]);
      const [assignmentRows] = await pool.query("SELECT * FROM task_assignments WHERE task_id = ? ORDER BY id", [id]);
      const [dependencyRows] = await pool.query("SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY id", [id]);
      await afterTaskChange(rows[0].projeto);
      await supabaseSync.syncTaskBundle(rows[0], assignmentRows, dependencyRows);
      const [projectRows] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [rows[0].projeto]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "tarefa",
        entityId: id,
        projectId: projectRows[0]?.id || null,
        summary: `Tarefa ${rows[0].tarefa} criada em ${rows[0].projeto}`,
        after: { task: rows[0], assignments: assignmentRows, dependencies: dependencyRows },
      });
      res.status(201).json(mapTarefa(rows[0], assignmentRows, dependencyRows));
    } catch (err) {
      await conn.rollback();
      console.error("Error creating tarefa:", err);
      if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "ID já existe" });
      res.status(500).json({ error: "Erro ao criar tarefa", code: "CREATE_TAREFA" });
    } finally {
      conn.release();
    }
  });

  router.put("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const b = req.body;
      const [beforeTaskRows] = await conn.query("SELECT * FROM tarefas WHERE id = ?", [req.params.id]);
      const [beforeAssignmentRows] = await conn.query("SELECT * FROM task_assignments WHERE task_id = ? ORDER BY id", [req.params.id]);
      const [beforeDependencyRows] = await conn.query("SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY id", [req.params.id]);
      if (!beforeTaskRows.length) return res.status(404).json({ error: "Tarefa não encontrada" });
      if (req.authUser.role === "pmo") {
        const access = await getAccessibleProjectNamesFilter(req.authUser);
        const nextProject = sanitizeString(b.projeto, 200) || beforeTaskRows[0].projeto;
        if (!access.projectNames.includes(beforeTaskRows[0].projeto) || !access.projectNames.includes(nextProject)) {
          return res.status(403).json({ error: "Sem acesso a este projeto", code: "TASK_PROJECT_ACCESS_DENIED" });
        }
      }
      const requestedParentId = sanitizeString(b.parentId, 20);
      const [childRows] = await conn.query("SELECT id FROM tarefas WHERE parent_id = ? LIMIT 1", [req.params.id]);
      if (requestedParentId !== (beforeTaskRows[0].parent_id || "") && childRows.length) {
        return res.status(400).json({ error: "Reparentear tarefas com subtarefas ainda não é suportado. Ajuste a hierarquia começando pelos níveis inferiores." });
      }
      const assignments = await normalizeAssignments(conn, b.assignments, b.responsavel, b.funcao);
      const dependencies = normalizeDependencies(b.predecessors);
      const responsavel = assignments.map((assignment) => assignment.resourceName).filter(Boolean).join("; ") || sanitizeString(b.responsavel, 500);
      const funcao = sanitizeString(b.funcao || assignments[0]?.resourceRole, 200);
      const nextProject = sanitizeString(b.projeto, 200) || beforeTaskRows[0].projeto;
      const context = await loadProjectTaskContext(conn, nextProject);
      const parentTask = requestedParentId
        ? context?.tasks.find((task) => task.id === requestedParentId)
        : null;
      if (requestedParentId && !parentTask) return res.status(400).json({ error: "Tarefa pai não encontrada" });
      if (parentTask && parentTask.id === req.params.id) return res.status(400).json({ error: "A tarefa não pode ser pai dela mesma" });
      const dataInicioPlanej = sanitizeString(b.dataInicioPlanej, 20);
      const dataFimPlanej = sanitizeString(b.dataFimPlanej, 20);
      const dataInicioReal = sanitizeString(b.dataInicioReal, 20);
      const dataFimReal = sanitizeString(b.dataFimReal, 20);
      const constraintDate = sanitizeString(b.constraintDate, 20);
      const nextWbs = sanitizeString(b.wbs, 50) || beforeTaskRows[0].wbs || beforeTaskRows[0].id;
      if (depthFromCode(nextWbs) > MAX_WBS_DEPTH) {
        return res.status(400).json({ error: `Máximo de ${MAX_WBS_DEPTH} níveis de subtarefa permitidos` });
      }

      await conn.beginTransaction();
      await conn.query(
        `UPDATE tarefas
         SET parent_id=?, external_id=?, wbs=?, outline_level=?, sort_order=?, projeto=?, tarefa=?, subtarefa=?, responsavel=?, funcao=?,
             data_inicio_planej=?, data_inicio_planej_date=?, esforco_planej=?, data_fim_planej=?, data_fim_planej_date=?, data_inicio_real=?, data_inicio_real_date=?, esforco_real=?, data_fim_real=?, data_fim_real_date=?, percentual=?, status=?,
             task_type=?, is_milestone=?, duration_minutes=?, is_manual=?, constraint_type=?, constraint_date=?, constraint_date_date=?, notes=?, valor_previsto=?,
             valor_gasto=?, dias_planejados=?, dias_real=?, dias_completados=?
         WHERE id=?`,
        [
          requestedParentId || null,
          sanitizeString(b.externalId, 50) || beforeTaskRows[0].external_id || "",
          nextWbs,
          sanitizeInt(b.outlineLevel, depthFromCode(nextWbs) || 1),
          sanitizeInt(b.sortOrder, beforeTaskRows[0].sort_order || 0),
          nextProject,
          sanitizeString(b.tarefa, 500),
          sanitizeString(b.subtarefa, 500),
          responsavel,
          funcao,
          dataInicioPlanej,
          normalizeDateInput(dataInicioPlanej) || null,
          sanitizeNumber(b.esforcoPlanej),
          dataFimPlanej,
          normalizeDateInput(dataFimPlanej) || null,
          dataInicioReal,
          normalizeDateInput(dataInicioReal) || null,
          sanitizeNumber(b.esforcoReal),
          dataFimReal,
          normalizeDateInput(dataFimReal) || null,
          sanitizeNumber(b.percentual),
          sanitizeString(b.status, 50),
          sanitizeString(b.taskType, 30) || "fixed_units",
          b.milestone ? 1 : 0,
          sanitizeInt(b.durationMinutes),
          b.isManual ? 1 : 0,
          sanitizeString(b.constraintType, 50),
          constraintDate,
          normalizeDateInput(constraintDate) || null,
          sanitizeString(b.notes, 4000),
          sanitizeNumber(b.valorPrevisto),
          sanitizeNumber(b.valorGasto),
          sanitizeInt(b.diasPlanejados),
          sanitizeInt(b.diasReal),
          sanitizeInt(b.diasCompletados),
          req.params.id,
        ]
      );

      await conn.query("DELETE FROM task_assignments WHERE task_id = ?", [req.params.id]);
      await conn.query("DELETE FROM task_dependencies WHERE task_id = ?", [req.params.id]);

      for (const assignment of assignments) {
        await conn.query(
          `INSERT INTO task_assignments
            (task_id, resource_id, resource_name, units, work, actual_work, remaining_work, cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.id,
            assignment.resourceId,
            assignment.resourceName,
            assignment.units,
            assignment.work,
            assignment.actualWork,
            assignment.remainingWork,
            assignment.cost,
          ]
        );
      }

      for (const dependency of dependencies) {
        await conn.query(
          "INSERT INTO task_dependencies (task_id, predecessor_task_id, dependency_type, lag_minutes) VALUES (?, ?, ?, ?)",
          [req.params.id, dependency.predecessorTaskId, dependency.type, dependency.lagMinutes]
        );
      }

      await conn.commit();
      const [rows] = await pool.query("SELECT * FROM tarefas WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Tarefa não encontrada" });
      const [assignmentRows] = await pool.query("SELECT * FROM task_assignments WHERE task_id = ? ORDER BY id", [req.params.id]);
      const [dependencyRows] = await pool.query("SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY id", [req.params.id]);
      await afterTaskChange(rows[0].projeto);
      await supabaseSync.syncTaskBundle(rows[0], assignmentRows, dependencyRows);
      const [projectRows] = await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [rows[0].projeto]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "update",
        entityType: "tarefa",
        entityId: String(req.params.id),
        projectId: projectRows[0]?.id || null,
        summary: `Tarefa ${rows[0].tarefa} atualizada em ${rows[0].projeto}`,
        before: { task: beforeTaskRows[0] || null, assignments: beforeAssignmentRows, dependencies: beforeDependencyRows },
        after: { task: rows[0], assignments: assignmentRows, dependencies: dependencyRows },
      });
      res.json(mapTarefa(rows[0], assignmentRows, dependencyRows));
    } catch (err) {
      await conn.rollback();
      console.error("Error updating tarefa:", err);
      res.status(500).json({ error: "Erro ao atualizar tarefa", code: "UPDATE_TAREFA" });
    } finally {
      conn.release();
    }
  });

  router.delete("/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const [existing] = await pool.query("SELECT projeto FROM tarefas WHERE id = ?", [req.params.id]);
      const [beforeTaskRows] = await pool.query("SELECT * FROM tarefas WHERE id = ?", [req.params.id]);
      const [beforeAssignmentRows] = await pool.query("SELECT * FROM task_assignments WHERE task_id = ? ORDER BY id", [req.params.id]);
      const [beforeDependencyRows] = await pool.query("SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY id", [req.params.id]);
      if (existing.length && req.authUser.role === "pmo") {
        const access = await getAccessibleProjectNamesFilter(req.authUser);
        if (!access.projectNames.includes(existing[0].projeto)) {
          return res.status(403).json({ error: "Sem acesso a este projeto", code: "TASK_PROJECT_ACCESS_DENIED" });
        }
      }
      const [result] = await pool.query("DELETE FROM tarefas WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: "Tarefa não encontrada" });
      await pool.query("DELETE FROM task_assignments WHERE task_id = ?", [req.params.id]);
      await pool.query("DELETE FROM task_dependencies WHERE task_id = ? OR predecessor_task_id = ?", [req.params.id, req.params.id]);
      if (existing.length) await afterTaskChange(existing[0].projeto);
      await supabaseSync.deleteTaskBundle(req.params.id);
      const [projectRows] = existing.length
        ? await pool.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [existing[0].projeto])
        : [[]];
      await logAudit(pool, {
        actor: req.authUser,
        action: "delete",
        entityType: "tarefa",
        entityId: String(req.params.id),
        projectId: projectRows[0]?.id || null,
        summary: `Tarefa ${beforeTaskRows[0]?.tarefa || req.params.id} removida`,
        before: { task: beforeTaskRows[0] || null, assignments: beforeAssignmentRows, dependencies: beforeDependencyRows },
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting tarefa:", err);
      res.status(500).json({ error: "Erro ao excluir tarefa", code: "DELETE_TAREFA" });
    }
  });

  return router;
};
