import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { useData } from "@/contexts/DataContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { getTaskResourceLabel, getTaskResourceNames } from "@/utils/projectModel";

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

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_COLORS: Record<string, string> = {
  "Atrasado": "bg-destructive",
  "Em andamento": "bg-warning",
  "Não iniciado": "bg-muted-foreground/40",
  "Concluído": "bg-success",
};

export default function GanttPage() {
  const { tarefas, getUniqueProjetos, getUniqueResponsaveis } = useData();
  const [filterResponsavel, setFilterResponsavel] = useState<string>("all");
  const [filterProjeto, setFilterProjeto] = useState<string>("all");

  const responsaveis = useMemo(() => getUniqueResponsaveis(), [getUniqueResponsaveis]);
  const projetosUnicos = useMemo(() => getUniqueProjetos(), [getUniqueProjetos]);

  const filtered = useMemo(() => {
    return tarefas.filter(t => {
      const start = parseDate(t.dataInicioPlanej);
      if (!start) return false;
      if (filterProjeto !== "all" && t.projeto !== filterProjeto) return false;
      if (filterResponsavel !== "all" && !getTaskResourceNames(t).includes(filterResponsavel)) return false;
      return true;
    });
  }, [tarefas, filterResponsavel, filterProjeto]);

  const { minDate, maxDate, totalDays } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    filtered.forEach(t => {
      const start = parseDate(t.dataInicioPlanej);
      const end = parseDate(t.dataFimPlanej) || start;
      if (start) min = Math.min(min, start.getTime());
      if (end) max = Math.max(max, end.getTime());
    });
    if (!isFinite(min)) {
      const now = new Date();
      return { minDate: now, maxDate: new Date(now.getTime() + 30 * 86400000), totalDays: 30 };
    }
    const minD = new Date(min);
    const maxD = new Date(max);
    const total = Math.max(daysBetween(minD, maxD), 1);
    return { minDate: minD, maxDate: maxD, totalDays: total };
  }, [filtered]);

  const months = useMemo(() => {
    const result: { label: string; startPct: number; widthPct: number }[] = [];
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) {
      const monthStart = Math.max(0, daysBetween(minDate, cur));
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const monthEnd = Math.min(totalDays, daysBetween(minDate, nextMonth));
      result.push({
        label: cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        startPct: (monthStart / totalDays) * 100,
        widthPct: ((monthEnd - monthStart) / totalDays) * 100,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  }, [minDate, maxDate, totalDays]);

  return (
    <div className="flex flex-col">
      <Header title="Gantt" />
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="flex flex-wrap gap-3">
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
        </div>

        <Card className="border border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className="relative h-8 bg-muted/50 border-b border-border flex">
                  <div className="w-48 shrink-0 px-3 flex items-center text-xs font-semibold text-muted-foreground border-r border-border">Projeto</div>
                  <div className="w-72 shrink-0 px-3 flex items-center text-xs font-semibold text-muted-foreground border-r border-border">Tarefa</div>
                  <div className="flex-1 relative">
                    {months.map((m, i) => (
                      <div key={i} className="absolute top-0 h-full flex items-center justify-center text-[10px] font-medium text-muted-foreground border-r border-border/50" style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}>
                        {m.label}
                      </div>
                    ))}
                  </div>
                </div>

                {filtered.map(t => {
                  const start = parseDate(t.dataInicioPlanej)!;
                  const end = parseDate(t.dataFimPlanej) || start;
                  const left = (daysBetween(minDate, start) / totalDays) * 100;
                  const width = Math.max((daysBetween(start, end) / totalDays) * 100, 0.5);
                  const barColor = STATUS_COLORS[t.status] || "bg-muted-foreground";

                  return (
                    <div key={t.id} className="relative flex h-8 hover:bg-muted/30 transition-colors border-b border-border/30 group">
                      <div className="w-48 shrink-0 px-3 flex items-center text-xs border-r border-border/50 overflow-hidden">
                        <span className="truncate text-foreground">{t.projeto}</span>
                      </div>
                      <div className="w-72 shrink-0 px-3 flex items-center gap-2 text-xs border-r border-border/50 overflow-hidden">
                        <span className="font-mono text-muted-foreground/60 w-8">{t.id}</span>
                        <span className="truncate text-foreground">{t.tarefa}</span>
                      </div>
                      <div className="flex-1 relative">
                      <div className={`absolute top-1.5 h-5 rounded-sm ${barColor} opacity-80 group-hover:opacity-100 transition-opacity`} style={{ left: `${left}%`, width: `${width}%`, minWidth: "4px" }} title={`${t.tarefa} | ${getTaskResourceLabel(t)} | ${t.status}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4 text-xs text-muted-foreground">
          {Object.entries(STATUS_COLORS).map(([status, cls]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} />
              {status}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
