import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { useData, formatCurrency, getStatusColor } from "@/contexts/DataContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, FileSpreadsheet, Plus, Pencil, Trash2, ArrowUpDown } from "lucide-react";
import { exportToPdf, exportToExcel } from "@/utils/exportUtils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import ProjetoDialog from "@/components/ProjetoDialog";
import DeleteDialog from "@/components/DeleteDialog";
import type { Projeto } from "@/data/projectData";

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

export default function ProjetosPage() {
  const { projetos, setProjetos, refreshProjetos } = useData();
  const { canWrite, user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("projeto");
  const [sortAsc, setSortAsc] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProjeto, setEditProjeto] = useState<Projeto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Projeto | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <div className="flex flex-col">
      <Header title="Projetos" />
      <div className="p-6 animate-fade-in space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-end">
          <Input placeholder="Buscar projeto..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => toggleSort("projeto")} className="gap-1.5">
            <ArrowUpDown size={14} /> Nome
          </Button>
          <Button variant="outline" size="sm" onClick={() => toggleSort("dataFimPlanej")} className="gap-1.5">
            <ArrowUpDown size={14} /> Prazo
          </Button>
          <Button variant="outline" size="sm" onClick={() => toggleSort("conclusao")} className="gap-1.5">
            <ArrowUpDown size={14} /> Conclusão
          </Button>
          <div className="ml-auto flex gap-2">
            {canWrite && user?.role === "admin" && (
              <Button size="sm" onClick={() => { setEditProjeto(null); setDialogOpen(true); }} className="gap-1.5">
                <Plus size={14} /> Novo Projeto
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

        <div className="text-xs text-muted-foreground">{filtered.length} projeto(s) encontrado(s)</div>

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
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {canWrite && <ProjetoDialog open={dialogOpen} onOpenChange={setDialogOpen} projeto={editProjeto} />}
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
