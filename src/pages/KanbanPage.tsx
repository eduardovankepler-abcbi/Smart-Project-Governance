import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { useData } from "@/contexts/DataContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  DollarSign,
  GitBranch,
  Maximize2,
  MessageSquare,
  PauseCircle,
  TimerReset,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import type { Projeto, Tarefa } from "@/data/projectData";
import { getTaskBusinessId, getTaskDisplayHierarchy } from "@/utils/taskIdentity";
import { getTaskReleaseState, getTaskResourceNames, getTasksForProject } from "@/utils/projectModel";
import { formatKanbanFullDate, formatKanbanShortDate } from "@/utils/kanbanDates";

interface KanbanColumn {
  id: string;
  title: string;
  tone: string;
  icon: typeof Circle;
  tasks: Tarefa[];
}

function formatHours(value?: number) {
  return `${Number(value || 0).toFixed(1)}h`;
}

function formatCurrency(value?: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value || "—"}</div>
    </div>
  );
}

function TaskExpansionModal({
  task,
  allTasks,
  projects,
  open,
  onOpenChange,
}: {
  task: Tarefa | null;
  allTasks: Tarefa[];
  projects: Projeto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const release = task ? getTaskReleaseState(task, allTasks, projects) : null;
  const resources = task ? getTaskResourceNames(task) : [];
  const predecessorRows = task?.predecessors?.map((predecessor) => {
    const predecessorTask = allTasks.find((candidate) => candidate.id === predecessor.predecessorTaskId);
    return {
      predecessor,
      task: predecessorTask,
      label: predecessorTask
        ? `${getTaskDisplayHierarchy(predecessorTask)} ${predecessorTask.tarefa}`
        : predecessor.predecessorTaskId,
    };
  }) || [];

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[94vw] max-w-[1180px] flex-col gap-4 overflow-hidden border-border/90 bg-card p-6 shadow-2xl">
        <DialogHeader className="pr-8">
          <DialogDescription className="font-mono text-xs">
            {task.projeto} · ID {getTaskBusinessId(task) || task.id} · WBS {getTaskDisplayHierarchy(task)}
          </DialogDescription>
          <DialogTitle className="break-words text-2xl font-display leading-tight">{task.tarefa}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 space-y-4">
              <div className="rounded-xl border border-border/80 bg-background/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono">ID {getTaskBusinessId(task) || task.id}</Badge>
                    <Badge variant={task.status === "Atrasado" ? "destructive" : "secondary"}>{task.status}</Badge>
                    {task.milestone ? <Badge variant="outline">Marco</Badge> : null}
                    {task.taskType ? <Badge variant="outline">{task.taskType}</Badge> : null}
                  </div>
                  <div className="text-sm font-semibold text-foreground">{Math.round(Number(task.percentual || 0))}% concluído</div>
                </div>
                <Progress value={Number(task.percentual || 0)} className="mt-4 h-2.5" />
              </div>

              {release?.isBlocked ? (
                <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-destructive">
                  <div className="flex items-start gap-3">
                    <XCircle size={18} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Fluxo parado por predecessora pendente</p>
                      <p className="mt-1 text-sm leading-6">
                        {release.blockers.map((blocker) => blocker.label).join(", ")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : release?.status === "released" && task.status !== "Concluído" ? (
                <div className="rounded-xl border border-success/25 bg-success/10 p-4 text-success">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={18} />
                    <p className="font-semibold">Tarefa liberada pelas predecessoras.</p>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <DetailItem label="Início planejado" value={formatKanbanFullDate(task.dataInicioPlanej)} />
                <DetailItem label="Fim planejado" value={formatKanbanFullDate(task.dataFimPlanej)} />
                <DetailItem label="Duração" value={formatHours(task.durationMinutes ? task.durationMinutes / 60 : task.diasPlanejados * 8)} />
                <DetailItem label="Início real" value={formatKanbanFullDate(task.dataInicioReal)} />
                <DetailItem label="Fim real" value={formatKanbanFullDate(task.dataFimReal)} />
                <DetailItem label="Esforço real" value={formatHours(task.esforcoReal)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/80 bg-background/35 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Users size={16} />
                    Recursos
                  </div>
                  <div className="space-y-2">
                    {resources.length ? resources.map((name, index) => (
                      <div key={name} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-sm">
                        <ResourceAvatar name={name} index={index} />
                        <span className="break-words">{name}</span>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Nenhum recurso alocado.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-background/35 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <GitBranch size={16} />
                    Predecessoras
                  </div>
                  <div className="space-y-2">
                    {predecessorRows.length ? predecessorRows.map(({ predecessor, task: predecessorTask, label }) => (
                      <div key={`${predecessor.predecessorTaskId}-${predecessor.type}`} className="rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-sm">
                        <p className="break-words font-medium text-foreground">{label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tipo {predecessor.type || "FS"} · Lag {formatHours(Number(predecessor.lagMinutes || 0) / 60)}
                          {predecessorTask ? ` · ${predecessorTask.status} · ${Math.round(Number(predecessorTask.percentual || 0))}%` : " · não encontrada"}
                        </p>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Sem predecessoras registradas.</p>}
                  </div>
                </div>
              </div>

              {task.notes ? (
                <div className="rounded-xl border border-border/80 bg-background/35 p-4">
                  <p className="mb-2 text-sm font-semibold text-foreground">Notas</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{task.notes}</p>
                </div>
              ) : null}
            </section>

            <aside className="space-y-4">
              <div className="rounded-xl border border-border/80 bg-background/35 p-4">
                <p className="mb-3 text-sm font-semibold text-foreground">Resumo operacional</p>
                <div className="grid gap-3">
                  <DetailItem label="Responsável" value={task.responsavel || "Não informado"} />
                  <DetailItem label="Função" value={task.funcao || "Não informado"} />
                  <DetailItem label="Esforço planejado" value={formatHours(task.esforcoPlanej)} />
                  <DetailItem label="Esforço restante" value={formatHours(Math.max(Number(task.esforcoPlanej || 0) - Number(task.esforcoReal || 0), 0))} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border border-border/80 bg-background/35 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <DollarSign size={16} />
                    Custo
                  </div>
                  <p className="text-2xl font-display font-bold">{formatCurrency(task.valorPrevisto)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Gasto: {formatCurrency(task.valorGasto)}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-background/35 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <TimerReset size={16} />
                    Identificação
                  </div>
                  <p className="break-all text-sm font-mono text-foreground">{task.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Nível {task.outlineLevel || "—"} · Ordem {task.sortOrder || "—"}</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskCard({ task, allTasks, projects, onExpand }: { task: Tarefa; allTasks: Tarefa[]; projects: Projeto[]; onExpand: (task: Tarefa) => void }) {
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
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1 -mt-1 h-7 w-7 shrink-0"
          title="Expandir tarefa"
          onClick={() => onExpand(task)}
        >
          <Maximize2 size={13} />
        </Button>
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
          {formatKanbanShortDate(task.dataFimPlanej)}
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

function KanbanBoard({
  columns,
  allTasks,
  projects,
  onExpandTask,
  expanded = false,
}: {
  columns: KanbanColumn[];
  allTasks: Tarefa[];
  projects: Projeto[];
  onExpandTask: (task: Tarefa) => void;
  expanded?: boolean;
}) {
  const boardWrapperClass = expanded ? "h-full min-h-0 overflow-x-auto overflow-y-hidden" : "overflow-x-auto pb-2";
  const boardGridClass = expanded
    ? "grid h-full min-w-[1180px] grid-cols-[repeat(6,minmax(0,1fr))] gap-2 xl:min-w-0"
    : "grid min-w-[1320px] grid-cols-6 gap-3";
  const columnClass = expanded
    ? "min-h-0"
    : "max-h-[calc(100vh-230px)] min-h-[540px]";

  return (
    <div className={boardWrapperClass}>
      <div className={boardGridClass}>
        {columns.map((column) => {
          const Icon = column.icon;
          return (
            <section
              key={column.id}
              className={`flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 ${columnClass}`}
            >
              <div className={`flex items-center justify-between gap-2 border-b border-border ${expanded ? "px-3 py-2.5" : "px-3 py-3"}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} />
                  <h3 className="truncate text-sm font-semibold uppercase tracking-wide text-foreground">{column.title}</h3>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Icon size={14} />
                  <span>{column.tasks.length}</span>
                </div>
              </div>
              <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${expanded ? "p-2.5" : "p-3"}`}>
                {column.tasks.map((task) => (
                  <TaskCard key={task.id} task={task} allTasks={allTasks} projects={projects} onExpand={onExpandTask} />
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
  );
}

function BoardExpansionModal({
  open,
  onOpenChange,
  project,
  columns,
  allTasks,
  projects,
  resourceNames,
  blockedCount,
  onExpandTask,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Projeto;
  columns: KanbanColumn[];
  allTasks: Tarefa[];
  projects: Projeto[];
  resourceNames: string[];
  blockedCount: number;
  onExpandTask: (task: Tarefa) => void;
}) {
  const taskCount = columns.reduce((total, column) => total + column.tasks.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-12px)] max-h-[calc(100dvh-12px)] w-[calc(100vw-12px)] max-w-none flex-col gap-3 overflow-hidden border-border/90 bg-background p-4 shadow-2xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogDescription className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Quadro expandido
          </DialogDescription>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="break-words text-xl font-display leading-tight xl:text-2xl">
                {project?.projeto || "Selecione um projeto"}
              </DialogTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant={blockedCount > 0 ? "destructive" : "secondary"}>{blockedCount} bloqueada(s)</Badge>
                <Badge variant="outline">{taskCount} tarefa(s)</Badge>
                <Badge variant="outline">{columns.length} coluna(s)</Badge>
              </div>
            </div>
            <div className="flex -space-x-2 pr-6">
              {resourceNames.map((name, index) => <ResourceAvatar key={name} name={name} index={index} />)}
              {resourceNames.length === 0 ? <span className="text-xs text-muted-foreground">Sem recursos alocados</span> : null}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <KanbanBoard
            columns={columns}
            allTasks={allTasks}
            projects={projects}
            onExpandTask={onExpandTask}
            expanded
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function KanbanPage() {
  const { projetos, tarefas, getUniqueProjetos } = useData();
  const projectNames = useMemo(() => getUniqueProjetos(), [getUniqueProjetos]);
  const [selectedProjectName, setSelectedProjectName] = useState(projectNames[0] || "");
  const [expandedTask, setExpandedTask] = useState<Tarefa | null>(null);
  const [boardExpanded, setBoardExpanded] = useState(false);

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
            <Button variant="outline" className="gap-2" onClick={() => setBoardExpanded(true)}>
              <Maximize2 size={15} />
              Expandir quadro
            </Button>
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

        <KanbanBoard columns={columns} allTasks={tarefas} projects={projetos} onExpandTask={setExpandedTask} />
      </div>
      <BoardExpansionModal
        open={boardExpanded}
        onOpenChange={setBoardExpanded}
        project={selectedProject}
        columns={columns}
        allTasks={tarefas}
        projects={projetos}
        resourceNames={resourceNames}
        blockedCount={blockedCount}
        onExpandTask={setExpandedTask}
      />
      <TaskExpansionModal
        task={expandedTask}
        allTasks={tarefas}
        projects={projetos}
        open={!!expandedTask}
        onOpenChange={(open) => !open && setExpandedTask(null)}
      />
    </div>
  );
}
