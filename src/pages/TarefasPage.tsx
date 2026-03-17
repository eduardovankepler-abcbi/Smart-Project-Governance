import { useState, useMemo, useCallback } from "react";
import Header from "@/components/Header";
import { useData, getStatusColor } from "@/contexts/DataContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FileDown, FileSpreadsheet, Plus, Pencil, Trash2, ArrowUpDown, ChevronRight, ChevronDown } from "lucide-react";
import { exportToPdf, exportToExcel } from "@/utils/exportUtils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import TarefaDialog from "@/components/TarefaDialog";
import DeleteDialog from "@/components/DeleteDialog";
import type { Tarefa } from "@/data/projectData";
import { formatDurationHours, getTaskPredecessorLabel, getTaskResourceLabel, getTaskResourceNames } from "@/utils/projectModel";
import { getTaskBusinessId, getTaskDisplayHierarchy, MAX_TASK_WBS_DEPTH } from "@/utils/taskIdentity";

function StatusDot({ status }: { status: string }) {
  const color = getStatusColor(status);
  const map: Record<string, string> = {
    destructive: "bg-destructive",
    warning: "bg-warning",
    success: "bg-success",
    secondary: "bg-muted-foreground",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${map[color] || map.secondary}`} />
      <span className="text-xs">{status}</span>
    </span>
  );
}

const STATUS_OPTIONS = ["Atrasado", "Em andamento", "Não iniciado", "Concluído"];
type SortKey = "id" | "projeto" | "tarefa" | "dataFimPlanej" | "percentual" | "status";

interface TreeNode extends Tarefa {
  children: TreeNode[];
  depth: number;
}

function buildTree(tarefas: Tarefa[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create nodes
  tarefas.forEach(t => map.set(t.id, { ...t, children: [], depth: 0 }));

  // Build hierarchy
  tarefas.forEach(t => {
    const node = map.get(t.id)!;
    if (t.parentId && map.has(t.parentId)) {
      const parent = map.get(t.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Fix depths recursively
  function setDepths(nodes: TreeNode[], depth: number) {
    nodes.forEach(n => { n.depth = depth; setDepths(n.children, depth + 1); });
  }
  setDepths(roots, 0);

  return roots;
}

function flattenTree(nodes: TreeNode[], expanded: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(items: TreeNode[]) {
    items.forEach(node => {
      result.push(node);
      if (node.children.length > 0 && expanded.has(node.id)) {
        walk(node.children);
      }
    });
  }
  walk(nodes);
  return result;
}

export default function TarefasPage() {
  const { tarefas, setTarefas, refreshTarefas, getUniqueProjetos, getUniqueResponsaveis } = useData();
  const { canWrite } = useAuth();
  const { toast } = useToast();
  const [filterResponsavel, setFilterResponsavel] = useState("all");
  const [filterProjeto, setFilterProjeto] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [percentRange, setPercentRange] = useState<number[]>([0, 100]);
  const [sortBy, setSortBy] = useState<SortKey>("id");
  const [sortAsc, setSortAsc] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarefa, setEditTarefa] = useState<Tarefa | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tarefa | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newSubtaskParentId, setNewSubtaskParentId] = useState<string | undefined>();
  const [newSubtaskProjeto, setNewSubtaskProjeto] = useState<string | undefined>();

  const responsaveis = useMemo(() => getUniqueResponsaveis(), [getUniqueResponsaveis]);
  const projetosUnicos = useMemo(() => getUniqueProjetos(), [getUniqueProjetos]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allParents = tarefas.filter(t => tarefas.some(c => c.parentId === t.id)).map(t => t.id);
    setExpanded(new Set(allParents));
  }, [tarefas]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const filtered = useMemo(() => {
    let result = tarefas.filter(t => {
      if (filterProjeto !== "all" && t.projeto !== filterProjeto) return false;
      if (filterResponsavel !== "all" && !getTaskResourceNames(t).includes(filterResponsavel)) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (t.percentual < percentRange[0] || t.percentual > percentRange[1]) return false;
      if (search && !t.tarefa.toLowerCase().includes(search.toLowerCase()) && !t.projeto.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    result.sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy];
      if (typeof av === "string" && typeof bv === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (Number(av) - Number(bv)) : (Number(bv) - Number(av));
    });
    return result;
  }, [tarefas, filterResponsavel, filterProjeto, filterStatus, search, percentRange, sortBy, sortAsc]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const visibleRows = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(true); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Also delete children
      const idsToDelete = [deleteTarget.id];
      const findChildren = (parentId: string) => {
        tarefas.filter(t => t.parentId === parentId).forEach(t => {
          idsToDelete.push(t.id);
          findChildren(t.id);
        });
      };
      findChildren(deleteTarget.id);

      if (isApiEnabled()) {
        for (const id of idsToDelete.reverse()) {
          await api.deleteTarefa(id);
        }
        await refreshTarefas();
      } else {
        setTarefas(tarefas.filter(t => !idsToDelete.includes(t.id)));
      }
      toast({ title: "Tarefa excluída", description: idsToDelete.length > 1 ? `${idsToDelete.length} tarefas excluídas (incluindo subtarefas)` : undefined });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const childCount = (id: string): number => {
    return tarefas.filter(t => t.parentId === id).length;
  };

  const canAddSubtask = (t: Tarefa): boolean => {
    const depth = getTaskDisplayHierarchy(t).split(".").length;
    return depth < MAX_TASK_WBS_DEPTH;
  };

  const handleAddSubtask = (parent: Tarefa) => {
    setEditTarefa(null);
    setNewSubtaskParentId(parent.id);
    setNewSubtaskProjeto(parent.projeto);
    setDialogOpen(true);
  };

  const handleNewTask = () => {
    setEditTarefa(null);
    setNewSubtaskParentId(undefined);
    setNewSubtaskProjeto(undefined);
    setDialogOpen(true);
  };

  const handleExportPdf = () => {
    const headers = ["ID", "WBS", "Pai", "Projeto", "Tarefa", "Recursos", "Pred.", "Duração", "%", "Status"];
    const rows = filtered.map(t => [getTaskBusinessId(t), getTaskDisplayHierarchy(t), t.parentId || "—", t.projeto, t.tarefa, getTaskResourceLabel(t), getTaskPredecessorLabel(t), formatDurationHours(t.durationMinutes || 0), `${t.percentual}%`, t.status]);
    exportToPdf("Relatório de Tarefas", headers, rows, "tarefas");
  };

  const handleExportExcel = () => {
    const headers = ["ID", "WBS", "Pai", "Projeto", "Tarefa", "Recursos", "Predecessoras", "Duração (h)", "%", "Status"];
    const rows = filtered.map(t => [getTaskBusinessId(t), getTaskDisplayHierarchy(t), t.parentId || "", t.projeto, t.tarefa, getTaskResourceLabel(t), getTaskPredecessorLabel(t), (t.durationMinutes || 0) / 60, t.percentual, t.status]);
    exportToExcel(headers, rows, "tarefas", "Tarefas");
  };

  return (
    <div className="flex flex-col">
      <Header title="Tarefas" />
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="flex flex-wrap gap-3 items-end">
          <Input placeholder="Buscar tarefa..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
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
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 min-w-[250px]">
            <span className="text-xs text-muted-foreground whitespace-nowrap">% Conclusão:</span>
            <Slider value={percentRange} onValueChange={setPercentRange} min={0} max={100} step={5} className="flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{percentRange[0]}–{percentRange[1]}%</span>
          </div>
          <Button variant="outline" size="sm" onClick={expandAll} className="text-xs">Expandir Tudo</Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs">Recolher Tudo</Button>
          <div className="flex gap-2 ml-auto">
            {canWrite && (
              <Button size="sm" onClick={handleNewTask} className="gap-1.5">
                <Plus size={14} /> Nova Tarefa
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5">
              <FileDown size={14} /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5">
              <FileSpreadsheet size={14} /> Excel
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">{filtered.length} tarefa(s) encontrada(s)</div>

        <div className="rounded-lg border border-border overflow-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-24 text-xs cursor-pointer" onClick={() => toggleSort("id")}>
                  ID / WBS {sortBy === "id" && <ArrowUpDown size={12} className="inline ml-1" />}
                </TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => toggleSort("projeto")}>
                  Projeto {sortBy === "projeto" && <ArrowUpDown size={12} className="inline ml-1" />}
                </TableHead>
                <TableHead className="text-xs min-w-[250px] cursor-pointer" onClick={() => toggleSort("tarefa")}>
                  Tarefa {sortBy === "tarefa" && <ArrowUpDown size={12} className="inline ml-1" />}
                </TableHead>
                <TableHead className="text-xs">Recursos</TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => toggleSort("dataFimPlanej")}>
                  Fim Plan. {sortBy === "dataFimPlanej" && <ArrowUpDown size={12} className="inline ml-1" />}
                </TableHead>
                <TableHead className="text-xs">Pred.</TableHead>
                <TableHead className="text-xs">Duração</TableHead>
                <TableHead className="text-xs text-center cursor-pointer" onClick={() => toggleSort("percentual")}>
                  % {sortBy === "percentual" && <ArrowUpDown size={12} className="inline ml-1" />}
                </TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => toggleSort("status")}>
                  Status {sortBy === "status" && <ArrowUpDown size={12} className="inline ml-1" />}
                </TableHead>
                {canWrite && <TableHead className="text-xs w-28">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(t => {
                const hasChildren = t.children.length > 0;
                const isExpanded = expanded.has(t.id);
                return (
                  <TableRow key={t.id} className={`hover:bg-muted/30 transition-colors ${t.depth > 0 ? 'bg-muted/10' : ''}`}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      <div className="flex items-center gap-1" style={{ paddingLeft: `${t.depth * 16}px` }}>
                        {hasChildren ? (
                          <button onClick={() => toggleExpand(t.id)} className="p-0.5 rounded hover:bg-muted">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        {getTaskBusinessId(t)}
                      </div>
                      <div className="pl-6 text-[10px] text-muted-foreground">WBS {getTaskDisplayHierarchy(t)} · Chave {t.id}</div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{t.depth === 0 ? t.projeto : ""}</TableCell>
                    <TableCell className="text-xs">
                      <div style={{ paddingLeft: `${t.depth * 12}px` }}>
                        {t.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                        {t.tarefa}
                        {hasChildren && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">({childCount(t.id)})</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getTaskResourceLabel(t) || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.dataFimPlanej}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getTaskPredecessorLabel(t) || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDurationHours(t.durationMinutes || 0)}</TableCell>
                    <TableCell className="text-xs text-center font-medium">{t.percentual}%</TableCell>
                    <TableCell><StatusDot status={t.status} /></TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex gap-0.5">
                          {canAddSubtask(t) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="Adicionar subtarefa" onClick={() => handleAddSubtask(t)}>
                              <Plus size={12} />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarefa(t); setNewSubtaskParentId(undefined); setNewSubtaskProjeto(undefined); setDialogOpen(true); }}>
                            <Pencil size={12} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(t)}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {canWrite && (
        <TarefaDialog
          open={dialogOpen}
          onOpenChange={o => { setDialogOpen(o); if (!o) { setNewSubtaskParentId(undefined); setNewSubtaskProjeto(undefined); } }}
          tarefa={editTarefa}
          defaultParentId={newSubtaskParentId}
          defaultProjeto={newSubtaskProjeto}
        />
      )}
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title="Excluir Tarefa"
        description={`Tem certeza que deseja excluir a tarefa "${deleteTarget?.tarefa}"?${childCount(deleteTarget?.id || "") > 0 ? ` Isso também excluirá ${childCount(deleteTarget?.id || "")} subtarefa(s).` : ""}`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
