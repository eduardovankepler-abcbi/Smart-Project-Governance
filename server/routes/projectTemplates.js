const express = require("express");
const router = express.Router();
const { sanitizeString, sanitizeInt } = require("../utils/parsing");
const { logAudit } = require("../utils/audit");
const { createProjectBaseline, BASELINE_SOURCE_TYPES } = require("../utils/baselines");
const {
  TEMPLATE_SOURCE_TYPES,
  listProjectTemplates,
  createTemplateFromProject,
  instantiateProjectFromTemplate,
} = require("../utils/projectTemplates");

module.exports = function (pool, auth, taskHooks = {}) {
  const { requireAuth, requireWriteAccess, getAccessibleProjectIdsFilter } = auth;
  const { afterTaskChange = async () => {} } = taskHooks;

  router.get("/", requireAuth, async (_req, res) => {
    try {
      const templates = await listProjectTemplates(pool);
      res.json(templates);
    } catch (error) {
      console.error("Error listing project templates:", error);
      res.status(500).json({ error: "Erro ao listar templates", code: "FETCH_PROJECT_TEMPLATES" });
    }
  });

  router.post("/from-project", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const projectId = sanitizeInt(req.body?.projectId);
      if (!projectId) {
        return res.status(400).json({ error: "Projeto é obrigatório", code: "TEMPLATE_PROJECT_REQUIRED" });
      }

      const access = await getAccessibleProjectIdsFilter(req.authUser);
      if (!access.all && !access.projectIds.includes(projectId)) {
        return res.status(403).json({ error: "Sem acesso a este projeto", code: "TEMPLATE_PROJECT_ACCESS_DENIED" });
      }

      const template = await createTemplateFromProject(pool, {
        projectId,
        templateName: sanitizeString(req.body?.templateName, 180),
        descricao: sanitizeString(req.body?.descricao, 500),
        sourceType: sanitizeString(req.body?.sourceType, 30) || TEMPLATE_SOURCE_TYPES.PROJECT_SNAPSHOT,
        sourceFormat: sanitizeString(req.body?.sourceFormat, 30) || "internal_project",
        actor: req.authUser,
      });

      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "project_template",
        entityId: String(template.id),
        projectId,
        summary: `Template ${template.templateName} criado a partir do projeto ${template.originProjectName}`,
        after: template,
      });

      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating project template:", error);
      res.status(500).json({ error: error.message || "Erro ao criar template", code: "CREATE_PROJECT_TEMPLATE" });
    }
  });

  router.post("/:id/instantiate", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      if (req.authUser.role !== "admin") {
        return res.status(403).json({ error: "Somente administradores podem criar projetos a partir de templates", code: "TEMPLATE_INSTANTIATE_DENIED" });
      }

      const project = await instantiateProjectFromTemplate(pool, {
        templateId: sanitizeInt(req.params.id),
        projeto: sanitizeString(req.body?.projeto, 180),
        projectId: sanitizeString(req.body?.projectId, 50),
        descricao: sanitizeString(req.body?.descricao, 500),
        projectType: sanitizeString(req.body?.projectType, 30),
        prioridade: sanitizeString(req.body?.prioridade, 50),
        responsavel: sanitizeString(req.body?.responsavel, 120),
        businessUnitId: sanitizeInt(req.body?.businessUnitId),
        produtoId: sanitizeInt(req.body?.produtoId),
        actor: req.authUser,
      });

      await afterTaskChange(project.projectName);
      await createProjectBaseline(pool, {
        projectId: project.projectId,
        sourceType: BASELINE_SOURCE_TYPES.PROJECT_CREATE,
        actor: req.authUser,
      });

      const [projectRows] = await pool.query("SELECT * FROM projetos WHERE id = ?", [project.projectId]);
      await logAudit(pool, {
        actor: req.authUser,
        action: "create",
        entityType: "projeto",
        entityId: String(project.projectId),
        projectId: project.projectId,
        summary: `Projeto ${project.projectName} criado a partir do template ${project.template.templateName}`,
        after: {
          projeto: projectRows[0] || null,
          template: project.template,
        },
      });

      res.status(201).json({
        success: true,
        projectId: project.projectId,
        projectName: project.projectName,
        template: project.template,
      });
    } catch (error) {
      console.error("Error instantiating project template:", error);
      res.status(500).json({ error: error.message || "Erro ao criar projeto a partir do template", code: "INSTANTIATE_PROJECT_TEMPLATE" });
    }
  });

  return router;
};
