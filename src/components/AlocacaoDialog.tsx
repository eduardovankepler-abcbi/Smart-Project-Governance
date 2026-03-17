import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Alocacao, Recurso, Tarefa } from "@/data/projectData";

interface AlocacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alocacao?: Alocacao | null;
  tarefas: Tarefa[];
  recursos: (Recurso & { id?: number })[];
  onSave: (payload: Alocacao) => Promise<void>;
}

const emptyAlocacao: Alocacao = {
  taskId: "",
  resourceId: undefined,
  resourceName: "",
  units: 1,
  work: 0,
  actualWork: 0,
  remainingWork: 0,
  cost: 0,
};

export default function AlocacaoDialog({ open, onOpenChange, alocacao, tarefas, recursos, onSave }: AlocacaoDialogProps) {
  const [form, setForm] = useState<Alocacao>(alocacao ? { ...emptyAlocacao, ...alocacao } : { ...emptyAlocacao });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(alocacao ? { ...emptyAlocacao, ...alocacao } : { ...emptyAlocacao });
  }, [open, alocacao]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const selectedResource = recursos.find((item) => item.id === Number(form.resourceId));
      const selectedTask = tarefas.find((item) => item.id === form.taskId);
      await onSave({
        ...form,
        projeto: selectedTask?.projeto,
        tarefa: selectedTask?.tarefa,
        wbs: selectedTask?.wbs || selectedTask?.id,
        taskStatus: selectedTask?.status,
        resourceName: selectedResource?.nome || form.resourceName,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{alocacao?.id ? "Editar Alocação" : "Nova Alocação"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2">
            <Label>Tarefa *</Label>
            <Select value={form.taskId} onValueChange={(value) => setForm((current) => ({ ...current, taskId: value }))}>
              <SelectTrigger><SelectValue placeholder="Selecione a tarefa" /></SelectTrigger>
              <SelectContent>
                {tarefas.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{`${item.wbs || item.id} · ${item.projeto} · ${item.tarefa}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Recurso *</Label>
            <Select value={form.resourceId ? String(form.resourceId) : ""} onValueChange={(value) => setForm((current) => ({ ...current, resourceId: Number(value) }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o recurso" /></SelectTrigger>
              <SelectContent>
                {recursos.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>{item.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Percentual de dedicação</Label>
            <Input type="number" step="0.1" value={form.units} onChange={(e) => setForm((current) => ({ ...current, units: parseFloat(e.target.value) || 0 }))} />
            <p className="mt-1 text-xs text-muted-foreground">Use `1` para 100% da dedicação prevista nessa tarefa.</p>
          </div>
          <div>
            <Label>Esforço previsto (horas)</Label>
            <Input type="number" step="0.1" value={form.work} onChange={(e) => setForm((current) => ({ ...current, work: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <Label>Esforço realizado (horas)</Label>
            <Input type="number" step="0.1" value={form.actualWork} onChange={(e) => setForm((current) => ({ ...current, actualWork: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <Label>Esforço restante (horas)</Label>
            <Input type="number" step="0.1" value={form.remainingWork} onChange={(e) => setForm((current) => ({ ...current, remainingWork: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <Label>Custo da alocação</Label>
            <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm((current) => ({ ...current, cost: parseFloat(e.target.value) || 0 }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
