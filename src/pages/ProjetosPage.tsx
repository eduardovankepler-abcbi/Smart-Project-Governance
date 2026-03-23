import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { useData, formatCurrency, getStatusColor } from "@/contexts/DataContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, FileSpreadsheet, Plus, Pencil, Trash2, ArrowUpDown, ChevronDown, ChevronRight, ListTree } from "lucide-react";
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

    return (
      <div key={task.id} className="space-y-2">
        <div
          className="rounded-xl border border-border/60 bg-background/40 px-3 py-3"
          style={{ marginLeft: `${task.depth * 18}px` }}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleTaskNode(task.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted"
                    title={isExpanded ? "Recolher subtarefas" : "Expandir subtarefas"}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-muted-foreground/60">
                    <ListTree size={13} />
                  </span>
                )}
                <Badge variant="outline" className="font-mono">{getTaskBusinessId(task) || "sem-id"}</Badge>
                <Badge variant="outline" className="font-mono">WBS {getTaskDisplayHierarchy(task)}</Badge>
                <StatusBadge status={task.status} />
                {hasChildren ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {task.children.length} subitem(ns)
                  </Badge>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground break-words">{task.tarefa}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">Responsáveis:</strong> {resourceNames.length ? resourceNames.join(", ") : "—"}</span>
                  <span><strong className="text-foreground">Prazo:</strong> {task.dataInicioPlanej || "—"} até {task.dataFimPlanej || "—"}</span>
                  <span><strong className="text-foreground">Conclusão:</strong> {task.percentual}%</span>
                </div>
              </div>
            </div>
            <div className="flex min-w-[180px] items-center gap-3 lg:justify-end">
              <div className="flex-1 lg:max-w-[180px]">
                <Progress value={task.percentual} className="h-2" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{task.percentual}%</span>
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
                  <div className="mt-5 space-y-3 rounded-2xl border border-border/70 bg-card/50 p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Drilldown do projeto</h4>
                        <p className="text-xs text-muted-foreground">Navegue pelas tarefas e subtarefas vinculadas a este projeto.</p>
                      </div>
                      <Badge variant="outline" className="w-fit">
                        {tarefas.filter((task) => task.projeto === p.projeto).length} item(ns)
                      </Badge>
                    </div>

                    {(taskTreesByProject.get(p.projeto) || []).length > 0 ? (
                      <div className="space-y-3">
                        {(taskTreesByProject.get(p.projeto) || []).map((task) => renderTaskNode(task))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                        Este projeto ainda não possui tarefas cadastradas para drilldown.
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {canWrite && <ProjetoDialog open={dialogOpen} onOpenChange={setDialogOpen} projeto={editProjeto} />}
      {canWrite && <ProjectTemplateDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} />}
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
