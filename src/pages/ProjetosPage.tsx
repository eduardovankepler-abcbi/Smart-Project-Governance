import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { useData, formatCurrency, getStatusColor } from "@/contexts/DataContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, FileSpreadsheet, Plus, Pencil, Trash2, ArrowUpDown, ChevronDown, ChevronRight, ListTree, Maximize2 } from "lucide-react";
import { exportToPdf, exportToExcel } from "@/utils/exportUtils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import ProjetoDialog from "@/components/ProjetoDialog";
import ProjectTemplateDialog from "@/components/ProjectTemplateDialog";
import DeleteDialog from "@/components/DeleteDialog";
import type { Projeto, Tarefa } from "@/data/projectData";
import { getTaskBusinessId, getTaskDisplayHierarchy } from "@/utils/taskIdentity";
import { getTaskResourceNames } from "@/utils/projectModel";

function StatusBadge({ status }: { status: string }) {
  const color = getStatusColor(status);
  const map: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    success: "bg-success/10 text-success border-success/20",
    secondary: "bg-secondary text-secondary-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[color] || map.secondary}`}>
      {status}
    </span>
  );
}

const STATUS_OPTIONS = ["Atrasado", "Em andamento", "Não iniciado", "Concluído"];
type SortKey = "projeto" | "status" | "dataFimPlanej" | "conclusao";

interface ProjectTaskNode extends Tarefa {
  children: ProjectTaskNode[];
  depth: number;
}

function parseHierarchy(value?: string) {
  return String(value || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function compareTaskHierarchy(a: Tarefa, b: Tarefa) {
  const aParts = parseHierarchy(getTaskDisplayHierarchy(a));
  const bParts = parseHierarchy(getTaskDisplayHierarchy(b));
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const aValue = aParts[index] ?? -1;
    const bValue = bParts[index] ?? -1;
    if (aValue !== bValue) return aValue - bValue;
  }
  return String(a.tarefa || "").localeCompare(String(b.tarefa || ""));
}

function buildProjectTaskTree(projectTasks: Tarefa[]): ProjectTaskNode[] {
  const sorted = [...projectTasks].sort(compareTaskHierarchy);
  const map = new Map<string, ProjectTaskNode>();
  const roots: ProjectTaskNode[] = [];

  sorted.forEach((task) => {
    map.set(task.id, { ...task, children: [], depth: 0 });
  });

  sorted.forEach((task) => {
    const node = map.get(task.id)!;
    if (task.parentId && map.has(task.parentId)) {
      const parent = map.get(task.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export default function ProjetosPage() {
  const { projetos, tarefas, setProjetos, refreshProjetos } = useData();
  const { canWrite, user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("projeto");
  const [sortAsc, setSortAsc] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editProjeto, setEditProjeto] = useState<Projeto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Projeto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [modalProjectId, setModalProjectId] = useState<number | null>(null);

  const taskTreesByProject = useMemo(() => {
    const grouped = new Map<string, ProjectTaskNode[]>();
    projetos.forEach((project) => {
      const projectTasks = tarefas.filter((task) => task.projeto === project.projeto);
      grouped.set(project.projeto, buildProjectTaskTree(projectTasks));
    });
    return grouped;
  }, [projetos, tarefas]);

  const filtered = useMemo(() => {
    let result = projetos.filter(p => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (
        search &&
        !p.projeto.toLowerCase().includes(search.toLowerCase()) &&
        !p.descricao.toLowerCase().includes(search.toLowerCase()) &&
        !(p.produtoName || "").toLowerCase().includes(search.toLowerCase())
      ) return false;
      return true;
    });
    result.sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy];
      if (typeof av === "string" && typeof bv === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (Number(av) - Number(bv)) : (Number(bv) - Number(av));
    });
    return result;
  }, [projetos, filterStatus, search, sortBy, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(true); }
  };

  const toggleProjectDrilldown = (projectId: number) => {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const toggleTaskNode = (taskId: string) => {
    setExpandedTasks((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const collectExpandableTaskIds = (nodes: ProjectTaskNode[]): string[] => {
    const ids: string[] = [];
    const visit = (items: ProjectTaskNode[]) => {
      items.forEach((item) => {
        if (item.children.length > 0) {
          ids.push(item.id);
          visit(item.children);
        }
      });
    };
    visit(nodes);
    return ids;
  };

  const expandAllProjectTasks = (projectName: string) => {
    const tree = taskTreesByProject.get(projectName) || [];
    const ids = collectExpandableTaskIds(tree);
    setExpandedTasks((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const collapseAllProjectTasks = (projectName: string) => {
    const tree = taskTreesByProject.get(projectName) || [];
    const ids = new Set(collectExpandableTaskIds(tree));
    setExpandedTasks((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const openProjectModal = (projectId: number, projectName: string) => {
    expandAllProjectTasks(projectName);
    setModalProjectId(projectId);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (isApiEnabled()) {
        await api.deleteProjeto(deleteTarget.id);
        await refreshProjetos();
      } else {
        setProjetos(projetos.filter(p => p.id !== deleteTarget.id));
      }
      toast({ title: "Projeto excluído" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleExportPdf = () => {
    const headers = ["ID do Projeto", "Unidade de Negócio", "Produto", "Projeto", "Responsável", "Prioridade", "Status", "Início Prev.", "Fim Prev.", "Conclusão", "Valor Previsto", "Valor Gasto"];
    const rows = filtered.map(p => [p.projectId || "", p.businessUnitName || "", p.produtoName || "", p.projeto, p.responsavel, p.prioridade, p.status, p.dataInicioPlanej, p.dataFimPlanej, `${p.conclusao}%`, formatCurrency(p.valorPrevisto), formatCurrency(p.valorGasto)]);
    exportToPdf("Relatório de Projetos", headers, rows, "projetos");
  };

  const handleExportExcel = () => {
    const headers = ["ID do Projeto", "Unidade de Negócio", "Produto", "Projeto", "Responsável", "Prioridade", "Status", "Início Previsto", "Fim Previsto", "Conclusão %", "Valor Previsto", "Valor Gasto"];
    const rows = filtered.map(p => [p.projectId || "", p.businessUnitName || "", p.produtoName || "", p.projeto, p.responsavel, p.prioridade, p.status, p.dataInicioPlanej, p.dataFimPlanej, p.conclusao, p.valorPrevisto, p.valorGasto]);
    exportToExcel(headers, rows, "projetos", "Projetos");
  };

  const renderTaskNode = (task: ProjectTaskNode): JSX.Element => {
    const hasChildren = task.children.length > 0;
    const isExpanded = expandedTasks.has(task.id);
    const resourceNames = getTaskResourceNames(task);
    const hierarchy = getTaskDisplayHierarchy(task);
    const isSummary = hasChildren;

    return (
      <div key={task.id} className="space-y-2">
        <div
          className={`rounded-xl border px-3 py-3 ${isSummary ? "border-primary/20 bg-primary/5" : "border-border/60 bg-background/40"}`}
        >
          <div className="grid gap-3 lg:grid-cols-[92px_72px_108px_minmax(0,1fr)_220px] lg:items-start">
            <div className="text-xs font-mono font-semibold text-foreground">
              {getTaskBusinessId(task) || "—"}
              <div className="mt-1 text-[10px] text-muted-foreground">EDT {hierarchy || "—"}</div>
            </div>
            <div className="text-xs font-semibold text-foreground">{task.percentual}%</div>
            <div className="text-xs">
              <StatusBadge status={task.status} />
            </div>
            <div className="min-w-0">
              <div className="flex items-start gap-2" style={{ paddingLeft: `${task.depth * 18}px` }}>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleTaskNode(task.id)}
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted"
                    title={isExpanded ? "Recolher subtarefas" : "Expandir subtarefas"}
                  >
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                ) : (
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground/[0.45]">
                    <ListTree size={11} />
                  </span>
                )}
                <div className="min-w-0">
                  <p className={`break-words text-sm ${isSummary ? "font-semibold uppercase tracking-[0.02em] text-foreground" : "font-medium text-foreground"}`}>
                    {task.tarefa}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{task.dataInicioPlanej || "—"} → {task.dataFimPlanej || "—"}</span>
                    {hasChildren ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {task.children.length} subitem(ns)
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">Responsáveis:</strong> {resourceNames.length ? resourceNames.join(", ") : "—"}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Progress value={task.percentual} className="h-2" />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">{task.percentual}%</span>
              </div>
            </div>
          </div>
        </div>

        {hasChildren && isExpanded ? (
          <div className="space-y-2">
            {task.children.map((child) => renderTaskNode(child))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderProjectDrilldown = (project: Projeto, mode: "inline" | "modal" = "inline") => {
    const tree = taskTreesByProject.get(project.projeto) || [];
    const totalItems = tarefas.filter((task) => task.projeto === project.projeto).length;

    return (
      <div className={`space-y-3 rounded-2xl border border-border/70 bg-card/50 ${mode === "modal" ? "p-5" : "p-4"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Drilldown do projeto</h4>
            <p className="text-xs text-muted-foreground">Estrutura hierárquica em todos os níveis, enquanto houver subtarefas.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit">
              {totalItems} item(ns)
            </Badge>
            <Button variant="outline" size="sm" onClick={() => expandAllProjectTasks(project.projeto)}>
              Expandir tudo
            </Button>
            <Button variant="outline" size="sm" onClick={() => collapseAllProjectTasks(project.projeto)}>
              Recolher
            </Button>
            {mode === "inline" ? (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="Expandir drilldown em modal"
                onClick={() => openProjectModal(project.id, project.projeto)}
              >
                <Maximize2 size={14} />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-border/60 bg-background/[0.35] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:grid-cols-[92px_72px_108px_minmax(0,1fr)_220px]">
          <span>EDT</span>
          <span>%</span>
          <span>Status</span>
          <span>Nome da tarefa</span>
          <span>Responsáveis</span>
        </div>

        {tree.length > 0 ? (
          <div className="space-y-2">
            {tree.map((task) => renderTaskNode(task))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
            Este projeto ainda não possui tarefas cadastradas para drilldown.
          </div>
        )}
      </div>
    );
  };

  const modalProject = filtered.find((project) => project.id === modalProjectId) || projetos.find((project) => project.id === modalProjectId) || null;

  return (
    <div className="flex flex-col">
      <Header title="Projetos" />
      <div className="p-6 animate-fade-in space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card/70 shadow-sm">
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Buscar projeto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="min-w-[240px] flex-1 xl:max-w-[320px]"
              />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => toggleSort("projeto")} className="min-w-[110px] gap-1.5 justify-center">
                <ArrowUpDown size={14} /> Nome
              </Button>
              <Button variant="outline" size="sm" onClick={() => toggleSort("dataFimPlanej")} className="min-w-[110px] gap-1.5 justify-center">
                <ArrowUpDown size={14} /> Prazo
              </Button>
              <Button variant="outline" size="sm" onClick={() => toggleSort("conclusao")} className="min-w-[126px] gap-1.5 justify-center">
                <ArrowUpDown size={14} /> Conclusão
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              {canWrite && (
                <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)} className="min-w-[124px] gap-1.5 justify-center">
                  Templates
                </Button>
              )}
              {canWrite && user?.role === "admin" && (
                <Button size="sm" onClick={() => { setEditProjeto(null); setDialogOpen(true); }} className="min-w-[168px] gap-1.5 justify-center">
                  <Plus size={14} /> Novo Projeto
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExportPdf} className="min-w-[92px] gap-1.5 justify-center">
                <FileDown size={14} /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="min-w-[96px] gap-1.5 justify-center">
                <FileSpreadsheet size={14} /> Excel
              </Button>
            </div>
          </div>

          <div className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            {filtered.length} projeto(s) encontrado(s)
          </div>
        </div>

        <div className="grid gap-4">
          {filtered.map(p => (
            <Card key={p.id} className="border border-border hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-display font-bold text-foreground">{p.projeto}</h3>
                      <Badge variant="outline" className="text-xs font-mono">{p.projectId || "sem-id"}</Badge>
                      <Badge variant="outline" className="text-xs">{p.businessUnitName || "Sem BU"}</Badge>
                      {p.produtoName ? <Badge variant="outline" className="text-xs">{p.produtoName}</Badge> : null}
                      <StatusBadge status={p.status} />
                      <Badge variant="outline" className="text-xs">{p.prioridade}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{p.descricao}</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span><strong className="text-foreground">Responsável:</strong> {p.responsavel}</span>
                      <span><strong className="text-foreground">Produto:</strong> {p.produtoName || "—"}</span>
                      <span><strong className="text-foreground">FTEs previstos:</strong> {p.ftes}</span>
                      <span><strong className="text-foreground">Início Previsto:</strong> {p.dataInicioPlanej || "—"}</span>
                      <span><strong className="text-foreground">Fim Previsto:</strong> {p.dataFimPlanej || "—"}</span>
                      <span><strong className="text-foreground">Início Real:</strong> {p.dataInicio || "—"}</span>
                      <span><strong className="text-foreground">Fim Real:</strong> {p.dataFimReal || "—"}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="flex flex-wrap gap-4 lg:gap-6 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-display font-bold text-foreground">{p.totalTarefas}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Atrasadas</p>
                        <p className="text-lg font-display font-bold text-destructive">{p.tarefasAtrasadas}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Andamento</p>
                        <p className="text-lg font-display font-bold text-warning">{p.tarefasAndamento}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Concluídas</p>
                        <p className="text-lg font-display font-bold text-success">{p.tarefasConcluidas}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-2 gap-1.5"
                      onClick={() => toggleProjectDrilldown(p.id)}
                    >
                      {expandedProjects.has(p.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Estrutura
                    </Button>
                    {canWrite && (
                      <div className="flex flex-col gap-1 ml-4">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditProjeto(p); setDialogOpen(true); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(p)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex gap-6 text-sm">
                    <span className="text-muted-foreground">Previsto: <strong className="text-foreground">{formatCurrency(p.valorPrevisto)}</strong></span>
                    <span className="text-muted-foreground">Gasto: <strong className="text-foreground">{formatCurrency(p.valorGasto)}</strong></span>
                  </div>
                  <div className="flex-1 flex items-center gap-3">
                    <Progress value={p.conclusao} className="h-2 flex-1" />
                    <span className="text-xs font-medium text-muted-foreground">{p.conclusao}%</span>
                  </div>
                </div>

                {expandedProjects.has(p.id) ? (
                  <div className="mt-5">
                    {renderProjectDrilldown(p)}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {canWrite && <ProjetoDialog open={dialogOpen} onOpenChange={setDialogOpen} projeto={editProjeto} />}
      {canWrite && <ProjectTemplateDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} />}
      <Dialog open={!!modalProject} onOpenChange={(open) => !open && setModalProjectId(null)}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] w-[95vw] max-w-[95vw] flex-col gap-4 overflow-hidden border-border/90 bg-card p-6 shadow-2xl">
          {modalProject ? (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle>{modalProject.projeto} · Drilldown hierárquico</DialogTitle>
                <DialogDescription>
                  Visualização ampliada da estrutura do projeto, com expansão em todos os níveis de tarefas e subtarefas.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                {renderProjectDrilldown(modalProject, "modal")}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title="Excluir Projeto"
        description={`Tem certeza que deseja excluir o projeto "${deleteTarget?.projeto}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
