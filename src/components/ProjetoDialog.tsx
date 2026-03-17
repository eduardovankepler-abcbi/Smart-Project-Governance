import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Projeto } from "@/data/projectData";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import { isApiEnabled } from "@/config/api";
import { useData } from "@/contexts/DataContext";

interface ProjetoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projeto?: Projeto | null;
}

const STATUS_OPTIONS = ["Atrasado", "Em andamento", "Não iniciado", "Concluído"];
const PRIORIDADE_OPTIONS = ["1- Alta", "2- Média", "3- Baixa"];
const PROJECT_TYPE_OPTIONS = ["Tac", "CR", "Projeto", "Pré-Venda"];

const emptyProjeto: Omit<Projeto, "id"> = {
  projectId: "",
  projectType: "Projeto",
  businessUnitId: undefined,
  businessUnitName: "",
  produtoId: undefined,
  produtoName: "",
  projeto: "",
  descricao: "",
  prioridade: "2- Média",
  responsavel: "",
  ftes: 0,
  valorPrevisto: 0,
  valorGasto: 0,
  dataInicioPlanej: "",
  dataFimPlanej: "",
  dataInicio: "",
  dataFimReal: "",
  totalTarefas: 0,
  tarefasConcluidas: 0,
  tarefasAndamento: 0,
  tarefasAtrasadas: 0,
  tarefasNaoIniciadas: 0,
  status: "Não iniciado",
  conclusao: 0,
};

function buildProjectCode(name: string): string {
  const normalized = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `PRJ-${normalized || Date.now()}`;
}

export default function ProjetoDialog({ open, onOpenChange, projeto }: ProjetoDialogProps) {
  const isEdit = !!projeto;
  const [form, setForm] = useState<Omit<Projeto, "id">>(projeto ? { ...emptyProjeto, ...projeto } : { ...emptyProjeto });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { businessUnits, produtos, refreshProjetos, projetos, setProjetos } = useData();

  useEffect(() => {
    if (!open) return;
    if (projeto) {
      setForm({ ...emptyProjeto, ...projeto });
      return;
    }
    setForm({
      ...emptyProjeto,
      businessUnitId: businessUnits[0]?.id,
      businessUnitName: businessUnits[0]?.nome || "",
      produtoId: undefined,
      produtoName: "",
    });
  }, [open, projeto, businessUnits]);

  const handleOpenChange = (value: boolean) => {
    if (value && projeto) setForm({ ...emptyProjeto, ...projeto });
    else if (value) setForm({
      ...emptyProjeto,
      businessUnitId: businessUnits[0]?.id,
      businessUnitName: businessUnits[0]?.nome || "",
      produtoId: undefined,
      produtoName: "",
    });
    onOpenChange(value);
  };

  const set = (key: keyof Omit<Projeto, "id">, value: string | number) => setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!form.projeto.trim()) {
      toast({ title: "Erro", description: "Nome do projeto é obrigatório", variant: "destructive" });
      return;
    }
    if (!form.businessUnitId) {
      toast({ title: "Erro", description: "Business Unit é obrigatória", variant: "destructive" });
      return;
    }

    const selectedBusinessUnit = businessUnits.find((item) => item.id === Number(form.businessUnitId));
    if (!selectedBusinessUnit) {
      toast({ title: "Erro", description: "Business Unit inválida", variant: "destructive" });
      return;
    }
    const selectedProduto = form.produtoId
      ? produtos.find((item) => item.id === Number(form.produtoId))
      : undefined;
    if (form.produtoId && !selectedProduto) {
      toast({ title: "Erro", description: "Produto inválido", variant: "destructive" });
      return;
    }

    const payload = {
      ...form,
      projectId: form.projectId?.trim() || buildProjectCode(form.projeto),
      businessUnitId: Number(form.businessUnitId),
      businessUnitName: selectedBusinessUnit.nome,
      produtoId: selectedProduto?.id,
      produtoName: selectedProduto?.nome || "",
    };

    if (selectedProduto && selectedProduto.businessUnitId && Number(selectedProduto.businessUnitId) !== Number(form.businessUnitId)) {
      toast({
        title: "Erro",
        description: "O produto selecionado deve pertencer à mesma unidade de negócio do projeto",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (isApiEnabled()) {
        if (isEdit && projeto) await api.updateProjeto(projeto.id, payload);
        else await api.createProjeto(payload);
        await refreshProjetos();
      } else {
        if (isEdit && projeto) setProjetos(projetos.map((item) => item.id === projeto.id ? { ...payload, id: projeto.id } : item));
        else {
          const maxId = projetos.reduce((max, item) => Math.max(max, item.id), 0);
          setProjetos([...projetos, { ...payload, id: maxId + 1 }]);
        }
      }
      toast({ title: isEdit ? "Projeto atualizado" : "Projeto criado" });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const produtosDaBu = produtos.filter((item) => !form.businessUnitId || item.businessUnitId === Number(form.businessUnitId));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div>
            <Label>ID do projeto *</Label>
            <Input value={form.projectId || ""} onChange={(e) => set("projectId", e.target.value.toUpperCase())} placeholder="Ex: PRJ-ERP-001" />
          </div>
          <div>
            <Label>Nome do Projeto *</Label>
            <Input value={form.projeto} onChange={(e) => set("projeto", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>
          <div>
            <Label>Business Unit (BU) *</Label>
            <Select value={form.businessUnitId ? String(form.businessUnitId) : ""} onValueChange={(value) => {
              const selected = businessUnits.find((item) => item.id === Number(value));
              const produtoAtual = produtos.find((item) => item.id === Number(form.produtoId));
              setForm((current) => ({
                ...current,
                businessUnitId: Number(value),
                businessUnitName: selected?.nome || "",
                produtoId: produtoAtual && Number(produtoAtual.businessUnitId) === Number(value) ? current.produtoId : undefined,
                produtoName: produtoAtual && Number(produtoAtual.businessUnitId) === Number(value) ? current.produtoName || "" : "",
              }));
            }}>
              <SelectTrigger><SelectValue placeholder="Selecione a BU" /></SelectTrigger>
              <SelectContent>
                {businessUnits.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de Projeto *</Label>
            <Select value={form.projectType || "Projeto"} onValueChange={(value) => set("projectType", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_TYPE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Produto vinculado</Label>
            <Select
              value={form.produtoId ? String(form.produtoId) : "none"}
              onValueChange={(value) => {
                if (value === "none") {
                  setForm((current) => ({ ...current, produtoId: undefined, produtoName: "" }));
                  return;
                }
                const selected = produtos.find((item) => item.id === Number(value));
                setForm((current) => ({
                  ...current,
                  produtoId: Number(value),
                  produtoName: selected?.nome || "",
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem produto vinculado</SelectItem>
                {produtosDaBu.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Mostra apenas produtos da unidade de negócio selecionada.</p>
          </div>
          <div>
            <Label>Responsável principal</Label>
            <Input value={form.responsavel} onChange={(e) => set("responsavel", e.target.value)} />
          </div>
          <div>
            <Label>Prioridade</Label>
            <Select value={form.prioridade} onValueChange={(value) => set("prioridade", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORIDADE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(value) => set("status", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>FTEs previstos</Label>
            <Input type="number" step="0.5" value={form.ftes} onChange={(e) => set("ftes", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Início Previsto</Label>
            <Input type="date" value={form.dataInicioPlanej || ""} onChange={(e) => set("dataInicioPlanej", e.target.value)} />
          </div>
          <div>
            <Label>Início Real</Label>
            <Input type="date" value={form.dataInicio || ""} onChange={(e) => set("dataInicio", e.target.value)} />
          </div>
          <div>
            <Label>Fim Previsto</Label>
            <Input type="date" value={form.dataFimPlanej || ""} onChange={(e) => set("dataFimPlanej", e.target.value)} />
          </div>
          <div>
            <Label>Fim Real</Label>
            <Input type="date" value={form.dataFimReal || ""} onChange={(e) => set("dataFimReal", e.target.value)} />
          </div>
          <div>
            <Label>Valor Previsto</Label>
            <Input type="number" step="0.01" value={form.valorPrevisto} onChange={(e) => set("valorPrevisto", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Valor Gasto</Label>
            <Input type="number" step="0.01" value={form.valorGasto} onChange={(e) => set("valorGasto", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Conclusão física (%)</Label>
            <Input type="number" min={0} max={100} value={form.conclusao} onChange={(e) => set("conclusao", parseFloat(e.target.value) || 0)} />
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
