import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { useData, formatCurrency } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Gauge, Users } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { getTaskResourceNames } from "@/utils/projectModel";

interface CapacityAssignment {
  resourceId?: number;
  resourceName: string;
  projeto: string;
  tarefa: string;
  units: number;
  work: number;
  actualWork: number;
  remainingWork: number;
  cost: number;
}

interface CapacityRow {
  id?: number;
  nome: string;
  funcao: string;
  seniority: string;
  capacityUnits: number;
  allocatedUnits: number;
  occupancyPct: number;
  overloadPct: number;
  plannedWork: number;
  actualWork: number;
  remainingWork: number;
  estimatedCost: number;
  taskCount: number;
  projectCount: number;
  businessUnits: string[];
  produtos: string[];
  projetos: string[];
}

function getStatusMeta(occupancyPct: number) {
  if (occupancyPct > 100) {
    return {
      label: "Sobrealocado",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    };
  }
  if (occupancyPct >= 80) {
    return {
      label: "Em atenção",
      className: "bg-warning/10 text-warning border-warning/20",
    };
  }
  if (occupancyPct > 0) {
    return {
      label: "Dentro da capacidade",
      className: "bg-success/10 text-success border-success/20",
    };
  }
  return {
    label: "Sem alocação",
    className: "bg-secondary text-secondary-foreground border-border",
  };
}

export default function CapacidadePage() {
  const { projetos, tarefas, recursos } = useData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [businessUnitFilter, setBusinessUnitFilter] = useState("all");
  const [produtoFilter, setProdutoFilter] = useState("all");

  const capacityRows = useMemo<CapacityRow[]>(() => {
    const projectMeta = new Map(
      projetos.map((projeto) => [
        projeto.projeto,
        {
          businessUnitName: projeto.businessUnitName || "Sem BU",
          produtoName: projeto.produtoName || "",
        },
      ]),
    );

    const normalizedAssignments: CapacityAssignment[] = tarefas.flatMap((task) => {
      if (task.assignments?.length) {
        return task.assignments.map((assignment) => ({
          resourceId: assignment.resourceId,
          resourceName: assignment.resourceName,
          projeto: task.projeto,
          tarefa: task.tarefa,
          units: Number(assignment.units || 0),
          work: Number(assignment.work || 0),
          actualWork: Number(assignment.actualWork || 0),
          remainingWork: Number(assignment.remainingWork || 0),
          cost: Number(assignment.cost || 0),
        }));
      }

      const names = getTaskResourceNames(task);
      if (!names.length) return [];
      const splitFactor = names.length;

      return names.map((resourceName) => ({
        resourceName,
        projeto: task.projeto,
        tarefa: task.tarefa,
        units: 1 / splitFactor,
        work: Number(task.esforcoPlanej || 0) / splitFactor,
        actualWork: Number(task.esforcoReal || 0) / splitFactor,
        remainingWork: Math.max(Number(task.esforcoPlanej || 0) - Number(task.esforcoReal || 0), 0) / splitFactor,
        cost: 0,
      }));
    });

    return recursos
      .filter((resource) => resource.nome !== "Cliente" && resource.nome !== "Key user-cliente")
      .map((resource) => {
        const assignments = normalizedAssignments.filter((assignment) => assignment.resourceName === resource.nome);
        const projetosEnvolvidos = Array.from(new Set(assignments.map((assignment) => assignment.projeto))).sort();
        const businessUnits = Array.from(new Set(
          projetosEnvolvidos
            .map((projectName) => projectMeta.get(projectName)?.businessUnitName || "Sem BU"),
        )).sort();
        const produtos = Array.from(new Set(
          projetosEnvolvidos
            .map((projectName) => projectMeta.get(projectName)?.produtoName || "")
            .filter(Boolean),
        )).sort();

        const capacityUnits = Number(resource.maxUnits || 1);
        const allocatedUnits = assignments.reduce((sum, assignment) => sum + Number(assignment.units || 0), 0);
        const plannedWork = assignments.reduce((sum, assignment) => sum + Number(assignment.work || 0), 0);
        const actualWork = assignments.reduce((sum, assignment) => sum + Number(assignment.actualWork || 0), 0);
        const remainingWork = assignments.reduce((sum, assignment) => sum + Number(assignment.remainingWork || 0), 0);
        const estimatedCost = assignments.reduce((sum, assignment) => {
          const explicitCost = Number(assignment.cost || 0);
          if (explicitCost > 0) return sum + explicitCost;
          return sum + (Number(assignment.work || 0) * Number(resource.standardRate || 0));
        }, 0);
        const occupancyPct = capacityUnits > 0 ? (allocatedUnits / capacityUnits) * 100 : 0;

        return {
          id: resource.id,
          nome: resource.nome,
          funcao: resource.funcao || "—",
          seniority: resource.seniority || "—",
          capacityUnits,
          allocatedUnits,
          occupancyPct,
          overloadPct: Math.max(occupancyPct - 100, 0),
          plannedWork,
          actualWork,
          remainingWork,
          estimatedCost,
          taskCount: assignments.length,
          projectCount: projetosEnvolvidos.length,
          businessUnits,
          produtos,
          projetos: projetosEnvolvidos,
        };
      })
      .filter((row) => {
        if (search) {
          const text = `${row.nome} ${row.funcao} ${row.seniority} ${row.projetos.join(" ")} ${row.produtos.join(" ")}`.toLowerCase();
          if (!text.includes(search.toLowerCase())) return false;
        }
        if (statusFilter === "critical" && row.occupancyPct <= 100) return false;
        if (statusFilter === "attention" && (row.occupancyPct < 80 || row.occupancyPct > 100)) return false;
        if (statusFilter === "balanced" && !(row.occupancyPct > 0 && row.occupancyPct < 80)) return false;
        if (statusFilter === "idle" && row.occupancyPct !== 0) return false;
        if (businessUnitFilter !== "all" && !row.businessUnits.includes(businessUnitFilter)) return false;
        if (produtoFilter !== "all" && !row.produtos.includes(produtoFilter)) return false;
        return true;
      })
      .sort((a, b) => b.occupancyPct - a.occupancyPct || b.plannedWork - a.plannedWork);
  }, [projetos, tarefas, recursos, search, statusFilter, businessUnitFilter, produtoFilter]);

  const businessUnitOptions = useMemo(
    () => Array.from(new Set(projetos.map((item) => item.businessUnitName || "Sem BU"))).filter(Boolean).sort(),
    [projetos],
  );
  const produtoOptions = useMemo(
    () => Array.from(new Set(projetos.map((item) => item.produtoName || "").filter(Boolean))).sort(),
    [projetos],
  );

  const overallocatedCount = capacityRows.filter((item) => item.occupancyPct > 100).length;
  const attentionCount = capacityRows.filter((item) => item.occupancyPct >= 80 && item.occupancyPct <= 100).length;
  const averageOccupancy = capacityRows.length
    ? capacityRows.reduce((sum, item) => sum + item.occupancyPct, 0) / capacityRows.length
    : 0;
  const chartData = capacityRows.slice(0, 8).map((item) => ({
    nome: item.nome.split(" ").slice(0, 2).join(" "),
    ocupacao: Number(item.occupancyPct.toFixed(1)),
  }));

  return (
    <div className="flex flex-col">
      <Header title="Capacidade" />
      <div className="space-y-6 p-6 animate-fade-in">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            placeholder="Buscar recurso, função, projeto ou produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Situação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              <SelectItem value="critical">Sobrealocados</SelectItem>
              <SelectItem value="attention">Em atenção</SelectItem>
              <SelectItem value="balanced">Dentro da capacidade</SelectItem>
              <SelectItem value="idle">Sem alocação</SelectItem>
            </SelectContent>
          </Select>
          <Select value={businessUnitFilter} onValueChange={setBusinessUnitFilter}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Unidade de negócio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as unidades</SelectItem>
              {businessUnitOptions.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={produtoFilter} onValueChange={setProdutoFilter}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {produtoOptions.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border border-border">
            <CardContent className="flex items-center gap-3 p-4">
              <Users className="text-info" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Recursos analisados</p>
                <p className="text-xl font-display font-bold text-foreground">{capacityRows.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle className="text-destructive" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Sobrealocados</p>
                <p className="text-xl font-display font-bold text-destructive">{overallocatedCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="flex items-center gap-3 p-4">
              <Gauge className="text-warning" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Em atenção</p>
                <p className="text-xl font-display font-bold text-warning">{attentionCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="text-success" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Ocupação média</p>
                <p className="text-xl font-display font-bold text-foreground">{Math.round(averageOccupancy)}%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-display font-semibold text-foreground">Ocupação por recurso</h3>
                <p className="text-xs text-muted-foreground">Percentual alocado em relação à capacidade máxima cadastrada.</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Ocupação"]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Bar dataKey="ocupacao" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {capacityRows.map((row) => {
            const status = getStatusMeta(row.occupancyPct);
            return (
              <Card key={row.id || row.nome} className="border border-border hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-display font-bold text-foreground">{row.nome}</h3>
                        <Badge variant="outline">{row.funcao}</Badge>
                        <Badge variant="outline">{row.seniority}</Badge>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <span>Capacidade cadastrada: <strong className="text-foreground">{Math.round(row.capacityUnits * 100)}%</strong></span>
                        <span>Capacidade alocada: <strong className="text-foreground">{Math.round(row.allocatedUnits * 100)}%</strong></span>
                        <span>Projetos ativos: <strong className="text-foreground">{row.projectCount}</strong></span>
                        <span>Tarefas com alocação: <strong className="text-foreground">{row.taskCount}</strong></span>
                        <span>Custo estimado: <strong className="text-foreground">{formatCurrency(row.estimatedCost)}</strong></span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={Math.min(row.occupancyPct, 100)} className="h-2 flex-1" />
                        <span className={`text-xs font-medium ${row.occupancyPct > 100 ? "text-destructive" : "text-muted-foreground"}`}>
                          {Math.round(row.occupancyPct)}%
                        </span>
                      </div>
                    </div>

                    <div className="grid min-w-[260px] grid-cols-2 gap-3 text-center">
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Esforço previsto</p>
                        <p className="text-lg font-display font-bold text-foreground">{row.plannedWork.toFixed(1)}h</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Esforço realizado</p>
                        <p className="text-lg font-display font-bold text-foreground">{row.actualWork.toFixed(1)}h</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Esforço restante</p>
                        <p className="text-lg font-display font-bold text-foreground">{row.remainingWork.toFixed(1)}h</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Excesso sobre capacidade</p>
                        <p className={`text-lg font-display font-bold ${row.overloadPct > 0 ? "text-destructive" : "text-success"}`}>
                          {Math.round(row.overloadPct)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Unidades de negócio: <strong className="text-foreground">{row.businessUnits.join(", ") || "—"}</strong></span>
                    <span>Produtos: <strong className="text-foreground">{row.produtos.join(", ") || "—"}</strong></span>
                    <span>Projetos: <strong className="text-foreground">{row.projetos.join(", ") || "—"}</strong></span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
