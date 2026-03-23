import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Boxes, Building2, FolderKanban, ListTodo, Pencil, Users } from "lucide-react";
import { useData } from "@/contexts/DataContext";
import ProjetoDialog from "@/components/ProjetoDialog";
import TarefaDialog from "@/components/TarefaDialog";
import RecursoDialog from "@/components/RecursoDialog";
import BusinessUnitDialog from "@/components/BusinessUnitDialog";
import ProdutoDialog from "@/components/ProdutoDialog";
import type { BusinessUnit, Produto, Projeto, Recurso, Tarefa } from "@/data/projectData";
import { getTaskBusinessId, getTaskDisplayHierarchy, MAX_TASK_WBS_DEPTH } from "@/utils/taskIdentity";

export default function CadastroPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { businessUnits, produtos, projetos, tarefas, recursos } = useData();
  const [businessUnitOpen, setBusinessUnitOpen] = useState(false);
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<(BusinessUnit & { id?: number }) | null>(null);
  const [produtoOpen, setProdutoOpen] = useState(false);
  const [selectedProduto, setSelectedProduto] = useState<(Produto & { id?: number }) | null>(null);
  const [projetoOpen, setProjetoOpen] = useState(false);
  const [selectedProjeto, setSelectedProjeto] = useState<Projeto | null>(null);
  const [tarefaOpen, setTarefaOpen] = useState(false);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [subtarefaOpen, setSubtarefaOpen] = useState(false);
  const [recursoOpen, setRecursoOpen] = useState(false);
  const [selectedRecurso, setSelectedRecurso] = useState<(Recurso & { id?: number }) | null>(null);

  const openNewBusinessUnit = () => {
    setSelectedBusinessUnit(null);
    setBusinessUnitOpen(true);
  };

  const openNewProjeto = () => {
    setSelectedProjeto(null);
    setProjetoOpen(true);
  };

  const openNewProduto = () => {
    setSelectedProduto(null);
    setProdutoOpen(true);
  };

  const openNewTarefa = () => {
    setSelectedTarefa(null);
    setTarefaOpen(true);
  };

  const openNewSubtarefa = () => {
    setSelectedTarefa(null);
    setSubtarefaOpen(true);
  };

  const openNewRecurso = () => {
    setSelectedRecurso(null);
    setRecursoOpen(true);
  };

  const allowedTabs = new Set(["business-units", "produtos", "projetos", "tarefas", "recursos"]);
  const activeTab = allowedTabs.has(searchParams.get("tab") || "") ? (searchParams.get("tab") as string) : "projetos";

  return (
    <div className="flex flex-col">
      <Header title="Cadastro" />
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Card className="border border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Building2 className="text-success" size={18} />
                <span className="text-sm font-display font-semibold">Unidades de Negócio</span>
              </div>
              <p className="text-3xl font-display font-bold">{businessUnits.length}</p>
              <Button size="sm" onClick={openNewBusinessUnit}>Cadastrar BU</Button>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Boxes className="text-primary" size={18} />
                <span className="text-sm font-display font-semibold">Produtos</span>
              </div>
              <p className="text-3xl font-display font-bold">{produtos.length}</p>
              <Button size="sm" onClick={openNewProduto}>Cadastrar Produto</Button>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <FolderKanban className="text-primary" size={18} />
                <span className="text-sm font-display font-semibold">Projetos</span>
              </div>
              <p className="text-3xl font-display font-bold">{projetos.length}</p>
              <Button size="sm" onClick={openNewProjeto}>Cadastrar Projeto</Button>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <ListTodo className="text-warning" size={18} />
                <span className="text-sm font-display font-semibold">Tarefas</span>
              </div>
              <p className="text-3xl font-display font-bold">{tarefas.length}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={openNewTarefa}>Cadastrar Tarefa</Button>
                <Button size="sm" variant="outline" onClick={openNewSubtarefa}>Cadastrar Subtarefa</Button>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Users className="text-info" size={18} />
                <span className="text-sm font-display font-semibold">Recursos</span>
              </div>
              <p className="text-3xl font-display font-bold">{recursos.length}</p>
              <Button size="sm" onClick={openNewRecurso}>Cadastrar Recurso</Button>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => {
          const next = new URLSearchParams(searchParams);
          next.set("tab", value);
          setSearchParams(next, { replace: true });
        }} className="space-y-4">
          <TabsList>
            <TabsTrigger value="business-units">Unidades de Negócio</TabsTrigger>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="projetos">Projetos</TabsTrigger>
            <TabsTrigger value="tarefas">Tarefas e Subtarefas</TabsTrigger>
            <TabsTrigger value="recursos">Recursos</TabsTrigger>
          </TabsList>

          <TabsContent value="business-units">
            <Card className="border border-border">
              <CardContent className="p-5 space-y-3 text-sm text-muted-foreground">
                <p>Unidades de negócio com nome, head, liderança técnica, liderança operacional e responsável comercial.</p>
                <p>Cada projeto deve estar vinculado a uma unidade de negócio para manter a governança da carteira.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={openNewBusinessUnit}>Cadastrar Unidade de Negócio</Button>
                </div>
                <div className="space-y-2 pt-3">
                  {businessUnits.map((item) => (
                    <div key={item.id ?? item.nome} className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{item.nome}</div>
                        <div className="text-xs">
                          Head: {item.head || "—"} | Líder Tec: {item.liderTec || "—"} | Líder Op: {item.liderOp || "—"} | Comercial: {item.comercial || "—"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedBusinessUnit(item);
                          setBusinessUnitOpen(true);
                        }}
                      >
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="produtos">
            <Card className="border border-border">
              <CardContent className="p-5 space-y-3 text-sm text-muted-foreground">
                <p>Produtos vinculados a unidades de negócio, com identificador autoincremental e nome único por contexto operacional.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={openNewProduto}>Cadastrar Produto</Button>
                </div>
                <div className="space-y-2 pt-3">
                  {produtos.map((item) => (
                    <div key={item.id ?? item.nome} className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{item.nome}</span>
                          <Badge variant="outline" className="font-mono">ID {item.id ?? "novo"}</Badge>
                          <Badge variant="outline">{item.businessUnitName || "Sem BU"}</Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedProduto(item);
                          setProdutoOpen(true);
                        }}
                      >
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projetos">
            <Card className="border border-border">
              <CardContent className="p-5 space-y-2 text-sm text-muted-foreground">
                <p>Cadastro com `ID do projeto` único, tipo de projeto, unidade de negócio obrigatória, responsável, datas previstas/reais e acompanhamento financeiro.</p>
                <p>O `ID do projeto` fica separado da estrutura de tarefas, como em um ERP.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={openNewProjeto}>Cadastrar Projeto</Button>
                </div>
                <div className="space-y-2 pt-3">
                  {projetos.map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{item.projeto}</span>
                          <Badge variant="outline" className="font-mono">{item.projectId || "sem-id"}</Badge>
                          <Badge variant="outline">{item.projectType || "Projeto"}</Badge>
                          <Badge variant="outline">{item.businessUnitName || "Sem BU"}</Badge>
                          {item.produtoName ? <Badge variant="outline">{item.produtoName}</Badge> : null}
                        </div>
                        <div className="text-xs">
                          Responsável: {item.responsavel || "—"} | Início Prev.: {item.dataInicioPlanej || "—"} | Fim Prev.: {item.dataFimPlanej || "—"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedProjeto(item);
                          setProjetoOpen(true);
                        }}
                      >
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tarefas">
            <Card className="border border-border">
              <CardContent className="p-5 space-y-3 text-sm text-muted-foreground">
                <p>Tarefas e subtarefas com até {MAX_TASK_WBS_DEPTH} níveis de hierarquia, predecessoras, recursos atribuídos, duração e datas reais.</p>
                <p>O ID visível da tarefa é sequencial por projeto e o WBS representa apenas a hierarquia.</p>
                <p>No cadastro de tarefa raiz, `Tarefa pai` não aparece. No cadastro de subtarefa, o vínculo com a tarefa pai é obrigatório.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={openNewTarefa}>Cadastrar Tarefa</Button>
                  <Button size="sm" variant="outline" onClick={openNewSubtarefa}>Cadastrar Subtarefa</Button>
                </div>
                <div className="space-y-2 pt-3">
                  {tarefas.slice().sort((a, b) => a.id.localeCompare(b.id)).map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{item.tarefa}</span>
                          <Badge variant="outline" className="font-mono">ID {getTaskBusinessId(item)}</Badge>
                          <Badge variant="outline" className="font-mono">WBS {getTaskDisplayHierarchy(item)}</Badge>
                          {item.parentId && <Badge variant="outline">Pai: {item.parentId}</Badge>}
                        </div>
                        <div className="text-xs">
                          Projeto: {item.projeto} | Recursos: {item.responsavel || "—"} | Status: {item.status}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedTarefa(item);
                          setTarefaOpen(true);
                        }}
                      >
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recursos">
            <Card className="border border-border">
              <CardContent className="p-5 space-y-3 text-sm text-muted-foreground">
                <p>Cadastro com nome, senioridade, tipo de recurso, multiplas especialidades, tarifas e capacidade maxima.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={openNewRecurso}>Cadastrar Recurso</Button>
                </div>
                <div className="space-y-2 pt-3">
                  {recursos.map((item) => (
                    <div key={`${item.id ?? item.nome}-${item.nome}`} className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{item.nome}</div>
                        <div className="text-xs">
                          Função: {item.funcao || "—"} | Senioridade: {item.seniority || "—"} | Especialidades: {(item.specialties || []).join(", ") || "—"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRecurso(item);
                          setRecursoOpen(true);
                        }}
                      >
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <BusinessUnitDialog
        open={businessUnitOpen}
        onOpenChange={(open) => {
          setBusinessUnitOpen(open);
          if (!open) setSelectedBusinessUnit(null);
        }}
        businessUnit={selectedBusinessUnit}
      />
      <ProjetoDialog
        open={projetoOpen}
        onOpenChange={(open) => {
          setProjetoOpen(open);
          if (!open) setSelectedProjeto(null);
        }}
        projeto={selectedProjeto}
      />
      <ProdutoDialog
        open={produtoOpen}
        onOpenChange={(open) => {
          setProdutoOpen(open);
          if (!open) setSelectedProduto(null);
        }}
        produto={selectedProduto}
      />
      <TarefaDialog
        open={tarefaOpen}
        onOpenChange={(open) => {
          setTarefaOpen(open);
          if (!open) setSelectedTarefa(null);
        }}
        tarefa={selectedTarefa}
        mode="task"
      />
      <TarefaDialog open={subtarefaOpen} onOpenChange={setSubtarefaOpen} mode="subtask" />
      <RecursoDialog
        open={recursoOpen}
        onOpenChange={(open) => {
          setRecursoOpen(open);
          if (!open) setSelectedRecurso(null);
        }}
        recurso={selectedRecurso}
      />
    </div>
  );
}
