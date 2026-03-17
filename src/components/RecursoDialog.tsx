import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Recurso } from "@/data/projectData";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import { useData } from "@/contexts/DataContext";

interface RecursoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurso?: (Recurso & { id?: number }) | null;
}

const emptyRecurso: Recurso = {
  nome: "",
  funcao: "",
  seniority: "",
  specialties: [],
  resourceType: "work",
  initials: "",
  maxUnits: 1,
  standardRate: 0,
  overtimeRate: 0,
  email: "",
};

export default function RecursoDialog({ open, onOpenChange, recurso }: RecursoDialogProps) {
  const isEdit = !!recurso;
  const [form, setForm] = useState<Recurso>({ ...emptyRecurso, ...recurso });
  const [specialtiesInput, setSpecialtiesInput] = useState((recurso?.specialties || []).join("; "));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { refreshRecursos, recursos, setRecursos } = useData();

  useEffect(() => {
    if (!open) return;
    if (recurso) {
      setForm({ ...emptyRecurso, ...recurso });
      setSpecialtiesInput((recurso.specialties || []).join("; "));
      return;
    }
    setForm({ ...emptyRecurso });
    setSpecialtiesInput("");
  }, [open, recurso]);

  const handleOpenChange = (o: boolean) => {
    if (o && recurso) {
      setForm({ ...emptyRecurso, ...recurso });
      setSpecialtiesInput((recurso.specialties || []).join("; "));
    } else if (o) {
      setForm({ ...emptyRecurso });
      setSpecialtiesInput("");
    }
    onOpenChange(o);
  };

  const set = (key: keyof Recurso, value: string | number) => setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: "Erro", description: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        specialties: specialtiesInput.split(";").map((item) => item.trim()).filter(Boolean),
      };
      if (isApiEnabled()) {
        if (isEdit && recurso?.id) {
          await api.updateRecurso(recurso.id, payload);
        } else {
          await api.createRecurso(payload);
        }
        await refreshRecursos();
      } else {
        if (isEdit) {
          setRecursos(recursos.map((item) => item.nome === recurso!.nome ? { ...item, ...payload } : item));
        } else {
          setRecursos([...recursos, payload]);
        }
      }
      toast({ title: isEdit ? "Recurso atualizado" : "Recurso criado" });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Recurso" : "Novo Recurso"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>
          <div>
            <Label>Função</Label>
            <Input value={form.funcao || ""} onChange={(e) => set("funcao", e.target.value)} />
          </div>
          <div>
            <Label>Nível de senioridade</Label>
            <Input value={form.seniority || ""} onChange={(e) => set("seniority", e.target.value)} placeholder="Ex: Júnior, Pleno, Sênior" />
          </div>
          <div>
            <Label>Tipo de recurso</Label>
            <Select value={form.resourceType || "work"} onValueChange={(value) => set("resourceType", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="work">Trabalho</SelectItem>
                <SelectItem value="material">Material</SelectItem>
                <SelectItem value="cost">Custo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Iniciais / sigla</Label>
            <Input value={form.initials || ""} onChange={(e) => set("initials", e.target.value)} placeholder="Ex: AC, PM, DEV" />
          </div>
          <div className="col-span-2">
            <Label>Especialidades</Label>
            <Input value={specialtiesInput} onChange={(e) => setSpecialtiesInput(e.target.value)} placeholder="Separe por ponto e vírgula. Ex: SAP ABAP; Java; Gestão de Projetos" />
          </div>
          <div>
            <Label>Capacidade máxima de alocação</Label>
            <Input type="number" step="0.1" value={form.maxUnits || 1} onChange={(e) => set("maxUnits", parseFloat(e.target.value) || 0)} />
            <p className="mt-1 text-xs text-muted-foreground">Use `1` para 100% da jornada, `0.5` para meio período e `2` para capacidade equivalente a duas pessoas.</p>
          </div>
          <div>
            <Label>Tarifa padrão (R$/hora)</Label>
            <Input type="number" step="0.01" value={form.standardRate || 0} onChange={(e) => set("standardRate", parseFloat(e.target.value) || 0)} />
            <p className="mt-1 text-xs text-muted-foreground">Valor da hora normal usada no custo planejado e realizado.</p>
          </div>
          <div>
            <Label>Tarifa extra (R$/hora extra)</Label>
            <Input type="number" step="0.01" value={form.overtimeRate || 0} onChange={(e) => set("overtimeRate", parseFloat(e.target.value) || 0)} />
            <p className="mt-1 text-xs text-muted-foreground">Valor aplicado quando o recurso trabalha além da condição padrão.</p>
          </div>
          <div className="col-span-2">
            <Label>Email de contato</Label>
            <Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="nome@empresa.com" />
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
