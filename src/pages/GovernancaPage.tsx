import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/services/api";
import type { UserAccount } from "@/types/auth";
import UserDialog from "@/components/UserDialog";
import DeleteDialog from "@/components/DeleteDialog";
import ResetUserPasswordDialog from "@/components/ResetUserPasswordDialog";
import { Plus, Pencil, Trash2, Shield, Users, KeyRound } from "lucide-react";

export default function GovernancaPage() {
  const { toast } = useToast();
  const { projetos, recursos } = useData();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<UserAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await api.getUsers();
      setUsers(response);
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSave = async (payload: {
    nome: string;
    email: string;
    password?: string;
    role: UserAccount["role"];
    active: boolean;
    assignedProjectIds: number[];
    linkedResourceId?: number;
  }) => {
    try {
      if (selectedUser?.id) await api.updateUser(selectedUser.id, payload);
      else await api.createUser({ ...payload, password: payload.password || "ChangeMe@123" });
      await loadUsers();
      toast({ title: selectedUser ? "Usuário atualizado" : "Usuário criado" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
      throw e;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await api.deleteUser(deleteTarget.id);
      await loadUsers();
      toast({ title: "Usuário excluído" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Governança" />
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border border-border">
            <CardContent className="p-5 flex items-center gap-3">
              <Shield className="text-primary" size={18} />
              <div>
                <p className="text-xs text-muted-foreground">Seu perfil</p>
                <p className="text-lg font-display font-bold">{currentUser?.roleLabel}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-5 flex items-center gap-3">
              <Users className="text-info" size={18} />
              <div>
                <p className="text-xs text-muted-foreground">Usuários</p>
                <p className="text-lg font-display font-bold">{users.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Regras ativas</p>
                <p className="text-sm text-foreground">Admin atribui projetos ao PMO. PMO gerencia BI e Viewer.</p>
              </div>
              <Button size="sm" onClick={() => { setSelectedUser(null); setDialogOpen(true); }}>
                <Plus size={14} className="mr-1" /> Novo Usuário
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-border">
          <CardContent className="p-5 space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando usuários...</p>
            ) : (
              users.map((item) => (
                <div key={item.id} className="flex flex-col lg:flex-row lg:items-center gap-4 rounded-lg border border-border p-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{item.nome}</span>
                      <Badge variant="outline">{item.roleLabel}</Badge>
                      {!item.active && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.role === "pmo" && `Projetos atribuídos: ${item.assignedProjectIds.length
                        ? projetos.filter((projeto) => item.assignedProjectIds.includes(projeto.id)).map((projeto) => projeto.projeto).join(", ")
                        : "nenhum"}`}
                      {item.role === "viewer" && `Recurso vinculado: ${item.linkedResourceName || "não vinculado"}`}
                      {item.role === "bi" && "Acesso global de leitura"}
                      {item.role === "admin" && "Acesso administrativo global"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Escopo operacional: {item.role === "viewer"
                        ? (item.assignedProjectIds.length
                          ? "legado por projetos"
                          : "somente alocações do recurso vinculado")
                        : item.role === "pmo"
                          ? "projetos atribuídos pelo administrador"
                        : "acesso global"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedUser(item); setDialogOpen(true); }}>
                      <Pencil size={14} className="mr-1" /> Editar
                    </Button>
                    {item.id !== currentUser?.id ? (
                      <Button variant="outline" size="sm" onClick={() => setPasswordResetTarget(item)}>
                        <KeyRound size={14} className="mr-1" /> Redefinir senha
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteTarget(item)}>
                      <Trash2 size={14} className="mr-1" /> Excluir
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={selectedUser}
        projetos={projetos}
        recursos={recursos}
        onSave={handleSave}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir Usuário"
        description={`Tem certeza que deseja excluir o usuário "${deleteTarget?.nome}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
      <ResetUserPasswordDialog
        open={!!passwordResetTarget}
        onOpenChange={(value) => !value && setPasswordResetTarget(null)}
        user={passwordResetTarget}
        onSuccess={loadUsers}
      />
    </div>
  );
}
