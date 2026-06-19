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
import { formatProjectDateForInput, hasProjectValidationErrors, PROJECT_FIELD_LIMITS, type ProjectValidationErrors, validateProjectInput } from "@/utils/projectValidation";

interface ProjetoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projeto?: Projeto | null;
}

const STATUS_OPTIONS = ["Atrasado", "Em andamento", "Não iniciado", "Congelado", "Concluído"];
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
  orcamentoAprovado: 0,
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

function prepareProjectForForm(project: Omit<Projeto, "id">): Omit<Projeto, "id"> {
  return {
    ...project,
    dataInicioPlanej: formatProjectDateForInput(project.dataInicioPlanej),
    dataFimPlanej: formatProjectDateForInput(project.dataFimPlanej),
    dataInicio: formatProjectDateForInput(project.dataInicio),
    dataFimReal: formatProjectDateForInput(project.dataFimReal),
  };
}

export default function ProjetoDialog({ open, onOpenChange, projeto }: ProjetoDialogProps) {
  const isEdit = !!projeto;
  const [form, setForm] = useState<Omit<Projeto, "id">>(projeto ? { ...emptyProjeto, ...projeto } : { ...emptyProjeto });
  const [errors, setErrors] = useState<ProjectValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { businessUnits, produtos, refreshProjetos, projetos, setProjetos } = useData();

  useEffect(() => {
    if (!open) return;
    if (projeto) {
      setForm(prepareProjectForForm({ ...emptyProjeto, ...projeto }));
      setErrors({});
      return;
    }
    setForm({
      ...emptyProjeto,
      businessUnitId: businessUnits[0]?.id,
      businessUnitName: businessUnits[0]?.nome || "",
      produtoId: undefined,
      produtoName: "",
    });
    setErrors({});
  }, [open, projeto, businessUnits]);

  const handleOpenChange = (value: boolean) => {
    if (value && projeto) {
      setForm(prepareProjectForForm({ ...emptyProjeto, ...projeto }));
      setErrors({});
    } else if (value) {
      setForm({
        ...emptyProjeto,
        businessUnitId: businessUnits[0]?.id,
        businessUnitName: businessUnits[0]?.nome || "",
        produtoId: undefined,
        produtoName: "",
      });
      setErrors({});
    }
    onOpenChange(value);
  };

  const set = (key: keyof Omit<Projeto, "id">, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const setFieldError = (key: keyof ProjectValidationErrors, message: string) => {
    setErrors((current) => ({ ...current, [key]: message }));
  };

  const fieldError = (key: keyof ProjectValidationErrors) => errors[key];

  const errorClass = (key: keyof ProjectValidationErrors) => fieldError(key) ? "border-destructive focus-visible:ring-destructive" : "";

  const renderFieldError = (key: keyof ProjectValidationErrors) => fieldError(key) ? (
    <p className="mt-1 text-xs text-destructive">{fieldError(key)}</p>
  ) : null;

  const handleSave = async () => {
    const validationErrors = validateProjectInput(form);
    setErrors(validationErrors);
    if (hasProjectValidationErrors(validationErrors)) {
      toast({ title: "Revise os campos destacados", description: "Algumas informações do projeto precisam ser ajustadas antes de salvar.", variant: "destructive" });
      return;
    }

    const selectedBusinessUnit = businessUnits.find((item) => item.id === Number(form.businessUnitId));
    if (!selectedBusinessUnit) {
      setFieldError("businessUnitId", "Business Unit inválida.");
      toast({ title: "Revise os campos destacados", description: "A Business Unit selecionada não foi encontrada.", variant: "destructive" });
      return;
    }
    const selectedProduto = form.produtoId
      ? produtos.find((item) => item.id === Number(form.produtoId))
      : undefined;
    if (form.produtoId && !selectedProduto) {
      setFieldError("produtoId", "Produto inválido.");
      toast({ title: "Revise os campos destacados", description: "O produto selecionado não foi encontrado.", variant: "destructive" });
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
      setFieldError("produtoId", "O produto selecionado deve pertencer à mesma unidade de negócio do projeto.");
      toast({ title: "Revise os campos destacados", description: "O produto deve pertencer à mesma unidade de negócio do projeto.", variant: "destructive" });
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
            <Input
              value={form.projectId || ""}
              maxLength={PROJECT_FIELD_LIMITS.projectId}
              aria-invalid={!!fieldError("projectId")}
              className={errorClass("projectId")}
              onChange={(e) => set("projectId", e.target.value.toUpperCase())}
              placeholder="Ex: PRJ-ERP-001"
            />
            {renderFieldError("projectId")}
          </div>
          <div>
            <Label>Nome do Projeto *</Label>
            <Input
              value={form.projeto}
              maxLength={PROJECT_FIELD_LIMITS.projeto}
              aria-invalid={!!fieldError("projeto")}
              className={errorClass("projeto")}
              onChange={(e) => set("projeto", e.target.value)}
            />
            {renderFieldError("projeto")}
          </div>
          <div className="col-span-2">
            <Label>Descrição</Label>
            <Input
              value={form.descricao}
              maxLength={PROJECT_FIELD_LIMITS.descricao}
              aria-invalid={!!fieldError("descricao")}
              className={errorClass("descricao")}
              onChange={(e) => set("descricao", e.target.value)}
            />
            {renderFieldError("descricao")}
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
              setErrors((current) => {
                const next = { ...current };
                delete next.businessUnitId;
                delete next.produtoId;
                return next;
              });
            }}>
              <SelectTrigger className={errorClass("businessUnitId")} aria-invalid={!!fieldError("businessUnitId")}><SelectValue placeholder="Selecione a BU" /></SelectTrigger>
              <SelectContent>
                {businessUnits.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {renderFieldError("businessUnitId")}
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
                  setErrors((current) => {
                    if (!current.produtoId) return current;
                    const next = { ...current };
                    delete next.produtoId;
                    return next;
                  });
                  return;
                }
                const selected = produtos.find((item) => item.id === Number(value));
                setForm((current) => ({
                  ...current,
                  produtoId: Number(value),
                  produtoName: selected?.nome || "",
                }));
                setErrors((current) => {
                  if (!current.produtoId) return current;
                  const next = { ...current };
                  delete next.produtoId;
                  return next;
                });
              }}
            >
              <SelectTrigger className={errorClass("produtoId")} aria-invalid={!!fieldError("produtoId")}><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
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
            {renderFieldError("produtoId")}
          </div>
          <div>
            <Label>Responsável principal</Label>
            <Input
              value={form.responsavel}
              maxLength={PROJECT_FIELD_LIMITS.responsavel}
              aria-invalid={!!fieldError("responsavel")}
              className={errorClass("responsavel")}
              onChange={(e) => set("responsavel", e.target.value)}
            />
            {renderFieldError("responsavel")}
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
            <Input
              type="number"
              step="0.5"
              min={0}
              max={PROJECT_FIELD_LIMITS.ftes}
              value={form.ftes}
              aria-invalid={!!fieldError("ftes")}
              className={errorClass("ftes")}
              onChange={(e) => set("ftes", parseFloat(e.target.value) || 0)}
            />
            {renderFieldError("ftes")}
          </div>
          <div>
            <Label>Início Previsto</Label>
            <Input
              type="date"
              value={form.dataInicioPlanej || ""}
              aria-invalid={!!fieldError("dataInicioPlanej")}
              className={errorClass("dataInicioPlanej")}
              onChange={(e) => set("dataInicioPlanej", e.target.value)}
            />
            {renderFieldError("dataInicioPlanej")}
          </div>
          <div>
            <Label>Início Real</Label>
            <Input
              type="date"
              value={form.dataInicio || ""}
              aria-invalid={!!fieldError("dataInicio")}
              className={errorClass("dataInicio")}
              onChange={(e) => set("dataInicio", e.target.value)}
            />
            {renderFieldError("dataInicio")}
          </div>
          <div>
            <Label>Fim Previsto</Label>
            <Input
              type="date"
              value={form.dataFimPlanej || ""}
              aria-invalid={!!fieldError("dataFimPlanej")}
              className={errorClass("dataFimPlanej")}
              onChange={(e) => set("dataFimPlanej", e.target.value)}
            />
            {renderFieldError("dataFimPlanej")}
          </div>
          <div>
            <Label>Fim Real</Label>
            <Input
              type="date"
              value={form.dataFimReal || ""}
              aria-invalid={!!fieldError("dataFimReal")}
              className={errorClass("dataFimReal")}
              onChange={(e) => set("dataFimReal", e.target.value)}
            />
            {renderFieldError("dataFimReal")}
          </div>
          <div>
            <Label>Custo planejado</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={PROJECT_FIELD_LIMITS.money}
              value={form.valorPrevisto}
              aria-invalid={!!fieldError("valorPrevisto")}
              className={errorClass("valorPrevisto")}
              onChange={(e) => set("valorPrevisto", parseFloat(e.target.value) || 0)}
            />
            {renderFieldError("valorPrevisto")}
          </div>
          <div>
            <Label>Orçamento aprovado</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={PROJECT_FIELD_LIMITS.money}
              value={form.orcamentoAprovado || 0}
              aria-invalid={!!fieldError("orcamentoAprovado")}
              className={errorClass("orcamentoAprovado")}
              onChange={(e) => set("orcamentoAprovado", parseFloat(e.target.value) || 0)}
            />
            {renderFieldError("orcamentoAprovado")}
          </div>
          <div>
            <Label>Valor Gasto</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={PROJECT_FIELD_LIMITS.money}
              value={form.valorGasto}
              aria-invalid={!!fieldError("valorGasto")}
              className={errorClass("valorGasto")}
              onChange={(e) => set("valorGasto", parseFloat(e.target.value) || 0)}
            />
            {renderFieldError("valorGasto")}
          </div>
          <div>
            <Label>Conclusão física (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.conclusao}
              aria-invalid={!!fieldError("conclusao")}
              className={errorClass("conclusao")}
              onChange={(e) => set("conclusao", parseFloat(e.target.value) || 0)}
            />
            {renderFieldError("conclusao")}
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
