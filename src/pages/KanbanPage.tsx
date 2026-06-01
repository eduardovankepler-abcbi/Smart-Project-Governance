import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { useData } from "@/contexts/DataContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CheckCircle2, Circle, Clock3, MessageSquare, PauseCircle, UserRound, XCircle } from "lucide-react";
import type { Projeto, Tarefa } from "@/data/projectData";
import { getTaskBusinessId, getTaskDisplayHierarchy } from "@/utils/taskIdentity";
import { getTaskReleaseState, getTaskResourceNames, getTasksForProject } from "@/utils/projectModel";

interface KanbanColumn {
  id: string;
  title: string;
  tone: string;
  icon: typeof Circle;
  tasks: Tarefa[];
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parts = value.includes("/") ? value.split("/") : [];
  if (parts.length === 3) {
    const month = Number(parts[0]) - 1;
    const day = Number(parts[1]);
    let year = Number(parts[2]);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value?: string) {
  const date = parseDate(value);
  if (!date) return "Sem prazo";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function isTestingTask(task: Tarefa) {
  const text = `${task.tarefa} ${task.subtarefa}`.toLowerCase();
  return text.includes("teste") || text.includes("homolog") || text.includes("uat");
}

function sortTasks(tasks: Tarefa[]) {
  return tasks.slice().sort((a, b) => {
    const orderA = Number(a.sortOrder || 0);
    const orderB = Number(b.sortOrder || 0);
    if (orderA !== orderB) return orderA - orderB;
    return getTaskDisplayHierarchy(a).localeCompare(getTaskDisplayHierarchy(b), undefined, { numeric: true });
  });
}

function buildColumns(projectTasks: Tarefa[], allTasks: Tarefa[], projects: Projeto[]): KanbanColumn[] {
  const columns: KanbanColumn[] = [
    { id: "backlog", title: "Backlog", tone: "bg-muted-foreground", icon: Circle, tasks: [] },
    { id: "blocked", title: "Bloqueado", tone: "bg-destructive", icon: XCircle, tasks: [] },
    { id: "progress", title: "Em andamento", tone: "bg-warning", icon: Clock3, tasks: [] },
    { id: "freeze", title: "Freeze", tone: "bg-info", icon: PauseCircle, tasks: [] },
    { id: "test", title: "Teste", tone: "bg-violet-500", icon: MessageSquare, tasks: [] },
    { id: "done", title: "Concluído", tone: "bg-success", icon: CheckCircle2, tasks: [] },
  ];
  const byId = new Map(columns.map((column) => [column.id, column]));

  projectTasks.forEach((task) => {
    const release = getTaskReleaseState(task, allTasks, projects);
    if (task.status === "Concluído" || Number(task.percentual || 0) >= 100) byId.get("done")?.tasks.push(task);
    else if (task.status === "Congelado") byId.get("freeze")?.tasks.push(task);
    else if (release.isBlocked) byId.get("blocked")?.tasks.push(task);
    else if (isTestingTask(task)) byId.get("test")?.tasks.push(task);
    else if (task.status === "Em andamento" || task.status === "Atrasado" || Number(task.percentual || 0) > 0) byId.get("progress")?.tasks.push(task);
    else byId.get("backlog")?.tasks.push(task);
  });

  return columns.map((column) => ({ ...column, tasks: sortTasks(column.tasks) }));
}

function ResourceAvatar({ name, index }: { name: string; index: number }) {
  const colors = ["bg-blue-600", "bg-emerald-600", "bg-slate-600", "bg-orange-500", "bg-violet-600", "bg-rose-600"];
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-background text-[11px] font-bold text-white shadow-sm ${colors[index % colors.length]}`}
      title={name}
    >
      {getInitials(name)}
    </span>
  );
}

function TaskCard({ task, allTasks, projects }: { task: Tarefa; allTasks: Tarefa[]; projects: Projeto[] }) {
  const release = getTaskReleaseState(task, allTasks, projects);
  const resources = getTaskResourceNames(task);
  const blocker = release.blockers[0];
  const isLate = task.status === "Atrasado";

  return (
    <div className="rounded-lg border border-border bg-card/95 p-3 shadow-sm">
      <div className={`mb-2 h-1.5 w-11 rounded-full ${isLate ? "bg-destructive" : task.status === "Congelado" ? "bg-info" : task.status === "Concluído" ? "bg-success" : "bg-primary"}`} />
      <div className="flex items-start gap-2">
        {task.status === "Concluído" ? <CheckCircle2 size={16} className="mt-0.5 text-success" /> : <Circle size={16} className="mt-0.5 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-5 text-foreground">
            {getTaskDisplayHierarchy(task)} {task.tarefa}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-[10px]">ID {getTaskBusinessId(task) || task.id}</Badge>
            <Badge variant={isLate ? "destructive" : "secondary"} className="text-[10px]">{task.status}</Badge>
          </div>
        </div>
      </div>

      {release.isBlocked ? (
        <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
          Parada por {blocker?.label || "predecessora pendente"}
          {release.blockers.length > 1 ? ` +${release.blockers.length - 1}` : ""}
        </div>
      ) : release.status === "released" && task.status !== "Concluído" ? (
        <div className="mt-3 rounded-md border border-success/25 bg-success/10 px-2 py-1.5 text-[11px] text-success">
          Liberada pelas predecessoras
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock size={12} />
          {formatShortDate(task.dataFimPlanej)}
        </span>
        <span>{Math.round(Number(task.percentual || 0))}%</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex -space-x-2">
          {resources.slice(0, 4).map((name, index) => <ResourceAvatar key={name} name={name} index={index} />)}
          {resources.length > 4 ? <span className="flex h-8 min-w-8 items-center justify-center rounded-full border border-background bg-muted px-2 text-[11px] font-semibold text-muted-foreground">+{resources.length - 4}</span> : null}
          {!resources.length ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground" title="Sem recurso">
              <UserRound size={14} />
            </span>
          ) : null}
        </div>
        <span className="text-[11px] text-muted-foreground">{Number(task.esforcoPlanej || 0).toFixed(1)}h</span>
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { projetos, tarefas, getUniqueProjetos } = useData();
  const projectNames = useMemo(() => getUniqueProjetos(), [getUniqueProjetos]);
  const [selectedProjectName, setSelectedProjectName] = useState(projectNames[0] || "");

  const selectedProject = useMemo(
    () => projetos.find((project) => project.projeto === selectedProjectName) || projetos[0],
    [projetos, selectedProjectName],
  );

  const projectTasks = useMemo(
    () => selectedProject ? getTasksForProject(tarefas, selectedProject) : [],
    [tarefas, selectedProject],
  );

  const columns = useMemo(() => buildColumns(projectTasks, tarefas, projetos), [projectTasks, tarefas, projetos]);
  const resourceNames = useMemo(() => Array.from(new Set(projectTasks.flatMap(getTaskResourceNames))).slice(0, 8), [projectTasks]);
  const blockedCount = columns.find((column) => column.id === "blocked")?.tasks.length || 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="Quadro" />
      <div className="space-y-5 p-5 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Kanban operacional</p>
            <h2 className="mt-1 break-words text-2xl font-display font-bold text-foreground">
              {selectedProject?.projeto || "Selecione um projeto"}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant={blockedCount > 0 ? "destructive" : "secondary"}>{blockedCount} bloqueada(s)</Badge>
              <Badge variant="outline">{projectTasks.length} tarefa(s)</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex -space-x-2">
              {resourceNames.map((name, index) => <ResourceAvatar key={name} name={name} index={index} />)}
              {resourceNames.length === 0 ? <span className="text-xs text-muted-foreground">Sem recursos alocados</span> : null}
            </div>
            <Select value={selectedProject?.projeto || ""} onValueChange={setSelectedProjectName}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                {projectNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1320px] grid-cols-6 gap-3">
            {columns.map((column) => {
              const Icon = column.icon;
              return (
                <section key={column.id} className="flex max-h-[calc(100vh-230px)] min-h-[540px] flex-col rounded-lg border border-border bg-muted/30">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{column.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon size={14} />
                      <span>{column.tasks.length}</span>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    {column.tasks.map((task) => (
                      <TaskCard key={task.id} task={task} allTasks={tarefas} projects={projetos} />
                    ))}
                    {column.tasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        Nenhuma tarefa nesta coluna.
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
