import { describe, expect, it } from "vitest";
import { getTasksForProject, isTaskLinkedToProject } from "@/utils/projectModel";
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
