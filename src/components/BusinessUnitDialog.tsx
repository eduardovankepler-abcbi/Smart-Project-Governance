import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BusinessUnit } from "@/data/projectData";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import { useData } from "@/contexts/DataContext";

interface BusinessUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessUnit?: (BusinessUnit & { id?: number }) | null;
}

const emptyBusinessUnit: BusinessUnit = {
  nome: "",
  head: "",
  liderTec: "",
  liderOp: "",
  comercial: "",
};

export default function BusinessUnitDialog({ open, onOpenChange, businessUnit }: BusinessUnitDialogProps) {
  const isEdit = !!businessUnit?.id;
  const [form, setForm] = useState<BusinessUnit>(businessUnit ? { ...emptyBusinessUnit, ...businessUnit } : { ...emptyBusinessUnit });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { businessUnits, projetos, setBusinessUnits, setProjetos, refreshBusinessUnits } = useData();

  useEffect(() => {
    if (!open) return;
    if (businessUnit) {
      setForm({ ...emptyBusinessUnit, ...businessUnit });
      return;
    }
    setForm({ ...emptyBusinessUnit });
  }, [open, businessUnit]);

  const handleOpenChange = (value: boolean) => {
    if (value && businessUnit) setForm({ ...emptyBusinessUnit, ...businessUnit });
    else if (value) setForm({ ...emptyBusinessUnit });
    onOpenChange(value);
  };

  const set = (key: keyof BusinessUnit, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: "Erro", description: "Nome da unidade de negócio é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (isApiEnabled()) {
        if (isEdit && businessUnit?.id) await api.updateBusinessUnit(businessUnit.id, form);
        else await api.createBusinessUnit(form);
        await refreshBusinessUnits();
      } else {
        if (isEdit && businessUnit?.id) {
          setBusinessUnits(businessUnits.map((item) => item.id === businessUnit.id ? { ...form, id: businessUnit.id } : item));
          setProjetos(projetos.map((item) => item.businessUnitId === businessUnit.id ? { ...item, businessUnitName: form.nome } : item));
        } else {
          const maxId = businessUnits.reduce((max, item) => Math.max(max, item.id || 0), 0);
          setBusinessUnits([...businessUnits, { ...form, id: maxId + 1 }]);
        }
      }
      toast({ title: isEdit ? "Unidade de negócio atualizada" : "Unidade de negócio criada" });
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
          <DialogTitle>{isEdit ? "Editar Unidade de Negócio" : "Nova Unidade de Negócio"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>
          <div>
            <Label>Head da unidade</Label>
            <Input value={form.head} onChange={(e) => set("head", e.target.value)} placeholder="Responsável executivo pela BU" />
          </div>
          <div>
            <Label>Líder Técnico</Label>
            <Input value={form.liderTec} onChange={(e) => set("liderTec", e.target.value)} />
          </div>
          <div>
            <Label>Líder Operacional</Label>
            <Input value={form.liderOp} onChange={(e) => set("liderOp", e.target.value)} />
          </div>
          <div>
            <Label>Comercial</Label>
            <Input value={form.comercial} onChange={(e) => set("comercial", e.target.value)} />
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
