import { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/contexts/DataContext";
import { CalendarDays, Check, FileDown, GitBranchPlus, Plus, Save, ShieldCheck, Trash2, Upload, X } from "lucide-react";
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

function getManualStatusBadgeVariant(status: api.ManualCurveSSeries["status"]) {
  if (status === "approved") return "default";
  if (status === "pending_approval") return "secondary";
  if (status === "draft") return "outline";
  return "destructive";
}

function buildCurveTooltipStyle() {
  return { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" };
}

function formatIsoDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}

function normalizePercentInput(value: string) {
  const normalized = String(value || "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function normalizeTemplatePercent(value: unknown) {
  if (value == null || value === "") return "";
  const raw = typeof value === "object" && value && "result" in value ? (value as { result: unknown }).result : value;
  const parsed = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(parsed)) return "";
  const percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return String(Math.min(100, Math.max(0, Number(percent.toFixed(2)))));
}

function normalizeTemplateDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 1 && value < 200000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 86400000).toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return "";
  let month = Number(slash[1]);
  let day = Number(slash[2]);
  let year = Number(slash[3]);
  if (Number(slash[1]) > 12) {
    day = Number(slash[1]);
    month = Number(slash[2]);
  }
  if (year < 100) year += 2000;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeTemplateHeader(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MANUAL_CURVE_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(262, 83%, 68%)",
  "hsl(189, 94%, 43%)",
  "hsl(32, 95%, 55%)",
  "hsl(339, 82%, 62%)",
  "hsl(142, 71%, 40%)",
  "hsl(0, 78%, 45%)",
  "hsl(45, 93%, 47%)",
  "hsl(199, 89%, 48%)",
  "hsl(160, 84%, 39%)",
  "hsl(0, 0%, 70%)",
];

export default function BaselineGovernancePanel({ selectedProject }: BaselineGovernancePanelProps) {
  const { canWrite, hasRole } = useAuth();
  const { toast } = useToast();
  const manualImportInputRef = useRef<HTMLInputElement | null>(null);
  const [curveMetric, setCurveMetric] = useState<ProjectCurveSResponse["metric"]>("effort");
  const [selectedBaselineId, setSelectedBaselineId] = useState("none");
  const [baselineName, setBaselineName] = useState("");
  const [baselineSourceType, setBaselineSourceType] = useState<ProjectBaseline["sourceType"]>("manual");
  const [baselineJustification, setBaselineJustification] = useState("");
  const [approvalNotes, setApprovalNotes] = useState<Record<number, string>>({});
  const [baselines, setBaselines] = useState<ProjectBaseline[]>([]);
  const [curveData, setCurveData] = useState<ProjectCurveSResponse | null>(null);
  const [manualCurve, setManualCurve] = useState<api.ManualCurveSResponse | null>(null);
  const [manualPointValues, setManualPointValues] = useState<Record<string, string>>({});
  const [manualObservations, setManualObservations] = useState<Record<string, string>>({});
  const [manualApprovalNotes, setManualApprovalNotes] = useState<Record<number, string>>({});
  const [manualCustomDates, setManualCustomDates] = useState<string[]>([]);
  const [newManualDate, setNewManualDate] = useState("");
  const [loadingBaselines, setLoadingBaselines] = useState(false);
  const [loadingCurve, setLoadingCurve] = useState(false);
  const [loadingManualCurve, setLoadingManualCurve] = useState(false);
  const [submittingBaseline, setSubmittingBaseline] = useState(false);
  const [savingManualCurve, setSavingManualCurve] = useState(false);

  const officialBaseline = useMemo(
    () => baselines.find((baseline) => baseline.isOfficial) || null,
    [baselines]
  );
  const pendingBaselines = useMemo(
    () => baselines.filter((baseline) => baseline.status === "pending_approval"),
    [baselines]
  );
  const curveTooltipStyle = useMemo(() => buildCurveTooltipStyle(), []);
  const manualSeries = useMemo(() => {
    if (!manualCurve) return [];
    return manualCurve.series.slice().sort((a, b) => {
      if (a.seriesType !== b.seriesType) return a.seriesType === "baseline" ? -1 : 1;
      return a.baselineNumber - b.baselineNumber;
    });
  }, [manualCurve]);
  const manualRows = useMemo(() => {
    if (!manualCurve) return [];
    const dates = new Set<string>(manualCurve.defaultDates);
    manualCustomDates.forEach((date) => dates.add(date));
    manualCurve.points.forEach((point) => point.date && dates.add(point.date));
    manualCurve.observations.forEach((item) => item.date && dates.add(item.date));
    return Array.from(dates).sort();
  }, [manualCurve, manualCustomDates]);
  const manualChartData = useMemo(() => {
    return manualRows.map((date) => {
      const row: Record<string, string | number> = { date, label: formatIsoDate(date) };
      manualSeries.forEach((series) => {
        row[`series-${series.id}`] = normalizePercentInput(manualPointValues[`${series.id}:${date}`] || "0");
      });
      return row;
    });
  }, [manualPointValues, manualRows, manualSeries]);
  const nextManualBaselineNumber = useMemo(() => {
    const used = new Set(manualSeries.filter((series) => series.seriesType === "baseline").map((series) => series.baselineNumber));
    for (let index = 1; index <= (manualCurve?.limits.maxBaselines || 10); index += 1) {
      if (!used.has(index)) return index;
    }
    return 0;
  }, [manualCurve?.limits.maxBaselines, manualSeries]);
  const hasActualSeries = manualSeries.some((series) => series.seriesType === "actual");

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

  useEffect(() => {
    async function loadManualCurve() {
      if (!selectedProject) {
        setManualCurve(null);
        setManualPointValues({});
        setManualObservations({});
        return;
      }
      setLoadingManualCurve(true);
      try {
        const response = await api.getManualCurveS(selectedProject.id);
        setManualCurve(response);
        setManualCustomDates([]);
        const points: Record<string, string> = {};
        response.points.forEach((point) => {
          if (point.seriesId && point.date) points[`${point.seriesId}:${point.date}`] = String(point.percent ?? 0);
        });
        const observations: Record<string, string> = {};
        response.observations.forEach((item) => {
          if (item.date) observations[item.date] = item.observation || "";
        });
        setManualPointValues(points);
        setManualObservations(observations);
      } catch (error) {
        toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
      } finally {
        setLoadingManualCurve(false);
      }
    }
    loadManualCurve();
  }, [selectedProject, toast]);

  async function reloadManualCurve() {
    if (!selectedProject) return;
    const response = await api.getManualCurveS(selectedProject.id);
    setManualCurve(response);
    setManualCustomDates([]);
    const points: Record<string, string> = {};
    response.points.forEach((point) => {
      if (point.seriesId && point.date) points[`${point.seriesId}:${point.date}`] = String(point.percent ?? 0);
    });
    const observations: Record<string, string> = {};
    response.observations.forEach((item) => {
      if (item.date) observations[item.date] = item.observation || "";
    });
    setManualPointValues(points);
    setManualObservations(observations);
  }

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

  async function handleCreateManualSeries(seriesType: api.ManualCurveSSeries["seriesType"]) {
    if (!selectedProject) return;
    const baselineNumber = seriesType === "actual" ? 0 : nextManualBaselineNumber;
    if (seriesType === "baseline" && !baselineNumber) {
      toast({ title: "Limite atingido", description: "O projeto já possui 10 linhas base manuais.", variant: "destructive" });
      return;
    }
    setSavingManualCurve(true);
    try {
      const created = await api.createManualCurveSSeries({
        projectId: selectedProject.id,
        seriesType,
        baselineNumber,
        seriesName: seriesType === "actual" ? "Realizado" : `Linha Base ${baselineNumber}`,
        justification: seriesType === "baseline" ? "Criação manual pela Curva S" : "",
      });
      toast({
        title: seriesType === "actual" ? "Realizado criado" : "Linha base criada",
        description: created.status === "pending_approval" ? "A linha base aguarda aprovação do administrador." : undefined,
      });
      await reloadManualCurve();
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingManualCurve(false);
    }
  }

  async function handleSaveManualCurve() {
    if (!selectedProject || !manualCurve) return;
    setSavingManualCurve(true);
    try {
      for (const series of manualSeries) {
        const points = manualRows.map((date) => ({
          date,
          percent: normalizePercentInput(manualPointValues[`${series.id}:${date}`] || "0"),
        }));
        await api.saveManualCurveSPoints(series.id, points);
      }
      await api.saveManualCurveSObservations(selectedProject.id, manualRows.map((date) => ({
        date,
        observation: (manualObservations[date] || "").slice(0, manualCurve.limits.observationMaxLength),
      })));
      toast({ title: "Curva S manual salva" });
      await reloadManualCurve();
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingManualCurve(false);
    }
  }

  async function handleApproveManualSeries(seriesId: number) {
    try {
      await api.approveManualCurveSSeries(seriesId, manualApprovalNotes[seriesId] || "");
      toast({ title: "Linha base manual aprovada" });
      setManualApprovalNotes((current) => ({ ...current, [seriesId]: "" }));
      await reloadManualCurve();
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    }
  }

  async function handleRejectManualSeries(seriesId: number) {
    try {
      await api.rejectManualCurveSSeries(seriesId, manualApprovalNotes[seriesId] || "");
      toast({ title: "Linha base manual rejeitada" });
      setManualApprovalNotes((current) => ({ ...current, [seriesId]: "" }));
      await reloadManualCurve();
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    }
  }

  function handleAddManualDate() {
    if (!newManualDate) return;
    setManualCustomDates((current) => Array.from(new Set([...current, newManualDate])).sort());
    setNewManualDate("");
  }

  async function handleDeleteManualDate(date: string) {
    if (!selectedProject) return;
    setSavingManualCurve(true);
    try {
      await api.deleteManualCurveSDate(selectedProject.id, date);
      setManualCustomDates((current) => current.filter((item) => item !== date));
      setManualPointValues((current) => {
        const next = { ...current };
        manualSeries.forEach((series) => delete next[`${series.id}:${date}`]);
        return next;
      });
      setManualObservations((current) => {
        const next = { ...current };
        delete next[date];
        return next;
      });
      toast({ title: "Data removida da Curva S" });
      await reloadManualCurve();
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingManualCurve(false);
    }
  }

  async function handleDeleteManualSeries(seriesId: number) {
    setSavingManualCurve(true);
    try {
      await api.deleteManualCurveSSeries(seriesId);
      toast({ title: "Série removida da Curva S" });
      await reloadManualCurve();
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingManualCurve(false);
    }
  }

  async function handleImportManualCurveTemplate(file?: File | null) {
    if (!selectedProject || !file) return;
    setSavingManualCurve(true);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets.find((item) => item.rowCount > 0);
      if (!sheet) throw new Error("Planilha sem dados para importar");

      const headers = sheet.getRow(1).values as unknown[];
      const dataColumn = headers.findIndex((header) => normalizeTemplateHeader(header) === "data");
      if (dataColumn <= 0) throw new Error("Coluna data é obrigatória no template");

      const baselineColumns: Array<{ column: number; baselineNumber: number; label: string }> = [];
      let actualColumn = 0;
      let observationColumn = 0;
      headers.forEach((header, index) => {
        const normalized = normalizeTemplateHeader(header);
        const baselineMatch = normalized.match(/^linha base (\d+)$/);
        if (baselineMatch) {
          const baselineNumber = Number(baselineMatch[1]);
          if (baselineNumber >= 1 && baselineNumber <= (manualCurve?.limits.maxBaselines || 10)) {
            baselineColumns.push({ column: index, baselineNumber, label: String(header || `Linha Base ${baselineNumber}`) });
          }
        }
        if (["real", "realizado"].includes(normalized)) actualColumn = index;
        if (["obs", "observacao"].includes(normalized)) observationColumn = index;
      });

      if (!baselineColumns.length && !actualColumn) throw new Error("Informe ao menos uma Linha Base ou Realizado no template");

      const rows: Array<{ date: string; values: Record<number, string>; actual?: string; observation: string }> = [];
      for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
        const row = sheet.getRow(rowIndex);
        const date = normalizeTemplateDate(row.getCell(dataColumn).value);
        if (!date) continue;
        const values: Record<number, string> = {};
        baselineColumns.forEach((item) => {
          const percent = normalizeTemplatePercent(row.getCell(item.column).value);
          if (percent !== "") values[item.baselineNumber] = percent;
        });
        const actual = actualColumn ? normalizeTemplatePercent(row.getCell(actualColumn).value) : "";
        const observation = observationColumn ? String(row.getCell(observationColumn).text || row.getCell(observationColumn).value || "").slice(0, manualCurve?.limits.observationMaxLength || 255) : "";
        rows.push({ date, values, actual: actual || undefined, observation });
      }
      if (!rows.length) throw new Error("Nenhuma data válida encontrada no template");

      let response = manualCurve || await api.getManualCurveS(selectedProject.id);
      const ensureSeries = async (seriesType: api.ManualCurveSSeries["seriesType"], baselineNumber: number, seriesName: string) => {
        const existing = response.series.find((series) => series.seriesType === seriesType && series.baselineNumber === baselineNumber);
        if (existing) return existing;
        const created = await api.createManualCurveSSeries({ projectId: selectedProject.id, seriesType, baselineNumber, seriesName, justification: "Importação do template Curva S" });
        response = await api.getManualCurveS(selectedProject.id);
        return created;
      };

      for (const column of baselineColumns) {
        const series = await ensureSeries("baseline", column.baselineNumber, `Linha Base ${column.baselineNumber}`);
        await api.saveManualCurveSPoints(series.id, rows.map((row) => ({ date: row.date, percent: normalizePercentInput(row.values[column.baselineNumber] || "0") })));
      }
      if (actualColumn) {
        const actualSeries = await ensureSeries("actual", 0, "Realizado");
        await api.saveManualCurveSPoints(actualSeries.id, rows.map((row) => ({ date: row.date, percent: normalizePercentInput(row.actual || "0") })));
      }
      await api.saveManualCurveSObservations(selectedProject.id, rows.map((row) => ({ date: row.date, observation: row.observation })));
      toast({ title: "Template da Curva S importado" });
      await reloadManualCurve();
    } catch (error) {
      toast({ title: "Erro ao importar Curva S", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingManualCurve(false);
      if (manualImportInputRef.current) manualImportInputRef.current.value = "";
    }
  }

  async function handleExportManualCurveTemplate() {
    if (!selectedProject) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Curva S");
    const baselineSeries = manualSeries.filter((series) => series.seriesType === "baseline");
    const actualSeries = manualSeries.find((series) => series.seriesType === "actual");
    sheet.addRow([
      "data",
      ...baselineSeries.map((series) => `Linha Base ${series.baselineNumber}`),
      "Real",
      "OBS",
    ]);
    manualRows.forEach((date) => {
      sheet.addRow([
        date,
        ...baselineSeries.map((series) => normalizePercentInput(manualPointValues[`${series.id}:${date}`] || "0") / 100),
        actualSeries ? normalizePercentInput(manualPointValues[`${actualSeries.id}:${date}`] || "0") / 100 : 0,
        manualObservations[date] || "",
      ]);
    });
    sheet.getColumn(1).numFmt = "dd/mm/yyyy";
    for (let columnIndex = 2; columnIndex <= sheet.columnCount - 1; columnIndex += 1) {
      sheet.getColumn(columnIndex).numFmt = "0.00%";
    }
    sheet.columns.forEach((column) => {
      column.width = column.number === sheet.columnCount ? 42 : 18;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curva-s-${selectedProject.projeto.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
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

  const renderManualCurveChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={manualChartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
        <Tooltip
          contentStyle={curveTooltipStyle}
          formatter={(value: number, key: string) => {
            const series = manualSeries.find((item) => `series-${item.id}` === key);
            return [`${Number(value).toFixed(1)}%`, series?.seriesName || key];
          }}
          labelFormatter={(label) => `Semana de ${label}`}
        />
        <Legend />
        {manualSeries.map((series, index) => (
          <Line
            key={series.id}
            type="monotone"
            dataKey={`series-${series.id}`}
            name={series.seriesName}
            stroke={MANUAL_CURVE_COLORS[index % MANUAL_CURVE_COLORS.length]}
            strokeWidth={series.seriesType === "actual" ? 3 : 2}
            strokeDasharray={series.status === "pending_approval" ? "5 5" : undefined}
            dot={false}
          />
        ))}
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
          <Tabs defaultValue="automatic" className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 pr-3">
                <h3 className="text-sm font-display font-semibold text-foreground">Curva S Semanal</h3>
                <p className="max-w-xl text-sm text-muted-foreground">Compare a curva calculada pelo cronograma com a curva gerencial manual.</p>
              </div>
              <TabsList>
                <TabsTrigger value="automatic">Automática</TabsTrigger>
                <TabsTrigger value="manual">Manual</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="automatic" className="space-y-5">
              <div className="flex flex-wrap items-end justify-end gap-3">
                <ChartPreviewModal
                  title="Curva S Semanal"
                  description="Visualização ampliada da comparação entre baseline e execução atual."
                  renderChart={renderCurveChart}
                  expandedHeight={640}
                />
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
            </TabsContent>

            <TabsContent value="manual" className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={16} className="text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Curva S manual</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">Datas semanais do projeto, linhas base manuais, realizado e observações sucintas.</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <ChartPreviewModal
                    title="Curva S Manual"
                    description="Visualização ampliada das linhas base manuais e do realizado."
                    renderChart={renderManualCurveChart}
                    expandedHeight={640}
                  />
                  {canWrite ? (
                    <>
                      <input
                        ref={manualImportInputRef}
                        type="file"
                        accept=".xlsx,.xlsm"
                        className="hidden"
                        onChange={(event) => handleImportManualCurveTemplate(event.target.files?.[0])}
                      />
                      <Button size="sm" variant="outline" disabled={savingManualCurve} onClick={() => manualImportInputRef.current?.click()} className="gap-1.5">
                        <Upload size={14} /> Importar
                      </Button>
                      <Button size="sm" variant="outline" disabled={savingManualCurve || manualRows.length === 0} onClick={handleExportManualCurveTemplate} className="gap-1.5">
                        <FileDown size={14} /> Exportar
                      </Button>
                      <Input
                        type="date"
                        value={newManualDate}
                        onChange={(event) => setNewManualDate(event.target.value)}
                        className="h-9 w-40"
                      />
                      <Button size="sm" variant="outline" disabled={savingManualCurve || !newManualDate} onClick={handleAddManualDate} className="gap-1.5">
                        <CalendarDays size={14} /> Data
                      </Button>
                      <Button size="sm" variant="outline" disabled={savingManualCurve || !nextManualBaselineNumber} onClick={() => handleCreateManualSeries("baseline")} className="gap-1.5">
                        <Plus size={14} /> Linha Base
                      </Button>
                      <Button size="sm" variant="outline" disabled={savingManualCurve || hasActualSeries} onClick={() => handleCreateManualSeries("actual")} className="gap-1.5">
                        <Plus size={14} /> Realizado
                      </Button>
                      <Button size="sm" disabled={savingManualCurve || manualSeries.length === 0} onClick={handleSaveManualCurve} className="gap-1.5">
                        <Save size={14} /> Salvar
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {loadingManualCurve ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
                  Carregando Curva S manual...
                </div>
              ) : manualSeries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
                  Crie a Linha Base 1 e a série Realizado para iniciar a Curva S manual.
                </div>
              ) : (
                <>
                  {manualChartData.length > 0 ? renderManualCurveChart(320) : null}
                  <div className="rounded-xl border border-border/80 bg-background/[0.50]">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[980px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-40">Data</TableHead>
                            {manualSeries.map((series) => (
                              <TableHead key={series.id} className="min-w-36">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 flex-col gap-1">
                                    <span className="truncate">{series.seriesName}</span>
                                    <Badge variant={getManualStatusBadgeVariant(series.status)} className="w-fit">
                                      {series.status === "approved" ? "Aprovada" : series.status === "pending_approval" ? "Pendente" : series.status === "draft" ? "Rascunho" : "Rejeitada"}
                                    </Badge>
                                  </div>
                                  {canWrite ? (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 shrink-0 text-destructive"
                                      title="Excluir série"
                                      onClick={() => handleDeleteManualSeries(series.id)}
                                      disabled={savingManualCurve}
                                    >
                                      <Trash2 size={13} />
                                    </Button>
                                  ) : null}
                                </div>
                              </TableHead>
                            ))}
                            <TableHead className="min-w-72">Observação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {manualRows.map((date) => (
                            <TableRow key={date}>
                              <TableCell className="text-xs font-medium text-muted-foreground">
                                <div className="flex items-center justify-between gap-2">
                                  <span>{formatIsoDate(date)}</span>
                                  {canWrite ? (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-destructive"
                                      title="Remover data"
                                      onClick={() => handleDeleteManualDate(date)}
                                      disabled={savingManualCurve}
                                    >
                                      <Trash2 size={13} />
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                              {manualSeries.map((series) => (
                                <TableCell key={`${series.id}:${date}`}>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.1"
                                    disabled={!canWrite || series.status === "rejected"}
                                    value={manualPointValues[`${series.id}:${date}`] || ""}
                                    onChange={(event) => setManualPointValues((current) => ({ ...current, [`${series.id}:${date}`]: event.target.value }))}
                                    className="h-9"
                                  />
                                </TableCell>
                              ))}
                              <TableCell>
                                <Input
                                  maxLength={manualCurve?.limits.observationMaxLength || 255}
                                  disabled={!canWrite}
                                  value={manualObservations[date] || ""}
                                  onChange={(event) => setManualObservations((current) => ({ ...current, [date]: event.target.value.slice(0, manualCurve?.limits.observationMaxLength || 255) }))}
                                  className="h-9"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {hasRole("admin") && manualSeries.some((series) => series.status === "pending_approval") ? (
                    <div className="space-y-3 rounded-xl border border-border/80 bg-background/[0.50] p-4">
                      <h4 className="text-sm font-medium text-foreground">Aprovação de linhas base manuais</h4>
                      {manualSeries.filter((series) => series.status === "pending_approval").map((series) => (
                        <div key={series.id} className="grid gap-2 rounded-lg border border-border/70 bg-card/60 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{series.seriesName}</p>
                            <p className="text-xs text-muted-foreground">Criada por {series.createdByName || "Sistema"} em {formatDateTime(series.createdAt)}</p>
                            <Textarea
                              className="mt-2 min-h-16"
                              placeholder="Parecer do administrador"
                              value={manualApprovalNotes[series.id] || ""}
                              onChange={(event) => setManualApprovalNotes((current) => ({ ...current, [series.id]: event.target.value }))}
                            />
                          </div>
                          <div className="flex items-end gap-2">
                            <Button size="sm" onClick={() => handleApproveManualSeries(series.id)} className="gap-1.5"><Check size={14} /> Aprovar</Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectManualSeries(series.id)} className="gap-1.5"><X size={14} /> Rejeitar</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
