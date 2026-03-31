import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { useData, formatCurrency } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign, FolderKanban, GitBranch, ListTodo, Plus, ArrowUpRight, Gauge } from "lucide-react";
import { getTaskResourceNames } from "@/utils/projectModel";
import BaselineGovernancePanel from "@/components/BaselineGovernancePanel";
import ChartPreviewModal from "@/components/ChartPreviewModal";
import { useAuth } from "@/contexts/AuthContext";

const COLORS = [
  "hsl(0, 78%, 45%)",
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(270, 60%, 55%)",
];

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

export default function DashboardPage() {
  const { projetos, tarefas, getUniqueProjetos } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterProjeto = searchParams.get("projeto") || "all";
  const activeTab = searchParams.get("tab") === "curva-s" ? "curva-s" : "resumo";
  const projetosUnicos = useMemo(() => getUniqueProjetos(), [getUniqueProjetos]);

  const filteredProjetos = useMemo(() => {
    if (filterProjeto === "all") return projetos;
    return projetos.filter(p => p.projeto === filterProjeto);
  }, [filterProjeto, projetos]);

  const filteredTarefas = useMemo(() => {
    if (filterProjeto === "all") return tarefas;
    return tarefas.filter(t => t.projeto === filterProjeto);
  }, [filterProjeto, tarefas]);

  const selectedProject = useMemo(
    () => projetos.find((project) => project.projeto === filterProjeto) || null,
    [filterProjeto, projetos]
  );

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProjetos.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredProjetos]);

  const tarefasPorProjeto = useMemo(() => {
    return filteredProjetos.map(p => ({
      name: p.projeto,
      total: p.totalTarefas,
      atrasadas: p.tarefasAtrasadas,
      andamento: p.tarefasAndamento,
      concluidas: p.tarefasConcluidas,
    }));
  }, [filteredProjetos]);

  const tarefaStatusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTarefas.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredTarefas]);

  const tarefaResponsavelData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTarefas.forEach(t => {
      getTaskResourceNames(t).forEach(r => {
        const name = r.trim();
        if (name && name !== "Cliente" && name !== "Key user-cliente") {
          counts[name] = (counts[name] || 0) + 1;
        }
      });
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.split(" ")[0], fullName: name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredTarefas]);

  const burndownData = useMemo(() => {
    const totalTasks = filteredTarefas.length;
    if (totalTasks === 0) return [];

    const datesMap = new Map<string, number>();
    filteredTarefas.forEach(t => {
      const d = parseDate(t.dataFimPlanej);
      if (d) {
        const key = `${d.getMonth() + 1}/${d.getFullYear() % 100}`;
        datesMap.set(key, (datesMap.get(key) || 0) + 1);
      }
    });

    const sorted = Array.from(datesMap.entries()).sort((a, b) => {
      const [am, ay] = a[0].split("/").map(Number);
      const [bm, by] = b[0].split("/").map(Number);
      return ay !== by ? ay - by : am - bm;
    });

    let remaining = totalTasks;
    return sorted.map(([month, count]) => {
      remaining -= count;
      return { name: month, restantes: Math.max(remaining, 0), planejadas: count };
    });
  }, [filteredTarefas]);

  const totalProjetos = filteredProjetos.length;
  const totalTarefas = filteredProjetos.reduce((s, p) => s + p.totalTarefas, 0);
  const totalAtrasadas = filteredProjetos.reduce((s, p) => s + p.tarefasAtrasadas, 0);
  const valorPrevisto = filteredProjetos.reduce((s, p) => s + p.valorPrevisto, 0);
  const valorGasto = filteredProjetos.reduce((s, p) => s + p.valorGasto, 0);
  const execucao = valorPrevisto > 0 ? Math.round((valorGasto / valorPrevisto) * 100) : 0;

  const kpis = [
    {
      label: "Projetos Ativos",
      value: totalProjetos,
      icon: FolderKanban,
      color: "text-info",
      detailA: `${filteredProjetos.filter((item) => item.status === "Atrasado").length} atrasados`,
      detailB: `${filteredProjetos.filter((item) => item.status === "Concluído").length} concluídos`,
    },
    {
      label: "Tarefas Totais",
      value: totalTarefas,
      icon: Clock,
      color: "text-warning",
      detailA: `${filteredTarefas.filter((item) => item.status === "Em andamento").length} em andamento`,
      detailB: `${filteredTarefas.filter((item) => item.status === "Não iniciado").length} não iniciadas`,
    },
    {
      label: "Atrasos Críticos",
      value: totalAtrasadas,
      icon: AlertTriangle,
      color: "text-destructive",
      detailA: `${filteredProjetos.length ? Math.round((totalAtrasadas / Math.max(totalTarefas, 1)) * 100) : 0}% do total`,
      detailB: `${filterProjeto === "all" ? "Portfólio" : "Projeto"} monitorado`,
    },
    {
      label: "Horas Planejadas",
      value: `${filteredTarefas.reduce((sum, item) => sum + Number(item.esforcoPlanej || 0), 0).toFixed(0)}h`,
      icon: Gauge,
      color: "text-success",
      detailA: `${filteredTarefas.reduce((sum, item) => sum + Number(item.esforcoReal || 0), 0).toFixed(0)}h realizadas`,
      detailB: `${execucao}% execução`,
    },
    {
      label: "Valor Previsto",
      value: formatCurrency(valorPrevisto),
      icon: DollarSign,
      color: "text-info",
      detailA: formatCurrency(valorGasto),
      detailB: "valor gasto",
    },
    {
      label: "Saúde Financeira",
      value: `${execucao}%`,
      icon: CheckCircle,
      color: "text-chart-3",
      detailA: totalProjetos ? `${Math.max(totalProjetos - filteredProjetos.filter((item) => item.status === "Atrasado").length, 0)} dentro do plano` : "Sem base",
      detailB: "comparação previsto x gasto",
    },
  ];

  const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" };

  const renderProjectStatusChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
          {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );

  const renderTaskStatusChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={tarefaStatusData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
          {tarefaStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );

  const renderBurndownChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={burndownData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="restantes" name="Restantes" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderOwnerTasksChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={tarefaResponsavelData} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _: string, props: any) => [v, props.payload.fullName]} />
        <Bar dataKey="value" name="Tarefas" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderTasksByProjectChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={tarefasPorProjeto} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Bar dataKey="atrasadas" name="Atrasadas" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
        <Bar dataKey="andamento" name="Em Andamento" fill={COLORS[3]} radius={[0, 4, 4, 0]} />
        <Bar dataKey="concluidas" name="Concluídas" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderFinancialComparisonChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={filteredProjetos.map(p => ({ name: p.projeto, previsto: p.valorPrevisto, gasto: p.valorGasto }))} margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-20} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={tooltipStyle} />
        <Legend />
        <Bar dataKey="previsto" name="Valor Previsto" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
        <Bar dataKey="gasto" name="Valor Gasto" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const updateSearchParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" />
      <div className="space-y-6 px-5 pb-6 animate-fade-in">
        <div className="surface-panel overflow-hidden px-6 py-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Dashboard Executivo</p>
              <div className="space-y-2">
                <h2 className="text-4xl font-display font-bold tracking-tight text-foreground">
                  Olá, {user?.nome?.split(" ")[0] || "Equipe"}!
                </h2>
                <p className="max-w-2xl text-lg text-muted-foreground">
                  Aqui está o resumo estratégico da operação. Acompanhe portfólio, tarefas, finanças e a governança do cronograma em uma única camada visual.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 xl:justify-end">
              <Button className="rounded-2xl bg-primary px-5 shadow-[0_18px_30px_-18px_rgba(59,130,246,0.95)]" onClick={() => navigate("/projetos")}>
                <FolderKanban size={16} className="mr-2" />
                Ver Projetos
              </Button>
              <Button className="rounded-2xl bg-emerald-600 px-5 text-white shadow-[0_18px_30px_-18px_rgba(5,150,105,0.95)] hover:bg-emerald-500" onClick={() => navigate("/tarefas")}>
                <ListTodo size={16} className="mr-2" />
                Ver Tarefas
              </Button>
              <Button className="rounded-2xl bg-violet-600 px-5 text-white shadow-[0_18px_30px_-18px_rgba(124,58,237,0.95)] hover:bg-violet-500" onClick={() => updateSearchParam("tab", "curva-s")}>
                <GitBranch size={16} className="mr-2" />
                Curva S
              </Button>
              <Button className="rounded-2xl bg-fuchsia-600 px-5 text-white shadow-[0_18px_30px_-18px_rgba(192,38,211,0.95)] hover:bg-fuchsia-500" onClick={() => navigate("/cadastro?tab=projetos")}>
                <Plus size={16} className="mr-2" />
                Cadastros
              </Button>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              {kpis.map(({ label, value, icon: Icon, color, detailA, detailB }) => (
                <Card key={label} className="border-white/[0.06] bg-white/[0.02] shadow-none">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                        <p className="text-3xl font-display font-bold text-foreground">{value}</p>
                      </div>
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04]">
                        <Icon size={18} className={color} />
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3 text-xs text-muted-foreground">
                      <div>{detailA}</div>
                      <div>{detailB}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Select value={filterProjeto} onValueChange={(value) => updateSearchParam("projeto", value)}>
                <SelectTrigger className="w-60 rounded-2xl border-white/[0.08] bg-white/[0.03]">
                  <SelectValue placeholder="Projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Projetos</SelectItem>
                  {projetosUnicos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => updateSearchParam("tab", value)} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-2 rounded-[22px] border border-white/[0.06] bg-card/[0.85] p-1.5">
            <TabsTrigger value="resumo" className="rounded-2xl data-[state=active]:bg-background data-[state=active]:shadow-none">Resumo</TabsTrigger>
            <TabsTrigger value="curva-s" className="rounded-2xl data-[state=active]:bg-background data-[state=active]:shadow-none">Curva S</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Portfólio</p>
                      <h3 className="text-lg font-display font-semibold text-foreground">Status dos Projetos</h3>
                    </div>
                    <ChartPreviewModal
                      title="Status dos Projetos"
                      description="Distribuição dos projetos por status no filtro atual."
                      renderChart={renderProjectStatusChart}
                    />
                  </div>
                  {renderProjectStatusChart(260)}
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Execução</p>
                      <h3 className="text-lg font-display font-semibold text-foreground">Tarefas por Status</h3>
                    </div>
                    <ChartPreviewModal
                      title="Distribuição de Tarefas por Status"
                      description="Visão agregada do status das tarefas no filtro atual."
                      renderChart={renderTaskStatusChart}
                    />
                  </div>
                  {renderTaskStatusChart(260)}
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Entrega</p>
                      <h3 className="text-lg font-display font-semibold text-foreground">Curva de Burndown</h3>
                    </div>
                    <ChartPreviewModal
                      title="Curva de Burndown"
                      description="Evolução das tarefas restantes ao longo do cronograma planejado."
                      renderChart={renderBurndownChart}
                    />
                  </div>
                  {renderBurndownChart(260)}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Performance</p>
                    <h3 className="text-lg font-display font-semibold text-foreground">Produtividade por Responsável</h3>
                  </div>
                  <ChartPreviewModal
                    title="Tarefas por Responsável"
                    description="Ranking dos responsáveis com maior volume de tarefas no recorte atual."
                    renderChart={renderOwnerTasksChart}
                  />
                </div>
                {renderOwnerTasksChart(300)}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Portfólio</p>
                    <h3 className="text-lg font-display font-semibold text-foreground">Tarefas por Projeto</h3>
                  </div>
                  <ChartPreviewModal
                    title="Tarefas por Projeto"
                    description="Comparativo de tarefas atrasadas, em andamento e concluídas por projeto."
                    renderChart={renderTasksByProjectChart}
                  />
                </div>
                {renderTasksByProjectChart(260)}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Financeiro</p>
                    <h3 className="text-lg font-display font-semibold text-foreground">Comparativo Financeiro</h3>
                  </div>
                  <ChartPreviewModal
                    title="Comparativo Financeiro por Projeto"
                    description="Comparação entre valor previsto e valor gasto por projeto."
                    renderChart={renderFinancialComparisonChart}
                  />
                </div>
                {renderFinancialComparisonChart(300)}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="curva-s" className="space-y-6">
            <BaselineGovernancePanel selectedProject={selectedProject} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
