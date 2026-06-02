import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { useData } from "@/contexts/DataContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getProjectTasksByName, getTaskResourceLabel, getTaskResourceNames } from "@/utils/projectModel";
import { getTaskBusinessId, getTaskDisplayHierarchy, getTaskHierarchyDepth } from "@/utils/taskIdentity";
import { ChevronDown, ChevronRight, GitBranch, Layers3 } from "lucide-react";
import type { Tarefa } from "@/data/projectData";

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_COLORS: Record<string, string> = {
  "Atrasado": "bg-destructive",
  "Em andamento": "bg-warning",
  "Não iniciado": "bg-muted-foreground/40",
  "Congelado": "bg-info",
  "Concluído": "bg-success",
};

interface GanttRow {
  task: Tarefa;
  depth: number;
  hasChildren: boolean;
}

function getTaskSortCode(task: Tarefa): string {
  return getTaskDisplayHierarchy(task) || task.id;
}

function compareTaskOrder(a: Tarefa, b: Tarefa): number {
  const orderA = Number(a.sortOrder || 0);
  const orderB = Number(b.sortOrder || 0);
  if (orderA && orderB && orderA !== orderB) return orderA - orderB;
  return getTaskSortCode(a).localeCompare(getTaskSortCode(b), undefined, { numeric: true });
}

function isChildOf(candidate: Tarefa, parent: Tarefa): boolean {
  if (candidate.id === parent.id) return false;
  if (candidate.parentId && candidate.parentId === parent.id) return true;
  const childWbs = getTaskDisplayHierarchy(candidate);
  const parentWbs = getTaskDisplayHierarchy(parent);
  return Boolean(parentWbs && childWbs.startsWith(`${parentWbs}.`));
}

function hasChildren(task: Tarefa, tasks: Tarefa[]): boolean {
  return tasks.some((candidate) => isChildOf(candidate, task));
}

function matchesResource(task: Tarefa, resourceName: string): boolean {
  return resourceName === "all" || getTaskResourceNames(task).includes(resourceName);
}

function getTaskDepth(task: Tarefa): number {
  const explicitLevel = Number(task.outlineLevel || 0);
  const hierarchyLevel = getTaskHierarchyDepth(task);
  return Math.max(explicitLevel || hierarchyLevel, 1) - 1;
}

function buildGanttRows(tasks: Tarefa[], resourceFilter: string): GanttRow[] {
  const datedTasks = tasks.filter((task) => parseDate(task.dataInicioPlanej));
  const included = new Set<string>();

  datedTasks.forEach((task) => {
    const directMatch = matchesResource(task, resourceFilter);
    const descendantMatch = resourceFilter !== "all" && datedTasks.some((candidate) => isChildOf(candidate, task) && matchesResource(candidate, resourceFilter));
    if (directMatch || descendantMatch) included.add(task.id);
  });

  return datedTasks
    .filter((task) => included.has(task.id))
    .sort(compareTaskOrder)
    .map((task) => ({
      task,
      depth: getTaskDepth(task),
      hasChildren: hasChildren(task, datedTasks),
    }));
}

function isHiddenByCollapsed(row: GanttRow, rows: GanttRow[], collapsed: Set<string>): boolean {
  return rows.some((candidate) =>
    collapsed.has(candidate.task.id) &&
    isChildOf(row.task, candidate.task)
  );
}

export default function GanttPage() {
  const { projetos, tarefas, getUniqueProjetos, getUniqueResponsaveis } = useData();
  const [filterResponsavel, setFilterResponsavel] = useState<string>("all");
  const [filterProjeto, setFilterProjeto] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const responsaveis = useMemo(() => getUniqueResponsaveis(), [getUniqueResponsaveis]);
  const projetosUnicos = useMemo(() => getUniqueProjetos(), [getUniqueProjetos]);

  const ganttRows = useMemo(() => {
    const projectTasks = filterProjeto === "all" ? tarefas : getProjectTasksByName(tarefas, projetos, filterProjeto);
    return buildGanttRows(projectTasks, filterResponsavel);
  }, [projetos, tarefas, filterResponsavel, filterProjeto]);

  const visibleRows = useMemo(
    () => ganttRows.filter((row) => !isHiddenByCollapsed(row, ganttRows, collapsed)),
    [ganttRows, collapsed],
  );

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(ganttRows.filter((row) => row.hasChildren).map((row) => row.task.id)));
  const toggleRow = (taskId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const { minDate, maxDate, totalDays } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    ganttRows.forEach(({ task: t }) => {
      const start = parseDate(t.dataInicioPlanej);
      const end = parseDate(t.dataFimPlanej) || start;
      if (start) min = Math.min(min, start.getTime());
      if (end) max = Math.max(max, end.getTime());
    });
    if (!isFinite(min)) {
      const now = new Date();
      return { minDate: now, maxDate: new Date(now.getTime() + 30 * 86400000), totalDays: 30 };
    }
    const minD = new Date(min);
    const maxD = new Date(max);
    const total = Math.max(daysBetween(minD, maxD), 1);
    return { minDate: minD, maxDate: maxD, totalDays: total };
  }, [ganttRows]);

  const months = useMemo(() => {
    const result: { label: string; startPct: number; widthPct: number }[] = [];
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) {
      const monthStart = Math.max(0, daysBetween(minDate, cur));
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const monthEnd = Math.min(totalDays, daysBetween(minDate, nextMonth));
      result.push({
        label: cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        startPct: (monthStart / totalDays) * 100,
        widthPct: ((monthEnd - monthStart) / totalDays) * 100,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  }, [minDate, maxDate, totalDays]);

  return (
    <div className="flex flex-col">
      <Header title="Gantt" />
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="flex flex-wrap gap-3">
          <Select value={filterProjeto} onValueChange={setFilterProjeto}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Projetos</SelectItem>
              {projetosUnicos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Responsáveis</SelectItem>
              {responsaveis.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={expandAll} className="gap-1.5">
            <ChevronDown size={14} />
            Expandir
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="gap-1.5">
            <ChevronRight size={14} />
            Recolher
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch size={14} />
            {visibleRows.length} de {ganttRows.length} linha(s)
          </div>
        </div>

        <Card className="border border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className="relative h-8 bg-muted/50 border-b border-border flex">
                  <div className="w-48 shrink-0 px-3 flex items-center text-xs font-semibold text-muted-foreground border-r border-border">Projeto</div>
                  <div className="w-[380px] shrink-0 px-3 flex items-center text-xs font-semibold text-muted-foreground border-r border-border">Estrutura da tarefa</div>
                  <div className="flex-1 relative">
                    {months.map((m, i) => (
                      <div key={i} className="absolute top-0 h-full flex items-center justify-center text-[10px] font-medium text-muted-foreground border-r border-border/50" style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}>
                        {m.label}
                      </div>
                    ))}
                  </div>
                </div>

                {visibleRows.map(({ task: t, depth, hasChildren: rowHasChildren }) => {
                  const start = parseDate(t.dataInicioPlanej)!;
                  const end = parseDate(t.dataFimPlanej) || start;
                  const left = (daysBetween(minDate, start) / totalDays) * 100;
                  const width = Math.max((daysBetween(start, end) / totalDays) * 100, 0.5);
                  const barColor = STATUS_COLORS[t.status] || "bg-muted-foreground";
                  const isCollapsed = collapsed.has(t.id);
                  const isSummary = rowHasChildren || t.taskType === "summary";
                  const rowHeight = isSummary ? "h-10" : "h-9";

                  return (
                    <div key={t.id} className={`relative flex ${rowHeight} hover:bg-muted/30 transition-colors border-b border-border/30 group`}>
                      <div className="w-48 shrink-0 px-3 flex items-center text-xs border-r border-border/50 overflow-hidden">
                        <span className="truncate text-foreground">{t.projeto}</span>
                      </div>
                      <div className="w-[380px] shrink-0 px-3 flex items-center gap-2 text-xs border-r border-border/50 overflow-hidden">
                        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: `${Math.min(depth, 6) * 18}px` }}>
                          {rowHasChildren ? (
                            <button onClick={() => toggleRow(t.id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={isCollapsed ? "Expandir subtarefas" : "Recolher subtarefas"}>
                              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            </button>
                          ) : (
                            <span className="w-[18px]" />
                          )}
                          {rowHasChildren ? <Layers3 size={14} className="shrink-0 text-primary" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />}
                          <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground/70">{getTaskDisplayHierarchy(t) || getTaskBusinessId(t)}</span>
                          <span className={`${isSummary ? "font-semibold" : "font-medium"} truncate text-foreground`}>{t.tarefa}</span>
                        </div>
                      </div>
                      <div className="flex-1 relative">
                        <div
                          className={`absolute rounded-sm ${barColor} ${isSummary ? "top-3 h-3 opacity-70" : "top-2 h-5 opacity-80"} group-hover:opacity-100 transition-opacity`}
                          style={{ left: `${left}%`, width: `${width}%`, minWidth: isSummary ? "8px" : "4px" }}
                          title={`${getTaskDisplayHierarchy(t)} ${t.tarefa} | ${getTaskResourceLabel(t)} | ${t.status}`}
                        />
                        {isSummary ? (
                          <div
                            className="absolute top-[22px] h-px bg-foreground/30"
                            style={{ left: `${left}%`, width: `${width}%`, minWidth: "8px" }}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4 text-xs text-muted-foreground">
          {Object.entries(STATUS_COLORS).map(([status, cls]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} />
              {status}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
