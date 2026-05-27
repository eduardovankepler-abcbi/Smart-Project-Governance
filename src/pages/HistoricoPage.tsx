import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import type { AuditLog, Comentario } from "@/data/projectData";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, History, Pencil, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { buildTaskDisplayLabel } from "@/utils/taskIdentity";

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function normalizeCommentType(value?: string): NonNullable<Comentario["commentType"]> {
  return value === "decision" || value === "action" || value === "risk" || value === "issue" ? value : "comment";
}

function normalizeResolutionStatus(value?: string): NonNullable<Comentario["resolutionStatus"]> {
  return value === "resolved" ? "resolved" : "open";
}

export default function HistoricoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { projetos, tarefas } = useData();
  const { canWrite, hasRole } = useAuth();
  const { toast } = useToast();
  const requestedTab = searchParams.get("tab");
  const initialTab = requestedTab === "auditoria" ? "auditoria" : "comentarios";
  const [tab, setTab] = useState(initialTab);
  const [comments, setComments] = useState<Comentario[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [entityType, setEntityType] = useState<"projeto" | "tarefa">("projeto");
  const [projectId, setProjectId] = useState<string>("all");
  const [taskId, setTaskId] = useState<string>("all");
  const [content, setContent] = useState("");
  const [commentType, setCommentType] = useState<NonNullable<Comentario["commentType"]>>("comment");
  const [commentTypeFilter, setCommentTypeFilter] = useState<NonNullable<Comentario["commentType"]> | "all">("all");
  const [ownerName, setOwnerName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState<NonNullable<Comentario["resolutionStatus"]>>("open");
  const [resolutionStatusFilter, setResolutionStatusFilter] = useState<NonNullable<Comentario["resolutionStatus"]> | "all">("all");
  const [editingComment, setEditingComment] = useState<Comentario | null>(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditEntityType, setAuditEntityType] = useState("all");
  const canSeeAudit = hasRole("admin", "pmo");

  useEffect(() => {
    const nextTab = requestedTab === "auditoria" && canSeeAudit ? "auditoria" : "comentarios";
    setTab(nextTab);
  }, [requestedTab, canSeeAudit]);

  const filteredTasks = useMemo(() => {
    if (projectId === "all") return tarefas;
    const projectName = projetos.find((item) => item.id === Number(projectId))?.projeto;
    return tarefas.filter((item) => item.projeto === projectName);
  }, [tarefas, projetos, projectId]);

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const payload = await api.getComentarios({
        projectId: projectId !== "all" ? Number(projectId) : undefined,
        taskId: entityType === "tarefa" && taskId !== "all" ? taskId : undefined,
        commentType: commentTypeFilter,
        resolutionStatus: resolutionStatusFilter,
      });
      setComments(Array.isArray(payload) ? payload : []);
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoadingComments(false);
    }
  };

  const loadAudit = async () => {
    if (!canSeeAudit) return;
    setLoadingAudit(true);
    try {
      const payload = await api.getAuditoria({
        projectId: projectId !== "all" ? Number(projectId) : undefined,
        entityType: auditEntityType !== "all" ? auditEntityType : undefined,
        search: auditSearch || undefined,
      });
      setAuditLogs(Array.isArray(payload) ? payload : []);
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [projectId, taskId, entityType, commentTypeFilter, resolutionStatusFilter]);

  useEffect(() => {
    loadAudit();
  }, [projectId, auditEntityType, auditSearch, canSeeAudit]);

  const resetForm = () => {
    setEditingComment(null);
    setContent("");
    setCommentType("comment");
    setOwnerName("");
    setDueDate("");
    setResolutionStatus("open");
  };

  const commentTypeLabel: Record<NonNullable<Comentario["commentType"]>, string> = {
    comment: "Comentário",
    decision: "Decisão",
    action: "Pendência",
    risk: "Risco",
    issue: "Impedimento",
  };
  const safeComments = Array.isArray(comments) ? comments : [];
  const safeAuditLogs = Array.isArray(auditLogs) ? auditLogs : [];
  const openActionableCount = safeComments.filter((item) => {
    const type = normalizeCommentType(item.commentType);
    const status = normalizeResolutionStatus(item.resolutionStatus);
    return status !== "resolved" && type !== "comment";
  }).length;

  const handleSaveComment = async () => {
    try {
      if (!content.trim()) {
        toast({ title: "Erro", description: "Comentário é obrigatório", variant: "destructive" });
        return;
      }
      if (entityType === "projeto" && projectId === "all") {
        toast({ title: "Erro", description: "Selecione um projeto para comentar", variant: "destructive" });
        return;
      }
      if (entityType === "tarefa" && taskId === "all") {
        toast({ title: "Erro", description: "Selecione uma tarefa para comentar", variant: "destructive" });
        return;
      }

      if (editingComment?.id) {
        await api.updateComentario(editingComment.id, {
          content,
          commentType,
          ownerName,
          dueDate,
          resolutionStatus,
        });
      } else {
        await api.createComentario({
          entityType,
          projectId: projectId !== "all" ? Number(projectId) : undefined,
          taskId: entityType === "tarefa" && taskId !== "all" ? taskId : undefined,
          content,
          commentType,
          ownerName,
          dueDate,
          resolutionStatus,
        });
      }
      await Promise.all([loadComments(), canSeeAudit ? loadAudit() : Promise.resolve()]);
      resetForm();
      toast({ title: editingComment ? "Comentário atualizado" : "Comentário criado" });
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleDeleteComment = async (commentId?: number) => {
    if (!commentId) return;
    try {
      await api.deleteComentario(commentId);
      await Promise.all([loadComments(), canSeeAudit ? loadAudit() : Promise.resolve()]);
      if (editingComment?.id === commentId) resetForm();
      toast({ title: "Comentário removido" });
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Histórico" />
      <div className="space-y-6 p-6 animate-fade-in">
        <Tabs value={tab} onValueChange={(value) => {
          const nextTab = value === "auditoria" && canSeeAudit ? "auditoria" : "comentarios";
          setTab(nextTab);
          const next = new URLSearchParams(searchParams);
          next.set("tab", nextTab);
          setSearchParams(next, { replace: true });
        }} className="space-y-4">
          <TabsList>
            <TabsTrigger value="comentarios">Comentários</TabsTrigger>
            {canSeeAudit ? <TabsTrigger value="auditoria">Auditoria</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="comentarios" className="space-y-4">
            <Card className="border border-border">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap gap-3">
                  <Select value={entityType} onValueChange={(value) => {
                    setEntityType(value as "projeto" | "tarefa");
                    setTaskId("all");
                  }}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projeto">Projeto</SelectItem>
                      <SelectItem value="tarefa">Tarefa</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={projectId} onValueChange={(value) => { setProjectId(value); if (value === "all") setTaskId("all"); }}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Projeto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os projetos</SelectItem>
                      {projetos.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>{item.projeto}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {entityType === "tarefa" ? (
                    <Select value={taskId} onValueChange={setTaskId}>
                      <SelectTrigger className="w-72"><SelectValue placeholder="Tarefa" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as tarefas</SelectItem>
                          {filteredTasks.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{buildTaskDisplayLabel(item)}</SelectItem>
                          ))}
                        </SelectContent>
                    </Select>
                  ) : null}
                  <Select value={commentTypeFilter} onValueChange={(value) => setCommentTypeFilter(value as NonNullable<Comentario["commentType"]> | "all")}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="comment">Comentários</SelectItem>
                      <SelectItem value="decision">Decisões</SelectItem>
                      <SelectItem value="action">Pendências</SelectItem>
                      <SelectItem value="risk">Riscos</SelectItem>
                      <SelectItem value="issue">Impedimentos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={resolutionStatusFilter} onValueChange={(value) => setResolutionStatusFilter(value as NonNullable<Comentario["resolutionStatus"]> | "all")}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="open">Abertos</SelectItem>
                      <SelectItem value="resolved">Resolvidos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{safeComments.length} registros</Badge>
                  <Badge variant={openActionableCount > 0 ? "destructive" : "secondary"}>{openActionableCount} acionáveis abertos</Badge>
                </div>

                {canWrite ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{editingComment ? "Editar comentário" : "Novo comentário"}</p>
                        <p className="text-xs text-muted-foreground">Comentários ficam vinculados ao projeto ou tarefa selecionados acima.</p>
                      </div>
                      {editingComment ? <Button variant="outline" size="sm" onClick={resetForm}>Cancelar edição</Button> : null}
                    </div>
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Registre contexto, decisões, pendências ou alinhamentos importantes."
                      className="min-h-28"
                    />
                    <div className="grid gap-3 md:grid-cols-4">
                      <Select value={commentType} onValueChange={(value) => setCommentType(value as NonNullable<Comentario["commentType"]>)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comment">Comentário</SelectItem>
                          <SelectItem value="decision">Decisão</SelectItem>
                          <SelectItem value="action">Pendência</SelectItem>
                          <SelectItem value="risk">Risco</SelectItem>
                          <SelectItem value="issue">Impedimento</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Responsável" />
                      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      <Select value={resolutionStatus} onValueChange={(value) => setResolutionStatus(value as NonNullable<Comentario["resolutionStatus"]>)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Aberto</SelectItem>
                          <SelectItem value="resolved">Resolvido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSaveComment}>{editingComment ? "Salvar alteração" : "Publicar comentário"}</Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {loadingComments ? (
                    <Card className="border border-border"><CardContent className="p-4 text-sm text-muted-foreground">Carregando comentários...</CardContent></Card>
                  ) : safeComments.length === 0 ? (
                    <Card className="border border-border"><CardContent className="p-4 text-sm text-muted-foreground">Nenhum comentário encontrado para o filtro atual.</CardContent></Card>
                  ) : safeComments.map((item, index) => {
                    const type = normalizeCommentType(item.commentType);
                    const status = normalizeResolutionStatus(item.resolutionStatus);
                    return (
                    <Card key={item.id || `${item.entityType}-${index}`} className="border border-border">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <MessageSquare size={16} className="text-primary" />
                          <Badge variant="outline">{item.entityType === "projeto" ? "Projeto" : "Tarefa"}</Badge>
                          <Badge variant={type === "issue" || type === "risk" ? "destructive" : "secondary"}>
                            {commentTypeLabel[type]}
                          </Badge>
                          <Badge variant={status === "resolved" ? "secondary" : "outline"}>
                            {status === "resolved" ? <CheckCircle2 size={12} className="mr-1" /> : <AlertTriangle size={12} className="mr-1" />}
                            {status === "resolved" ? "Resolvido" : "Aberto"}
                          </Badge>
                          {item.projectName ? <Badge variant="outline">{item.projectName}</Badge> : null}
                          {item.taskName ? <Badge variant="outline">{item.taskName}</Badge> : null}
                        </div>
                        <p className="text-sm leading-6 text-foreground whitespace-pre-wrap">{item.content}</p>
                        {(item.ownerName || item.dueDate) ? (
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {item.ownerName ? <span>Responsável: <strong className="text-foreground">{item.ownerName}</strong></span> : null}
                            {item.dueDate ? <span>Prazo: <strong className="text-foreground">{item.dueDate}</strong></span> : null}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>{item.authorName || "Sistema"} · {formatDateTime(item.createdAt)}</span>
                          {canWrite ? (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingComment(item);
                                  setEntityType(item.entityType);
                                  setProjectId(item.projectId ? String(item.projectId) : "all");
                                  setTaskId(item.taskId || "all");
                                  setContent(item.content);
                                  setCommentType(type);
                                  setOwnerName(item.ownerName || "");
                                  setDueDate(item.dueDate || "");
                                  setResolutionStatus(status);
                                }}
                              >
                                <Pencil size={14} className="mr-1" /> Editar
                              </Button>
                              <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDeleteComment(item.id)}>
                                <Trash2 size={14} className="mr-1" /> Excluir
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {canSeeAudit ? (
            <TabsContent value="auditoria" className="space-y-4">
              <Card className="border border-border">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap gap-3">
                    <Input
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Buscar por resumo, usuário ou entidade..."
                      className="w-72"
                    />
                    <Select value={auditEntityType} onValueChange={setAuditEntityType}>
                      <SelectTrigger className="w-52"><SelectValue placeholder="Entidade" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as entidades</SelectItem>
                        <SelectItem value="projeto">Projeto</SelectItem>
                        <SelectItem value="tarefa">Tarefa</SelectItem>
                        <SelectItem value="recurso">Recurso</SelectItem>
                        <SelectItem value="produto">Produto</SelectItem>
                        <SelectItem value="user">Usuário</SelectItem>
                        <SelectItem value="comentario">Comentário</SelectItem>
                        <SelectItem value="alocacao">Alocação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    {loadingAudit ? (
                      <Card className="border border-border"><CardContent className="p-4 text-sm text-muted-foreground">Carregando auditoria...</CardContent></Card>
                    ) : safeAuditLogs.length === 0 ? (
                      <Card className="border border-border"><CardContent className="p-4 text-sm text-muted-foreground">Nenhum evento de auditoria encontrado.</CardContent></Card>
                    ) : safeAuditLogs.map((item, index) => (
                      <Card key={item.id || `${item.entityType}-${index}`} className="border border-border">
                        <CardContent className="space-y-3 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <History size={16} className="text-primary" />
                            <Badge variant="outline">{item.entityType}</Badge>
                            <Badge variant="outline">{item.action}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                          </div>
                          <p className="text-sm text-foreground">{item.summary}</p>
                          <div className="text-xs text-muted-foreground">
                            {item.actorName || "Sistema"} {item.actorRole ? `· ${item.actorRole}` : ""}
                          </div>
                          {(item.beforeJson || item.afterJson) ? (
                            <details className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                              <summary className="cursor-pointer font-medium text-foreground">Detalhes técnicos</summary>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <div>
                                  <p className="mb-1 font-medium text-foreground">Antes</p>
                                  <pre className="whitespace-pre-wrap break-words">{item.beforeJson || "—"}</pre>
                                </div>
                                <div>
                                  <p className="mb-1 font-medium text-foreground">Depois</p>
                                  <pre className="whitespace-pre-wrap break-words">{item.afterJson || "—"}</pre>
                                </div>
                              </div>
                            </details>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
