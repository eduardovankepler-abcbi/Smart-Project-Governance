import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Produto } from "@/data/projectData";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import { useData } from "@/contexts/DataContext";

interface ProdutoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto?: (Produto & { id?: number }) | null;
}

const emptyProduto: Produto = {
  nome: "",
  businessUnitId: undefined,
  businessUnitName: "",
};

export default function ProdutoDialog({ open, onOpenChange, produto }: ProdutoDialogProps) {
  const isEdit = !!produto?.id;
  const [form, setForm] = useState<Produto>(produto ? { ...emptyProduto, ...produto } : { ...emptyProduto });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { businessUnits, produtos, setProdutos, refreshProdutos } = useData();

  useEffect(() => {
    if (!open) return;
    if (produto) {
      setForm({ ...emptyProduto, ...produto });
      return;
    }
    setForm({
      ...emptyProduto,
      businessUnitId: businessUnits[0]?.id,
      businessUnitName: businessUnits[0]?.nome || "",
    });
  }, [open, produto, businessUnits]);

  const handleOpenChange = (value: boolean) => {
    if (value && produto) setForm({ ...emptyProduto, ...produto });
    else if (value) setForm({ ...emptyProduto, businessUnitId: businessUnits[0]?.id, businessUnitName: businessUnits[0]?.nome || "" });
    onOpenChange(value);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: "Erro", description: "Nome do produto é obrigatório", variant: "destructive" });
      return;
    }
    const selectedBusinessUnit = businessUnits.find((item) => item.id === Number(form.businessUnitId));
    if (!selectedBusinessUnit) {
      toast({ title: "Erro", description: "Unidade de negócio é obrigatória", variant: "destructive" });
      return;
    }

    const payload = {
      ...form,
      businessUnitId: selectedBusinessUnit.id,
      businessUnitName: selectedBusinessUnit.nome,
    };

    setSaving(true);
    try {
      if (isApiEnabled()) {
        if (isEdit && produto?.id) await api.updateProduto(produto.id, payload);
        else await api.createProduto(payload);
        await refreshProdutos();
      } else {
        if (isEdit && produto?.id) setProdutos(produtos.map((item) => item.id === produto.id ? { ...payload, id: produto.id } : item));
        else {
          const maxId = produtos.reduce((max, item) => Math.max(max, item.id || 0), 0);
          setProdutos([...produtos, { ...payload, id: maxId + 1 }]);
        }
      }
      toast({ title: isEdit ? "Produto atualizado" : "Produto criado" });
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
          <DialogTitle>{isEdit ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div>
            <Label>ID</Label>
            <Input value={produto?.id ? String(produto.id) : "Auto"} disabled />
          </div>
          <div>
            <Label>Unidade de negócio (BU) *</Label>
            <Select
              value={form.businessUnitId ? String(form.businessUnitId) : ""}
              onValueChange={(value) => {
                const selected = businessUnits.find((item) => item.id === Number(value));
                setForm((current) => ({ ...current, businessUnitId: Number(value), businessUnitName: selected?.nome || "" }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione a BU" /></SelectTrigger>
              <SelectContent>
                {businessUnits.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>{item.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm((current) => ({ ...current, nome: e.target.value }))} />
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
