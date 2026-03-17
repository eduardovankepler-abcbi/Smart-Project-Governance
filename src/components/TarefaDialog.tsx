import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tarefa } from "@/data/projectData";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import { useData } from "@/contexts/DataContext";
import { getTaskPredecessorLabel, getTaskResourceLabel } from "@/utils/projectModel";

interface TarefaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarefa?: Tarefa | null;
  defaultParentId?: string;
  defaultProjeto?: string;
  mode?: "task" | "subtask";
}

const STATUS_OPTIONS = ["Atrasado", "Em andamento", "Não iniciado", "Concluído"];
const TASK_TYPE_OPTIONS = [
  { value: "fixed_units", label: "Unidades Fixas" },
  { value: "fixed_duration", label: "Duração Fixa" },
  { value: "fixed_work", label: "Trabalho Fixo" },
];

const emptyTarefa: Tarefa = {
  id: "", parentId: "", projeto: "", tarefa: "", subtarefa: "", responsavel: "", funcao: "",
  dataInicioPlanej: "", esforcoPlanej: 0, dataFimPlanej: "", dataInicioReal: "",
  esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Não iniciado",
  taskType: "fixed_units", milestone: false, durationMinutes: 0, isManual: false,
  constraintType: "", constraintDate: "", notes: "",
  valorPrevisto: 0, valorGasto: 0, diasPlanejados: 0, diasReal: 0, diasCompletados: 0,
  assignments: [], predecessors: [],
};

function getDepth(id: string): number {
  return id.split(".").length - 1;
}

function generateNextChildId(parentId: string, existingTarefas: Tarefa[]): string {
  const children = existingTarefas.filter((item) => item.parentId === parentId);
  const maxSeq = children.reduce((max, child) => {
    const parts = child.id.split(".");
    const lastPart = parseInt(parts[parts.length - 1]) || 0;
    return Math.max(max, lastPart);
  }, 0);
  return `${parentId}.${maxSeq + 1}`;
}

export default function TarefaDialog({ open, onOpenChange, tarefa, defaultParentId, defaultProjeto, mode = defaultParentId ? "subtask" : "task" }: TarefaDialogProps) {
  const isEdit = !!tarefa;
  const { refreshTarefas, tarefas, recursos, setTarefas, getUniqueProjetos } = useData();
  const { toast } = useToast();
  const [resourceInput, setResourceInput] = useState("");
  const [predecessorInput, setPredecessorInput] = useState("");

  const initialForm = (): Tarefa => {
    if (tarefa) return { ...emptyTarefa, ...tarefa };
    const form = { ...emptyTarefa };
    if (defaultProjeto) form.projeto = defaultProjeto;
    if (defaultParentId) {
      form.parentId = defaultParentId;
      form.id = generateNextChildId(defaultParentId, tarefas);
      const parent = tarefas.find((item) => item.id === defaultParentId);
      if (parent) form.projeto = parent.projeto;
    }
    return form;
  };

  const [form, setForm] = useState<Tarefa>(initialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextForm = initialForm();
    setForm(nextForm);
    setResourceInput(getTaskResourceLabel(nextForm));
    setPredecessorInput(getTaskPredecessorLabel(nextForm));
  }, [open, tarefa, defaultParentId, defaultProjeto, mode]);

  const handleOpenChange = (value: boolean) => {
    if (value) {
      const nextForm = initialForm();
      setForm(nextForm);
      setResourceInput(getTaskResourceLabel(nextForm));
      setPredecessorInput(getTaskPredecessorLabel(nextForm));
    }
    onOpenChange(value);
  };

  const set = (key: keyof Tarefa, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const availableParents = useMemo(() => {
    if (!form.projeto) return [];
    return tarefas.filter((item) => item.projeto === form.projeto && getDepth(item.id) < 3 && item.id !== form.id);
  }, [tarefas, form.projeto, form.id]);

  const handleParentChange = (parentId: string) => {
    const actualParentId = parentId === "__none__" ? "" : parentId;
    setForm((current) => {
      const updated = { ...current, parentId: actualParentId };
      if (!isEdit && actualParentId) updated.id = generateNextChildId(actualParentId, tarefas);
      return updated;
    });
  };

  const handleProjetoChange = (projeto: string) => {
    setForm((current) => ({ ...current, projeto, parentId: "", id: isEdit ? current.id : "" }));
  };

  const currentDepth = form.parentId ? getDepth(form.parentId) + 1 : 0;
  const depthLabel = mode === "subtask"
    ? `Subtarefa ${currentDepth === 0 ? "" : `Nível ${currentDepth}`}`.trim()
    : "Tarefa";

  const buildAssignments = () => {
    const names = resourceInput.split(";").map((item) => item.trim()).filter(Boolean);
    return names.map((name) => {
      const resource = recursos.find((item) => item.nome === name);
      return {
        resourceId: resource?.id,
        resourceName: name,
        units: 1,
        work: form.esforcoPlanej,
        actualWork: form.esforcoReal,
        remainingWork: Math.max(form.esforcoPlanej - form.esforcoReal, 0),
        cost: form.valorPrevisto,
      };
    });
  };

  const buildPredecessors = () => predecessorInput
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const match = value.match(/^(.+?)(?:\s+\((FS|SS|FF|SF)\))?$/i);
      return {
        predecessorTaskId: match?.[1]?.trim() || value,
        type: (match?.[2] || "FS").toUpperCase(),
        lagMinutes: 0,
      };
    });

  const handleSave = async () => {
    if (!form.id.trim() || !form.tarefa.trim()) {
      toast({ title: "Erro", description: "ID e nome da tarefa são obrigatórios", variant: "destructive" });
      return;
    }
    if (!form.projeto.trim()) {
      toast({ title: "Erro", description: "Projeto é obrigatório", variant: "destructive" });
      return;
    }
    if (mode === "subtask" && !form.parentId.trim()) {
      toast({ title: "Erro", description: "Subtarefa precisa estar vinculada a uma tarefa pai", variant: "destructive" });
      return;
    }

    const payload: Tarefa = {
      ...form,
      parentId: mode === "task" ? "" : form.parentId,
      wbs: form.wbs || form.id,
      outlineLevel: form.outlineLevel || (mode === "task" ? 1 : currentDepth + 1),
      responsavel: resourceInput,
      assignments: buildAssignments(),
      predecessors: buildPredecessors(),
    };

    setSaving(true);
    try {
      if (isApiEnabled()) {
        if (isEdit) await api.updateTarefa(form.id, payload);
        else await api.createTarefa(payload);
        await refreshTarefas();
      } else {
        if (isEdit) setTarefas(tarefas.map((item) => item.id === tarefa!.id ? payload : item));
        else setTarefas([...tarefas, payload]);
      }
      toast({ title: isEdit ? "Tarefa atualizada" : "Tarefa criada" });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const projetos = getUniqueProjetos();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Tarefa" : mode === "subtask" ? "Nova Subtarefa" : "Nova Tarefa"}</DialogTitle>
          <p className="text-xs text-muted-foreground">{depthLabel}</p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div>
            <Label>Projeto *</Label>
            <Select value={form.projeto} onValueChange={handleProjetoChange} disabled={!!defaultProjeto}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{projetos.map((projeto) => <SelectItem key={projeto} value={projeto}>{projeto}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {mode === "subtask" ? (
            <div>
              <Label>Tarefa Pai *</Label>
              <Select value={form.parentId || "__none__"} onValueChange={handleParentChange} disabled={!form.projeto || !!defaultParentId}>
                <SelectTrigger><SelectValue placeholder="Selecione a tarefa pai" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecione a tarefa pai</SelectItem>
                  {availableParents.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.wbs || item.id} - {item.tarefa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Tipo</Label>
              <Input value="Tarefa Raiz" disabled />
            </div>
          )}
          <div>
            <Label>ID da tarefa *</Label>
            <Input value={form.id} onChange={(e) => set("id", e.target.value)} disabled={isEdit} placeholder="Ex: 1.2.3" />
          </div>
          <div>
            <Label>Código WBS</Label>
            <Input value={form.wbs || form.id} onChange={(e) => set("wbs", e.target.value)} placeholder="Ex: 1.2.3" />
          </div>
          <div className="col-span-2">
            <Label>Nome da Tarefa *</Label>
            <Input value={form.tarefa} onChange={(e) => set("tarefa", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(value) => set("status", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estratégia de planejamento</Label>
            <Select value={form.taskType || "fixed_units"} onValueChange={(value) => set("taskType", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Define se a tarefa será controlada principalmente por unidades, duração ou esforço.</p>
          </div>
          <div>
            <Label>Recursos atribuídos</Label>
            <Input value={resourceInput} onChange={(e) => setResourceInput(e.target.value)} placeholder="Separe os nomes por ponto e vírgula" />
          </div>
          <div>
            <Label>Dependências anteriores</Label>
            <Input value={predecessorInput} onChange={(e) => setPredecessorInput(e.target.value)} placeholder="Ex: 1.1; 1.2 (SS)" />
            <p className="mt-1 text-xs text-muted-foreground">Use o ID da tarefa anterior. Opcionalmente informe o tipo entre parênteses, como `SS` ou `FF`.</p>
          </div>
          <div>
            <Label>Início previsto</Label>
            <Input value={form.dataInicioPlanej} onChange={(e) => set("dataInicioPlanej", e.target.value)} placeholder="Ex: 03/15/26" />
          </div>
          <div>
            <Label>Fim previsto</Label>
            <Input value={form.dataFimPlanej} onChange={(e) => set("dataFimPlanej", e.target.value)} placeholder="Ex: 03/22/26" />
          </div>
          <div>
            <Label>Início Real</Label>
            <Input value={form.dataInicioReal} onChange={(e) => set("dataInicioReal", e.target.value)} placeholder="Ex: 03/16/26" />
          </div>
          <div>
            <Label>Término Real</Label>
            <Input value={form.dataFimReal} onChange={(e) => set("dataFimReal", e.target.value)} placeholder="Ex: 03/24/26" />
          </div>
          <div>
            <Label>Duração planejada (minutos)</Label>
            <Input type="number" value={form.durationMinutes || 0} onChange={(e) => set("durationMinutes", parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <Label>Percentual concluído</Label>
            <Input type="number" min={0} max={100} value={form.percentual} onChange={(e) => set("percentual", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Esforço previsto (horas)</Label>
            <Input type="number" step="0.25" value={form.esforcoPlanej} onChange={(e) => set("esforcoPlanej", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Esforço realizado (horas)</Label>
            <Input type="number" step="0.25" value={form.esforcoReal} onChange={(e) => set("esforcoReal", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Custo previsto</Label>
            <Input type="number" step="0.01" value={form.valorPrevisto} onChange={(e) => set("valorPrevisto", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Custo realizado</Label>
            <Input type="number" step="0.01" value={form.valorGasto} onChange={(e) => set("valorGasto", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Tipo de restrição</Label>
            <Input value={form.constraintType || ""} onChange={(e) => set("constraintType", e.target.value)} placeholder="Ex: ASAP, FNET" />
          </div>
          <div>
            <Label>Data da restrição</Label>
            <Input value={form.constraintDate || ""} onChange={(e) => set("constraintDate", e.target.value)} placeholder="Ex: 03/20/26" />
          </div>
          <div className="col-span-2">
            <Label>Notas</Label>
            <Input value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
