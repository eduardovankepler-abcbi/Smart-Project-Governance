import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useData, formatCurrency } from "@/contexts/DataContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/services/api";

interface ProjectTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROJECT_TYPE_OPTIONS = ["Tac", "CR", "Projeto", "Pré-Venda"];
const PRIORIDADE_OPTIONS = ["1- Alta", "2- Média", "3- Baixa"];

export default function ProjectTemplateDialog({ open, onOpenChange }: ProjectTemplateDialogProps) {
  const { projetos, businessUnits, produtos, refreshProjetos } = useData();
  const { toast } = useToast();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<api.ProjectTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [instantiating, setInstantiating] = useState(false);

  const [sourceProjectId, setSourceProjectId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateSourceFormat, setTemplateSourceFormat] = useState<api.ProjectTemplate["sourceFormat"]>("internal_project");

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectType, setProjectType] = useState("Projeto");
  const [projectPriority, setProjectPriority] = useState("2- Média");
  const [projectResponsavel, setProjectResponsavel] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [produtoId, setProdutoId] = useState("none");

  useEffect(() => {
    if (!open) return;
    setLoadingTemplates(true);
    api.getProjectTemplates()
      .then(setTemplates)
      .catch((error: Error) => {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      })
      .finally(() => setLoadingTemplates(false));
  }, [open, toast]);

  useEffect(() => {
    if (!open) return;
    setSourceProjectId("");
    setTemplateName("");
    setTemplateDescription("");
    setTemplateSourceFormat("internal_project");
    setSelectedTemplateId("");
    setProjectName("");
    setProjectCode("");
    setProjectDescription("");
    setProjectType("Projeto");
    setProjectPriority("2- Média");
    setProjectResponsavel("");
    setBusinessUnitId(businessUnits[0]?.id ? String(businessUnits[0].id) : "");
    setProdutoId("none");
  }, [open, businessUnits]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === Number(selectedTemplateId)),
    [templates, selectedTemplateId]
  );

  const produtosDaBu = useMemo(
    () => produtos.filter((item) => !businessUnitId || Number(item.businessUnitId) === Number(businessUnitId)),
    [produtos, businessUnitId]
  );

  const handleSaveTemplate = async () => {
    if (!sourceProjectId) {
      toast({ title: "Erro", description: "Selecione o projeto de origem", variant: "destructive" });
      return;
    }
    setSavingTemplate(true);
    try {
      const created = await api.createProjectTemplateFromProject({
        projectId: Number(sourceProjectId),
        templateName: templateName.trim() || undefined,
        descricao: templateDescription.trim() || undefined,
        sourceFormat: templateSourceFormat,
      });
      setTemplates((current) => [created, ...current]);
      setSelectedTemplateId(String(created.id));
      toast({ title: "Template criado", description: `${created.templateName} está pronto para reutilização.` });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Falha ao criar template", variant: "destructive" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleInstantiate = async () => {
    if (!selectedTemplateId) {
      toast({ title: "Erro", description: "Selecione um template", variant: "destructive" });
      return;
    }
    if (!projectName.trim()) {
      toast({ title: "Erro", description: "Informe o nome do novo projeto", variant: "destructive" });
      return;
    }
    if (!businessUnitId) {
      toast({ title: "Erro", description: "Selecione a Business Unit", variant: "destructive" });
      return;
    }
    setInstantiating(true);
    try {
      const result = await api.instantiateProjectTemplate(Number(selectedTemplateId), {
        projeto: projectName.trim(),
        projectId: projectCode.trim() || undefined,
        descricao: projectDescription.trim() || undefined,
        projectType,
        prioridade: projectPriority,
        responsavel: projectResponsavel.trim() || undefined,
        businessUnitId: Number(businessUnitId),
        produtoId: produtoId !== "none" ? Number(produtoId) : undefined,
      });
      await refreshProjetos();
      toast({ title: "Projeto criado", description: `${result.projectName} foi criado a partir do template selecionado.` });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Falha ao criar projeto", variant: "destructive" });
    } finally {
      setInstantiating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Templates de Projeto</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1.1fr,1fr] py-2">
          <Card className="border-border">
            <CardContent className="space-y-4 p-5">
              <div>
                <h3 className="font-semibold text-foreground">Salvar cronograma como template</h3>
                <p className="text-sm text-muted-foreground">
                  Use esta ação para transformar um projeto já cadastrado ou importado em um template reutilizável.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Projeto de origem *</Label>
                <Select value={sourceProjectId} onValueChange={setSourceProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
                  <SelectContent>
                    {projetos.map((project) => (
                      <SelectItem key={project.id} value={String(project.id)}>
                        {project.projectId || `PRJ-${project.id}`} · {project.projeto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nome do template</Label>
                <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Ex: ERP Rollout Padrão" />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="Explique quando este template deve ser usado." />
              </div>

              <div className="space-y-2">
                <Label>Formato de origem</Label>
                <Select value={templateSourceFormat} onValueChange={(value) => setTemplateSourceFormat(value as api.ProjectTemplate["sourceFormat"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal_project">Projeto interno normalizado</SelectItem>
                    <SelectItem value="ms_project_xml">MS Project XML normalizado</SelectItem>
                    <SelectItem value="mpp">Preparado para futura entrada .mpp</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ainda não estamos lendo `.mpp` nativamente, mas o template já fica classificado no formato correto para a próxima fase.
                </p>
              </div>

              <Button onClick={handleSaveTemplate} disabled={savingTemplate}>
                {savingTemplate ? "Salvando template..." : "Salvar como template"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="space-y-4 p-5">
              <div>
                <h3 className="font-semibold text-foreground">Catálogo e criação de projeto</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha um template e instancie um projeto novo com a mesma estrutura de cronograma.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Template *</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger><SelectValue placeholder={loadingTemplates ? "Carregando templates..." : "Selecione um template"} /></SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.templateName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedTemplate.templateCode}</Badge>
                    <Badge variant="secondary">{selectedTemplate.sourceFormat}</Badge>
                    <Badge variant="outline">{selectedTemplate.totalTasks} tarefas</Badge>
                  </div>
                  <p className="mt-2 text-foreground">{selectedTemplate.templateName}</p>
                  <p className="text-muted-foreground">{selectedTemplate.descricao || "Sem descrição adicional."}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Origem: {selectedTemplate.originProjectName || "Projeto interno"}</span>
                    <span>Esforço planejado: {selectedTemplate.totalPlannedEffort.toFixed(1)} h</span>
                    <span>Custo planejado: {formatCurrency(selectedTemplate.totalPlannedCost)}</span>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Novo projeto *</Label>
                  <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ex: Jogo - Fase 2" />
                </div>
                <div className="space-y-2">
                  <Label>Código do projeto</Label>
                  <Input value={projectCode} onChange={(event) => setProjectCode(event.target.value.toUpperCase())} placeholder="Opcional" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="Descrição inicial do projeto criado a partir do template." />
                </div>
                <div className="space-y-2">
                  <Label>Business Unit *</Label>
                  <Select value={businessUnitId} onValueChange={(value) => {
                    setBusinessUnitId(value);
                    const productStillValid = produtos.find((item) => String(item.id) === produtoId && Number(item.businessUnitId) === Number(value));
                    if (!productStillValid) setProdutoId("none");
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
                <div className="space-y-2">
                  <Label>Produto</Label>
                  <Select value={produtoId} onValueChange={setProdutoId}>
                    <SelectTrigger><SelectValue placeholder="Sem produto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem produto vinculado</SelectItem>
                      {produtosDaBu.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo do projeto</Label>
                  <Select value={projectType} onValueChange={setProjectType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROJECT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={projectPriority} onValueChange={setProjectPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORIDADE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Responsável principal</Label>
                  <Input value={projectResponsavel} onChange={(event) => setProjectResponsavel(event.target.value)} placeholder="Opcional" />
                </div>
              </div>

              {user?.role !== "admin" ? (
                <p className="text-xs text-muted-foreground">
                  Somente administradores podem instanciar novos projetos a partir de templates.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={handleInstantiate} disabled={instantiating || user?.role !== "admin"}>
            {instantiating ? "Criando projeto..." : "Criar projeto a partir do template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
