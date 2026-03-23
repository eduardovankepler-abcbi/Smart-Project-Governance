import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { useData, formatCurrency } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign, FolderKanban } from "lucide-react";
import { getTaskResourceNames } from "@/utils/projectModel";
import BaselineGovernancePanel from "@/components/BaselineGovernancePanel";
import ChartPreviewModal from "@/components/ChartPreviewModal";

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
    { label: "Projetos", value: totalProjetos, icon: FolderKanban, color: "text-info" },
    { label: "Total de Tarefas", value: totalTarefas, icon: Clock, color: "text-muted-foreground" },
    { label: "Tarefas Atrasadas", value: totalAtrasadas, icon: AlertTriangle, color: "text-destructive" },
    { label: "Valor Previsto", value: formatCurrency(valorPrevisto), icon: DollarSign, color: "text-success" },
    { label: "Valor Gasto", value: formatCurrency(valorGasto), icon: TrendingUp, color: "text-warning" },
    { label: "Execução Financeira", value: `${execucao}%`, icon: CheckCircle, color: "text-primary" },
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
        <div className="surface-panel flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Visão Executiva</p>
            <h2 className="text-2xl font-display font-semibold text-foreground">Panorama consolidado do portfólio</h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe execução, capacidade e saúde financeira em um layout mais limpo, mantendo a mesma densidade operacional.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={filterProjeto} onValueChange={(value) => updateSearchParam("projeto", value)}>
              <SelectTrigger className="w-60 rounded-xl border-border/80 bg-background/80">
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Projetos</SelectItem>
                {projetosUnicos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => updateSearchParam("tab", value)} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="curva-s">Curva S</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {kpis.map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="border-border/80 bg-card/90 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/55">
                        <Icon size={16} className={color} />
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    </div>
                    <p className="text-xl font-display font-bold text-foreground">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-border/80 bg-card/92 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-display font-semibold text-foreground">Status dos Projetos</h3>
                    <ChartPreviewModal
                      title="Status dos Projetos"
                      description="Distribuição dos projetos por status no filtro atual."
                      renderChart={renderProjectStatusChart}
                    />
                  </div>
                  {renderProjectStatusChart(260)}
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/92 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-display font-semibold text-foreground">Distribuição de Tarefas por Status</h3>
                    <ChartPreviewModal
                      title="Distribuição de Tarefas por Status"
                      description="Visão agregada do status das tarefas no filtro atual."
                      renderChart={renderTaskStatusChart}
                    />
                  </div>
                  {renderTaskStatusChart(260)}
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/92 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-display font-semibold text-foreground">Curva de Burndown</h3>
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

            <Card className="border-border/80 bg-card/92 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-display font-semibold text-foreground">Tarefas por Responsável (10 maiores)</h3>
                  <ChartPreviewModal
                    title="Tarefas por Responsável"
                    description="Ranking dos responsáveis com maior volume de tarefas no recorte atual."
                    renderChart={renderOwnerTasksChart}
                  />
                </div>
                {renderOwnerTasksChart(300)}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/92 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-display font-semibold text-foreground">Tarefas por Projeto</h3>
                  <ChartPreviewModal
                    title="Tarefas por Projeto"
                    description="Comparativo de tarefas atrasadas, em andamento e concluídas por projeto."
                    renderChart={renderTasksByProjectChart}
                  />
                </div>
                {renderTasksByProjectChart(260)}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/92 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-display font-semibold text-foreground">Comparativo Financeiro por Projeto</h3>
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
