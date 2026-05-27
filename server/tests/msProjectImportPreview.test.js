const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMsProjectXml, remapTasksForProjectImport } = require("../utils/msProjectXml");
const { buildMsProjectImportPreview } = require("../utils/msProjectImportPreview");

const IMPORT_CONFIRM_PHRASES = {
  msProject: "SUBSTITUIR CRONOGRAMA",
};

function createConn(handler) {
  return {
    async query(sql, params = []) {
      return handler(sql, params);
    },
  };
}

function createFile(originalname = "projeto.xml") {
  return {
    originalname,
    mimetype: "application/xml",
    size: 2048,
  };
}

function buildSampleXml(projectName = "PROJETO XML") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <Name>${projectName}</Name>
  <Tasks>
    <Task>
      <UID>1</UID>
      <ID>1</ID>
      <Name>Resumo</Name>
      <OutlineNumber>1</OutlineNumber>
      <OutlineLevel>1</OutlineLevel>
      <Start>2026-05-01T08:00:00</Start>
      <Finish>2026-05-10T17:00:00</Finish>
      <Duration>PT16H0M0S</Duration>
      <Work>PT16H0M0S</Work>
      <PercentComplete>50</PercentComplete>
    </Task>
    <Task>
      <UID>2</UID>
      <ID>2</ID>
      <Name>Construir</Name>
      <OutlineNumber>1.1</OutlineNumber>
      <OutlineLevel>2</OutlineLevel>
      <Start>2026-05-02T08:00:00</Start>
      <Finish>2026-05-04T17:00:00</Finish>
      <Duration>PT8H0M0S</Duration>
      <Work>PT8H0M0S</Work>
      <PercentComplete>0</PercentComplete>
      <PredecessorLink>
        <PredecessorUID>1</PredecessorUID>
        <Type>1</Type>
      </PredecessorLink>
    </Task>
  </Tasks>
  <Resources>
    <Resource>
      <UID>10</UID>
      <Name>Maria</Name>
      <Type>1</Type>
    </Resource>
    <Resource>
      <UID>11</UID>
      <Name>Joao</Name>
      <Type>1</Type>
    </Resource>
  </Resources>
  <Assignments>
    <Assignment>
      <TaskUID>1</TaskUID>
      <ResourceUID>10</ResourceUID>
      <Units>1</Units>
      <Work>PT16H0M0S</Work>
    </Assignment>
    <Assignment>
      <TaskUID>2</TaskUID>
      <ResourceUID>11</ResourceUID>
      <Units>1</Units>
      <Work>PT8H0M0S</Work>
    </Assignment>
  </Assignments>
</Project>`;
}

test("MS Project preview scopes replacement to existing XML project", async () => {
  const parsed = parseMsProjectXml(buildSampleXml("PROJETO XML"));
  const conn = createConn(async (sql, params) => {
    if (sql.includes("SELECT id FROM projetos WHERE projeto = ?")) {
      assert.deepEqual(params, ["PROJETO XML"]);
      return [[{ id: 77 }]];
    }
    if (sql === "SELECT COUNT(*) AS total FROM projetos") return [[{ total: 4 }]];
    if (sql.includes("FROM task_assignments")) return [[{ total: 6 }]];
    if (sql.includes("FROM task_dependencies")) return [[{ total: 3 }]];
    if (sql.includes("FROM tarefas WHERE projeto_id = ? OR projeto = ?")) {
      assert.deepEqual(params, [77, "PROJETO XML"]);
      return [[{ total: 18 }]];
    }
    if (sql.includes("SELECT nome FROM recursos WHERE nome IN")) {
      assert.deepEqual(params, [["Maria", "Joao"]]);
      return [[{ nome: "Maria" }]];
    }
    if (sql.includes("FROM project_baselines")) {
      assert.deepEqual(params, [77]);
      return [[{
        id: 11,
        baseline_number: 1,
        baseline_name: "LB 01 - Oficial",
        task_count: 3,
        total_planned_effort: 30,
        total_planned_cost: 0,
      }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const preview = await buildMsProjectImportPreview({
    parsed,
    file: createFile(),
    conn,
    importConfirmPhrases: IMPORT_CONFIRM_PHRASES,
  });

  assert.equal(preview.importType, "ms_project_xml");
  assert.equal(preview.importMode, "replace_project");
  assert.equal(preview.projectName, "PROJETO XML");
  assert.deepEqual(preview.incoming, { projetos: 1, tarefas: 2, recursos: 2 });
  assert.equal(preview.impact.projectsToUpdate, 1);
  assert.equal(preview.impact.projectsToPreserve, 3);
  assert.equal(preview.impact.tasksToReplace, 18);
  assert.equal(preview.impact.dependenciesToReplace, 3);
  assert.equal(preview.impact.assignmentsToReplace, 6);
  assert.equal(preview.impact.resourcesToReuse, 1);
  assert.equal(preview.impact.resourcesToCreate, 1);
  assert.equal(preview.baselineImpact.hasOfficialBaseline, true);
  assert.equal(preview.baselineImpact.baselineId, 11);
  assert.equal(preview.baselineImpact.incomingTaskCount, 2);
  assert.equal(preview.baselineImpact.taskCountDelta, -1);
  assert.equal(preview.baselineImpact.incomingPlannedEffort, 24);
  assert.equal(preview.baselineImpact.plannedEffortDelta, -6);
  assert.equal(preview.requiredConfirmation, "SUBSTITUIR CRONOGRAMA");
});

test("MS Project preview reports new project creation", async () => {
  const parsed = parseMsProjectXml(buildSampleXml("NOVO XML"));
  const conn = createConn(async (sql, params) => {
    if (sql.includes("SELECT id FROM projetos WHERE projeto = ?")) return [[]];
    if (sql === "SELECT COUNT(*) AS total FROM projetos") return [[{ total: 4 }]];
    if (sql.includes("FROM task_assignments")) return [[{ total: 0 }]];
    if (sql.includes("FROM task_dependencies")) return [[{ total: 0 }]];
    if (sql.includes("FROM tarefas WHERE projeto_id = ? OR projeto = ?")) {
      assert.deepEqual(params, [0, "NOVO XML"]);
      return [[{ total: 0 }]];
    }
    if (sql.includes("SELECT nome FROM recursos WHERE nome IN")) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const preview = await buildMsProjectImportPreview({
    parsed,
    file: createFile("novo.xml"),
    conn,
    importConfirmPhrases: IMPORT_CONFIRM_PHRASES,
  });

  assert.equal(preview.projectName, "NOVO XML");
  assert.equal(preview.impact.projectsToCreate, 1);
  assert.equal(preview.impact.projectsToUpdate, 0);
  assert.equal(preview.impact.projectsToPreserve, 4);
  assert.equal(preview.impact.tasksToReplace, 0);
});

test("MS Project import remaps task ids to avoid global collisions", () => {
  const parsed = parseMsProjectXml(buildSampleXml("PROJETO XML"));
  const tasks = remapTasksForProjectImport(parsed.tasks, 77);

  assert.equal(tasks[0].id, "p77-1");
  assert.equal(tasks[1].id, "p77-2");
  assert.equal(tasks[1].parentId, "p77-1");
  assert.equal(tasks[1].predecessors[0].predecessorTaskId, "p77-1");
  assert.equal(tasks[1].externalId, "2");
  assert.equal(tasks[1].wbs, "1.1");
});
