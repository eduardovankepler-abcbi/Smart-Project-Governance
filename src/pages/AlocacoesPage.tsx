import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import * as api from "@/services/api";
import type { Alocacao } from "@/data/projectData";
import AlocacaoDialog from "@/components/AlocacaoDialog";
import DeleteDialog from "@/components/DeleteDialog";

export default function AlocacoesPage() {
  const { toast } = useToast();
  const { canWrite, user } = useAuth();
  const { tarefas, recursos, refreshTarefas } = useData();
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAlocacao, setSelectedAlocacao] = useState<Alocacao | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Alocacao | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAlocacoes = async () => {
    setLoading(true);
    try {
      const data = await api.getAlocacoes();
      setAlocacoes(data);
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlocacoes();
  }, []);

  const filtered = useMemo(() => {
    return alocacoes.filter((item) => {
      const haystack = `${item.projeto || ""} ${item.tarefa || ""} ${item.resourceName || ""}`.toLowerCase();
      return !search || haystack.includes(search.toLowerCase());
    });
  }, [alocacoes, search]);

  const handleSave = async (payload: Alocacao) => {
    try {
      if (selectedAlocacao?.id) await api.updateAlocacao(selectedAlocacao.id, payload);
      else await api.createAlocacao(payload);
      await Promise.all([loadAlocacoes(), refreshTarefas()]);
      toast({ title: selectedAlocacao ? "Alocação atualizada" : "Alocação criada" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
      throw e;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await api.deleteAlocacao(deleteTarget.id);
      await Promise.all([loadAlocacoes(), refreshTarefas()]);
      toast({ title: "Alocação excluída" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Alocações" />
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-end gap-3">
          <Input placeholder="Buscar por projeto, tarefa ou recurso..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
          {canWrite && (
            <Button size="sm" onClick={() => { setSelectedAlocacao(null); setDialogOpen(true); }} className="ml-auto gap-1.5">
              <Plus size={14} /> Nova Alocação
            </Button>
          )}
        </div>

        <Card className="border border-border">
          <CardContent className="p-5 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Link2 className="text-primary" size={18} />
              <div>
                <p className="text-xs text-muted-foreground">Total de alocações</p>
                <p className="text-xl font-display font-bold">{filtered.length}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Perfil</p>
              <p className="text-sm font-medium text-foreground">{user?.roleLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Escopo atual</p>
              <p className="text-sm text-foreground">{user?.role === "viewer" ? "Somente suas alocações" : user?.role === "pmo" ? "Projetos atribuídos ao PMO" : "Visão permitida pelo perfil"}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {loading ? (
            <Card className="border border-border"><CardContent className="p-5 text-sm text-muted-foreground">Carregando alocações...</CardContent></Card>
          ) : filtered.map((item) => (
            <Card key={item.id} className="border border-border">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-semibold text-foreground">{item.tarefa}</span>
                      <Badge variant="outline" className="font-mono">{item.wbs || item.taskId}</Badge>
                      <Badge variant="outline">{item.projeto}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Recurso: <strong className="text-foreground">{item.resourceName}</strong>
                    </p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span>Unidades: <strong className="text-foreground">{item.units}</strong></span>
                      <span>Esforço previsto: <strong className="text-foreground">{item.work}</strong></span>
                      <span>Esforço realizado: <strong className="text-foreground">{item.actualWork}</strong></span>
                      <span>Esforço restante: <strong className="text-foreground">{item.remainingWork}</strong></span>
                      <span>Custo: <strong className="text-foreground">R$ {item.cost.toFixed(2)}</strong></span>
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedAlocacao(item); setDialogOpen(true); }}>
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 size={14} className="mr-1" /> Excluir
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {canWrite && (
        <AlocacaoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          alocacao={selectedAlocacao}
          tarefas={tarefas}
          recursos={recursos.filter((item) => !!item.id)}
          onSave={handleSave}
        />
      )}
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir Alocação"
        description={`Tem certeza que deseja excluir a alocação de "${deleteTarget?.resourceName}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
