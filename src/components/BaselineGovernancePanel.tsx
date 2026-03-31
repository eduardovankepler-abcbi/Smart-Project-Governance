import { useEffect, useMemo, useState } from "react";
import type { Projeto } from "@/data/projectData";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import type { ProjectBaseline, ProjectCurveSResponse } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/contexts/DataContext";
import { GitBranchPlus, ShieldCheck } from "lucide-react";
import ChartPreviewModal from "@/components/ChartPreviewModal";

interface BaselineGovernancePanelProps {
  selectedProject: Projeto | null;
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function formatMetricValue(metric: ProjectCurveSResponse["metric"], value: number) {
  if (metric === "cost") return formatCurrency(value);
  if (metric === "progress") return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)}h`;
}

function getStatusBadgeVariant(status: ProjectBaseline["status"]) {
  if (status === "approved") return "default";
  if (status === "pending_approval") return "secondary";
  return "destructive";
}

function buildCurveTooltipStyle() {
  return { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" };
}

export default function BaselineGovernancePanel({ selectedProject }: BaselineGovernancePanelProps) {
  const { canWrite, hasRole } = useAuth();
  const { toast } = useToast();
  const [curveMetric, setCurveMetric] = useState<ProjectCurveSResponse["metric"]>("effort");
  const [selectedBaselineId, setSelectedBaselineId] = useState("none");
  const [baselineName, setBaselineName] = useState("");
  const [baselineSourceType, setBaselineSourceType] = useState<ProjectBaseline["sourceType"]>("manual");
  const [baselineJustification, setBaselineJustification] = useState("");
  const [approvalNotes, setApprovalNotes] = useState<Record<number, string>>({});
  const [baselines, setBaselines] = useState<ProjectBaseline[]>([]);
  const [curveData, setCurveData] = useState<ProjectCurveSResponse | null>(null);
  const [loadingBaselines, setLoadingBaselines] = useState(false);
  const [loadingCurve, setLoadingCurve] = useState(false);
  const [submittingBaseline, setSubmittingBaseline] = useState(false);

  const officialBaseline = useMemo(
    () => baselines.find((baseline) => baseline.isOfficial) || null,
    [baselines]
  );
  const pendingBaselines = useMemo(
    () => baselines.filter((baseline) => baseline.status === "pending_approval"),
    [baselines]
  );
  const curveTooltipStyle = useMemo(() => buildCurveTooltipStyle(), []);

  useEffect(() => {
    async function loadBaselines() {
      if (!selectedProject) {
        setBaselines([]);
        setSelectedBaselineId("none");
        return;
      }
      setLoadingBaselines(true);
      try {
        const rows = await api.getProjectBaselines(selectedProject.id);
        setBaselines(rows);
        if (!rows.length) {
          setSelectedBaselineId("none");
        } else {
          setSelectedBaselineId((current) => {
            if (current !== "none" && rows.some((item) => String(item.id) === current)) return current;
            return String(rows.find((item) => item.isOfficial)?.id || rows[0].id);
          });
        }
      } catch (error) {
        toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
      } finally {
        setLoadingBaselines(false);
      }
    }
    loadBaselines();
  }, [selectedProject, toast]);

  useEffect(() => {
    async function loadCurve() {
      if (!selectedProject || selectedBaselineId === "none") {
        setCurveData(null);
        return;
      }
      setLoadingCurve(true);
      try {
        const response = await api.getProjectCurveS({
          projectId: selectedProject.id,
          baselineId: Number(selectedBaselineId),
          metric: curveMetric,
        });
        setCurveData(response);
      } catch (error) {
        toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
        setCurveData(null);
      } finally {
        setLoadingCurve(false);
      }
    }
    loadCurve();
  }, [curveMetric, selectedBaselineId, selectedProject, toast]);

  async function reloadBaselineData(nextBaselineId?: number) {
    if (!selectedProject) return;
    const rows = await api.getProjectBaselines(selectedProject.id);
    setBaselines(rows);
    if (nextBaselineId) {
      setSelectedBaselineId(String(nextBaselineId));
      return;
    }
    const stillExists = rows.some((item) => String(item.id) === selectedBaselineId);
    if (stillExists) return;
    setSelectedBaselineId(rows.length ? String(rows.find((item) => item.isOfficial)?.id || rows[0].id) : "none");
  }

  async function handleCreateBaseline() {
    if (!selectedProject) return;
    setSubmittingBaseline(true);
    try {
      const created = await api.createProjectBaseline({
        projectId: selectedProject.id,
        baselineName,
        sourceType: baselineSourceType,
        justification: baselineJustification,
      });
      toast({
        title: created.status === "approved" ? "Baseline criada e aprovada" : "Baseline enviada para aprovação",
        description:
          created.status === "approved"
            ? "A baseline oficial agora é a mais recente aprovada."
            : "A baseline ficará pendente até aprovação do administrador.",
      });
      setBaselineName("");
      setBaselineJustification("");
      await reloadBaselineData(created.id);
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSubmittingBaseline(false);
    }
  }

  async function handleApproveBaseline(id: number) {
    try {
      await api.approveProjectBaseline(id, approvalNotes[id] || "");
      toast({ title: "Baseline aprovada", description: "A baseline oficial agora é a mais recente aprovada." });
      setApprovalNotes((current) => ({ ...current, [id]: "" }));
      await reloadBaselineData(id);
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    }
  }

  async function handleRejectBaseline(id: number) {
    try {
      await api.rejectProjectBaseline(id, approvalNotes[id] || "");
      toast({ title: "Baseline rejeitada" });
      setApprovalNotes((current) => ({ ...current, [id]: "" }));
      await reloadBaselineData();
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    }
  }

  if (!selectedProject) {
    return (
      <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Selecione um projeto específico para gerenciar baselines, aprovações e visualizar a curva S semanal.
        </CardContent>
      </Card>
    );
  }

  const renderCurveChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={curveData?.points || []}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(value) => curveMetric === "cost" ? `R$${(value / 1000).toFixed(0)}k` : curveMetric === "progress" ? `${value}%` : `${value}h`}
        />
        <Tooltip
          contentStyle={curveTooltipStyle}
          formatter={(value: number, key: string) => [formatMetricValue(curveMetric, value), key === "planned" ? "Planejado" : key === "actual" ? "Realizado" : "Desvio"]}
          labelFormatter={(label) => `Semana de ${label}`}
        />
        <Legend />
        <Line type="monotone" dataKey="planned" name="Planejado" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="actual" name="Realizado" stroke="hsl(142, 71%, 40%)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="variance" name="Desvio" stroke="hsl(0, 78%, 45%)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.4fr]">
      <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GitBranchPlus size={16} className="text-primary" />
                <h3 className="text-sm font-display font-semibold text-foreground">Governança de Baselines</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                A baseline oficial é sempre a mais recente aprovada. Replanejamentos anteriores ficam preservados para histórico e comparação.
              </p>
            </div>
            {officialBaseline ? <Badge variant="default">Oficial: LB {String(officialBaseline.baselineNumber).padStart(2, "0")}</Badge> : <Badge variant="secondary">Sem baseline oficial</Badge>}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-border/70 bg-background/[0.60] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Projeto</p>
              <p className="mt-2 text-sm font-medium leading-6 text-foreground break-words [overflow-wrap:anywhere]">
                {selectedProject.projeto}
              </p>
              <p className="mt-1 text-xs font-mono leading-5 text-muted-foreground break-all">
                {selectedProject.projectId || "Sem código"}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/[0.60] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Baselines</p>
              <p className="mt-2 text-sm font-medium text-foreground">{loadingBaselines ? "Carregando..." : `${baselines.length} registradas`}</p>
              <p className="mt-1 text-xs text-muted-foreground">{pendingBaselines.length} pendentes de aprovação</p>
            </div>
          </div>

          {canWrite ? (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-background/[0.60] p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <h4 className="text-sm font-medium text-foreground">Criar nova baseline</h4>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Nome opcional da baseline" value={baselineName} onChange={(event) => setBaselineName(event.target.value)} />
                <Select value={baselineSourceType} onValueChange={(value) => setBaselineSourceType(value as ProjectBaseline["sourceType"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="replan">Reprogramação</SelectItem>
                    <SelectItem value="xml_import">Importação XML</SelectItem>
                    <SelectItem value="project_create">Criação do Projeto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                className="min-h-24"
                value={baselineJustification}
                onChange={(event) => setBaselineJustification(event.target.value)}
                placeholder={hasRole("pmo") ? "Justificativa obrigatória para solicitação do PMO" : "Justificativa do replanejamento ou contexto da baseline"}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">PMO cria baseline pendente. A baseline oficial passa a ser a mais recente aprovada.</p>
                <Button onClick={handleCreateBaseline} disabled={submittingBaseline}>
                  {submittingBaseline ? "Criando..." : "Criar baseline"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Histórico de baselines</h4>
              {loadingBaselines ? <span className="text-xs text-muted-foreground">Atualizando...</span> : null}
            </div>
            {baselines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                Nenhuma baseline criada para este projeto ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {baselines.map((baseline) => (
                  <div key={baseline.id} className="rounded-xl border border-border/70 bg-background/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{baseline.baselineName}</span>
                          <Badge variant={getStatusBadgeVariant(baseline.status)}>
                            {baseline.status === "approved" ? "Aprovada" : baseline.status === "pending_approval" ? "Pendente" : "Rejeitada"}
                          </Badge>
                          {baseline.isOfficial ? <Badge variant="outline">Oficial</Badge> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">Criada por {baseline.requestedByName || "Sistema"} em {formatDateTime(baseline.createdAt)}</p>
                        <p className="text-xs text-muted-foreground">Origem: {baseline.sourceType} · {baseline.taskCount} tarefas · esforço {baseline.totalPlannedEffort.toFixed(1)}h</p>
                        {baseline.justification ? <p className="text-xs text-muted-foreground">Justificativa: {baseline.justification}</p> : null}
                        {baseline.approvalNotes ? <p className="text-xs text-muted-foreground">Parecer: {baseline.approvalNotes}</p> : null}
                      </div>
                      {hasRole("admin") && baseline.status === "pending_approval" ? (
                        <div className="w-full space-y-2 md:w-80">
                          <Textarea
                            className="min-h-20"
                            placeholder="Parecer do administrador"
                            value={approvalNotes[baseline.id] || ""}
                            onChange={(event) => setApprovalNotes((current) => ({ ...current, [baseline.id]: event.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveBaseline(baseline.id)}>Aprovar</Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectBaseline(baseline.id)}>Rejeitar</Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/[0.92] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.42)]">
        <CardContent className="space-y-5 p-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 pr-3">
                <h3 className="text-sm font-display font-semibold text-foreground">Curva S Semanal</h3>
                <p className="max-w-xl text-sm text-muted-foreground">Compare baseline selecionada com a execução atual por esforço, custo ou progresso.</p>
              </div>
              <ChartPreviewModal
                title="Curva S Semanal"
                description="Visualização ampliada da comparação entre baseline e execução atual."
                renderChart={renderCurveChart}
                expandedHeight={640}
              />
            </div>
            <div className="flex flex-wrap items-end justify-end gap-3">
              <Select value={curveMetric} onValueChange={(value) => setCurveMetric(value as ProjectCurveSResponse["metric"])}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Métrica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="effort">Esforço</SelectItem>
                  <SelectItem value="cost">Custo</SelectItem>
                  <SelectItem value="progress">Progresso</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedBaselineId} onValueChange={setSelectedBaselineId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Baseline" />
                </SelectTrigger>
                <SelectContent>
                  {baselines.length === 0 ? <SelectItem value="none" disabled>Sem baseline disponível</SelectItem> : baselines.map((baseline) => (
                    <SelectItem key={baseline.id} value={String(baseline.id)}>
                      LB {String(baseline.baselineNumber).padStart(2, "0")} · {baseline.baselineName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {curveData?.baseline ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background/[0.60] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Baseline em comparação</p>
                <p className="mt-2 text-sm font-medium text-foreground">{curveData.baseline.baselineName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{curveData.baseline.isOfficial ? "Oficial" : "Histórica"} · {curveData.baseline.status}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/[0.60] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Planejado acumulado</p>
                <p className="mt-2 text-sm font-medium text-foreground">{formatMetricValue(curveMetric, curveData.summary.plannedTotal)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/[0.60] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Desvio acumulado</p>
                <p className={`mt-2 text-sm font-medium ${curveData.summary.varianceTotal >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatMetricValue(curveMetric, curveData.summary.varianceTotal)}
                </p>
              </div>
            </div>
          ) : null}

          {selectedBaselineId === "none" ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
              Crie ou selecione uma baseline para visualizar a curva S semanal deste projeto.
            </div>
          ) : loadingCurve ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
              Calculando curva S...
            </div>
          ) : curveData && curveData.points.length > 0 ? (
            renderCurveChart(360)
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
              Ainda não há dados suficientes para montar a curva S desta baseline.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
