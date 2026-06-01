import { describe, expect, it } from "vitest";
import { getProjectFlowBlockers, getTaskReleaseState, getTasksForProject, isTaskLinkedToProject } from "@/utils/projectModel";
import type { Projeto, Tarefa } from "@/data/projectData";

const baseProject: Projeto = {
  id: 10,
  projeto: "Projeto Atual",
  descricao: "",
  prioridade: "2- Média",
  responsavel: "",
  ftes: 0,
  valorPrevisto: 0,
  orcamentoAprovado: 0,
  valorGasto: 0,
  dataInicioPlanej: "",
  dataFimPlanej: "",
  dataInicio: "",
  dataFimReal: "",
  totalTarefas: 0,
  tarefasConcluidas: 0,
  tarefasAndamento: 0,
  tarefasAtrasadas: 0,
  tarefasNaoIniciadas: 0,
  status: "Não iniciado",
  conclusao: 0,
};

function task(partial: Partial<Tarefa>): Tarefa {
  return {
    id: "task-1",
    parentId: "",
    projeto: "Projeto Atual",
    tarefa: "Tarefa",
    subtarefa: "",
    responsavel: "",
    funcao: "",
    dataInicioPlanej: "",
    esforcoPlanej: 0,
    dataFimPlanej: "",
    dataInicioReal: "",
    esforcoReal: 0,
    dataFimReal: "",
    percentual: 0,
    status: "Não iniciado",
    valorPrevisto: 0,
    valorGasto: 0,
    diasPlanejados: 0,
    diasReal: 0,
    diasCompletados: 0,
    ...partial,
  };
}

describe("projectModel task/project linkage", () => {
  it("prefers numeric project id over legacy project name", () => {
    expect(isTaskLinkedToProject(task({ projectId: 10, projeto: "Nome antigo" }), baseProject)).toBe(true);
    expect(isTaskLinkedToProject(task({ projectId: 99, projeto: "Projeto Atual" }), baseProject)).toBe(false);
  });

  it("falls back to project name for legacy tasks without project id", () => {
    const tasks = [
      task({ id: "a", projeto: "Projeto Atual" }),
      task({ id: "b", projeto: "Outro Projeto" }),
      task({ id: "c", projectId: 10, projeto: "Nome antigo" }),
    ];

    expect(getTasksForProject(tasks, baseProject).map((item) => item.id)).toEqual(["a", "c"]);
  });
});

describe("projectModel dependency release state", () => {
  it("marks tasks without predecessors and tasks with completed predecessors as released", () => {
    const tasks = [
      task({ id: "p-1", externalId: "2.1", wbs: "2.1", tarefa: "Preparar base", status: "Concluído", percentual: 100 }),
      task({
        id: "p-2",
        externalId: "2.2",
        wbs: "2.2",
        tarefa: "Executar etapa",
        predecessors: [{ predecessorTaskId: "p-1", type: "FS", lagMinutes: 0 }],
      }),
    ];

    expect(getTaskReleaseState(tasks[0], tasks, [baseProject])).toMatchObject({
      status: "no_predecessors",
      isReleased: true,
      isBlocked: false,
    });
    expect(getTaskReleaseState(tasks[1], tasks, [baseProject])).toMatchObject({
      status: "released",
      isReleased: true,
      isBlocked: false,
      predecessorCount: 1,
    });
  });

  it("reports the predecessor keeping a task blocked", () => {
    const tasks = [
      task({ id: "p-1", externalId: "2.1", wbs: "2.1", tarefa: "Validar requisitos", status: "Em andamento", percentual: 80 }),
      task({
        id: "p-2",
        externalId: "2.2",
        wbs: "2.2",
        sortOrder: 2,
        tarefa: "Iniciar desenvolvimento",
        predecessors: [{ predecessorTaskId: "2.1", type: "FS", lagMinutes: 0 }],
      }),
    ];

    const releaseState = getTaskReleaseState(tasks[1], tasks, [baseProject]);

    expect(releaseState).toMatchObject({
      status: "blocked",
      isReleased: false,
      isBlocked: true,
      predecessorCount: 1,
    });
    expect(releaseState.blockers[0]).toMatchObject({
      predecessorTaskId: "2.1",
      dependencyType: "FS",
      status: "Em andamento",
      missing: false,
    });
    expect(releaseState.blockers[0].label).toContain("Validar requisitos");
    expect(getProjectFlowBlockers(tasks, baseProject, [baseProject]).map((item) => item.task.id)).toEqual(["p-2"]);
  });

  it("treats missing predecessors as blockers", () => {
    const blocked = task({
      id: "p-3",
      externalId: "2.3",
      wbs: "2.3",
      tarefa: "Homologar",
      predecessors: [{ predecessorTaskId: "2.99", type: "FS", lagMinutes: 0 }],
    });

    const releaseState = getTaskReleaseState(blocked, [blocked], [baseProject]);

    expect(releaseState.status).toBe("blocked");
    expect(releaseState.blockers[0]).toMatchObject({
      predecessorTaskId: "2.99",
      status: "Não encontrada",
      missing: true,
    });
  });
});
