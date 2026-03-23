import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Briefcase, AlertTriangle, CheckCircle, Plus, Pencil, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import RecursoDialog from "@/components/RecursoDialog";
import DeleteDialog from "@/components/DeleteDialog";
import ChartPreviewModal from "@/components/ChartPreviewModal";
import type { Recurso } from "@/data/projectData";
import { getTaskResourceNames } from "@/utils/projectModel";

interface RecursoInfo {
  externalId?: string;
  nome: string;
  funcao: string;
  id?: number;
  seniority: string;
  specialties: string[];
  resourceType: string;
  initials: string;
  maxUnits: number;
  standardRate: number;
  overtimeRate: number;
  email: string;
  totalTarefas: number;
  tarefasConcluidas: number;
  tarefasAndamento: number;
  tarefasAtrasadas: number;
  tarefasNaoIniciadas: number;
  projetosEnvolvidos: string[];
  esforcoTotal: number;
  percentualMedio: number;
}

export default function RecursosPage() {
  const { recursos, setRecursos, refreshRecursos, tarefas } = useData();
  const { canWrite } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecurso, setEditRecurso] = useState<(Recurso & { id?: number }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(Recurso & { id?: number }) | null>(null);
  const [deleting, setDeleting] = useState(false);

  const recursosInfo = useMemo<RecursoInfo[]>(() => {
    return recursos
      .filter(r => r.nome !== "Cliente" && r.nome !== "Key user-cliente")
      .filter(r => !search || r.nome.toLowerCase().includes(search.toLowerCase()) || r.funcao.toLowerCase().includes(search.toLowerCase()))
      .map(r => {
        const tarefasDoRecurso = tarefas.filter(t =>
          getTaskResourceNames(t).includes(r.nome)
        );
        const projetosSet = new Set(tarefasDoRecurso.map(t => t.projeto));
        const concluidas = tarefasDoRecurso.filter(t => t.status === "Concluído").length;
        const andamento = tarefasDoRecurso.filter(t => t.status === "Em andamento").length;
        const atrasadas = tarefasDoRecurso.filter(t => t.status === "Atrasado").length;
        const naoIniciadas = tarefasDoRecurso.filter(t => t.status === "Não iniciado").length;
        const esforco = tarefasDoRecurso.reduce((s, t) => s + t.esforcoPlanej, 0);
        const pctMedia = tarefasDoRecurso.length > 0
          ? Math.round(tarefasDoRecurso.reduce((s, t) => s + t.percentual, 0) / tarefasDoRecurso.length)
          : 0;

        return {
          nome: r.nome,
          funcao: r.funcao,
          externalId: r.externalId,
          id: (r as Recurso & { id?: number }).id,
          seniority: r.seniority || "",
          specialties: r.specialties || [],
          resourceType: r.resourceType || "work",
          initials: r.initials || "",
          maxUnits: r.maxUnits || 1,
          standardRate: r.standardRate || 0,
          overtimeRate: r.overtimeRate || 0,
          email: r.email || "",
          totalTarefas: tarefasDoRecurso.length,
          tarefasConcluidas: concluidas,
          tarefasAndamento: andamento,
          tarefasAtrasadas: atrasadas,
          tarefasNaoIniciadas: naoIniciadas,
          projetosEnvolvidos: Array.from(projetosSet),
          esforcoTotal: esforco,
          percentualMedio: pctMedia,
        };
      })
      .sort((a, b) => b.totalTarefas - a.totalTarefas);
  }, [recursos, tarefas, search]);

  const chartData = useMemo(() => {
    return recursosInfo
      .filter(r => r.totalTarefas > 0)
      .map(r => ({
        name: r.nome.split(" ")[0],
        atrasadas: r.tarefasAtrasadas,
        andamento: r.tarefasAndamento,
        concluidas: r.tarefasConcluidas,
        naoIniciadas: r.tarefasNaoIniciadas,
      }));
  }, [recursosInfo]);

  const totalRecursos = recursosInfo.length;
  const totalComTarefas = recursosInfo.filter(r => r.totalTarefas > 0).length;
  const totalAtrasadas = recursosInfo.reduce((s, r) => s + r.tarefasAtrasadas, 0);

  const renderResourceWorkloadChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
        <Bar dataKey="atrasadas" name="Atrasadas" stackId="a" fill="hsl(var(--destructive))" />
        <Bar dataKey="andamento" name="Em Andamento" stackId="a" fill="hsl(var(--warning))" />
        <Bar dataKey="concluidas" name="Concluídas" stackId="a" fill="hsl(var(--success))" />
        <Bar dataKey="naoIniciadas" name="Não Iniciadas" stackId="a" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (isApiEnabled() && deleteTarget.id) {
        await api.deleteRecurso(deleteTarget.id);
        await refreshRecursos();
      } else {
        setRecursos(recursos.filter(r => r.nome !== deleteTarget.nome));
      }
      toast({ title: "Recurso excluído" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Recursos" />
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex flex-wrap gap-3 items-end">
          <Input placeholder="Buscar recurso..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
          {canWrite && (
            <Button size="sm" onClick={() => { setEditRecurso(null); setDialogOpen(true); }} className="gap-1.5 ml-auto">
              <Plus size={14} /> Novo Recurso
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Users size={20} className="text-info" />
              <div>
                <p className="text-xs text-muted-foreground">Total Recursos</p>
                <p className="text-xl font-display font-bold text-foreground">{totalRecursos}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Briefcase size={20} className="text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Com Tarefas</p>
                <p className="text-xl font-display font-bold text-foreground">{totalComTarefas}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle size={20} className="text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Tarefas Atrasadas</p>
                <p className="text-xl font-display font-bold text-destructive">{totalAtrasadas}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-success" />
              <div>
                <p className="text-xs text-muted-foreground">Funções Únicas</p>
                <p className="text-xl font-display font-bold text-foreground">
                  {new Set(recursos.map(r => r.funcao).filter(Boolean)).size}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-sm font-display font-semibold text-foreground">Carga de Trabalho por Recurso</h3>
              <ChartPreviewModal
                title="Carga de Trabalho por Recurso"
                description="Visualização ampliada da distribuição de tarefas por recurso."
                renderChart={renderResourceWorkloadChart}
              />
            </div>
            {renderResourceWorkloadChart(300)}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {recursosInfo.map(r => (
            <Card key={r.nome} className="border border-border hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {r.nome.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-base font-display font-bold text-foreground">{r.nome}</h3>
                        <p className="text-xs text-muted-foreground">{r.funcao || "—"} • {r.resourceType} • {r.seniority || "sem senioridade"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.projetosEnvolvidos.map(p => (
                        <span key={p} className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="flex flex-wrap gap-4 lg:gap-6 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-display font-bold text-foreground">{r.totalTarefas}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Atrasadas</p>
                        <p className="text-lg font-display font-bold text-destructive">{r.tarefasAtrasadas}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Andamento</p>
                        <p className="text-lg font-display font-bold text-warning">{r.tarefasAndamento}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Concluídas</p>
                        <p className="text-lg font-display font-bold text-success">{r.tarefasConcluidas}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Esforço (h)</p>
                        <p className="text-lg font-display font-bold text-foreground">{r.esforcoTotal.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Capacidade</p>
                        <p className="text-lg font-display font-bold text-foreground">{Math.round(r.maxUnits * 100)}%</p>
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex flex-col gap-1 ml-4">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditRecurso({ nome: r.nome, funcao: r.funcao, id: r.id, externalId: r.externalId, seniority: r.seniority, specialties: r.specialties, resourceType: r.resourceType, initials: r.initials, maxUnits: r.maxUnits, standardRate: r.standardRate, overtimeRate: r.overtimeRate, email: r.email }); setDialogOpen(true); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ nome: r.nome, funcao: r.funcao, id: r.id, externalId: r.externalId, seniority: r.seniority, specialties: r.specialties, resourceType: r.resourceType, initials: r.initials, maxUnits: r.maxUnits, standardRate: r.standardRate, overtimeRate: r.overtimeRate, email: r.email })}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <Progress value={r.percentualMedio} className="h-2 flex-1" />
                  <span className="text-xs font-medium text-muted-foreground">{r.percentualMedio}%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>Senioridade: <strong className="text-foreground">{r.seniority || "—"}</strong></span>
                  <span>Especialidades: <strong className="text-foreground">{(r.specialties || []).join(", ") || "—"}</strong></span>
                  <span>Iniciais: <strong className="text-foreground">{r.initials || "—"}</strong></span>
                  <span>Tarifa padrão: <strong className="text-foreground">R$ {r.standardRate.toFixed(2)}</strong></span>
                  <span>Tarifa extra: <strong className="text-foreground">R$ {r.overtimeRate.toFixed(2)}</strong></span>
                  <span>Email: <strong className="text-foreground">{r.email || "—"}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {canWrite && <RecursoDialog open={dialogOpen} onOpenChange={setDialogOpen} recurso={editRecurso} />}
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title="Excluir Recurso"
        description={`Tem certeza que deseja excluir o recurso "${deleteTarget?.nome}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
