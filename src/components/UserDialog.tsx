import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UserAccount, UserRole } from "@/types/auth";
import type { Projeto, Recurso } from "@/data/projectData";
import { useAuth } from "@/contexts/AuthContext";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserAccount | null;
  projetos: Projeto[];
  recursos: (Recurso & { id?: number })[];
  onSave: (payload: {
    nome: string;
    email: string;
    password?: string;
    role: UserRole;
    active: boolean;
    assignedProjectIds: number[];
    linkedResourceId?: number;
  }) => Promise<void>;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "pmo", label: "PMO" },
  { value: "bi", label: "BI" },
  { value: "viewer", label: "Viewer" },
];

export default function UserDialog({ open, onOpenChange, user, projetos, recursos, onSave }: UserDialogProps) {
  const { user: currentUser } = useAuth();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [active, setActive] = useState(true);
  const [assignedProjectIds, setAssignedProjectIds] = useState<number[]>([]);
  const [linkedResourceId, setLinkedResourceId] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(user?.nome || "");
    setEmail(user?.email || "");
    setPassword("");
    setRole(user?.role || "viewer");
    setActive(user?.active ?? true);
    setAssignedProjectIds(user?.assignedProjectIds || []);
    setLinkedResourceId(user?.linkedResourceId);
  }, [open, user]);

  const allowedRoles = currentUser?.role === "admin"
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((item) => item.value === "bi" || item.value === "viewer");

  const toggleProject = (projectId: number, checked: boolean) => {
    setAssignedProjectIds((current) => checked
      ? [...current, projectId]
      : current.filter((item) => item !== projectId)
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave({
        nome,
        email,
        password: password || undefined,
        role,
        active,
        assignedProjectIds: role === "pmo" ? assignedProjectIds : [],
        linkedResourceId,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Email de acesso</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Perfil de acesso</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedRoles.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{user ? "Nova senha" : "Senha inicial"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={user ? "Preencha apenas se quiser trocar a senha" : ""} />
          </div>
          <div className="col-span-2 flex items-center gap-3 rounded-lg border border-border p-3">
            <Checkbox id="active-user" checked={active} onCheckedChange={(checked) => setActive(checked === true)} />
            <Label htmlFor="active-user">Usuário ativo</Label>
          </div>
          {role === "pmo" && currentUser?.role === "admin" && (
            <div className="col-span-2 space-y-3 rounded-lg border border-border p-4">
              <div>
                <Label>Projetos atribuídos ao PMO</Label>
                <p className="text-xs text-muted-foreground">O PMO só poderá trabalhar nos projetos atribuídos pelo administrador.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {projetos.map((projeto) => (
                  <label key={projeto.id} className="flex items-center gap-3 rounded-md border border-border p-2 text-sm">
                    <Checkbox
                      checked={assignedProjectIds.includes(projeto.id)}
                      onCheckedChange={(checked) => toggleProject(projeto.id, checked === true)}
                    />
                    <span>{projeto.projectId || projeto.projeto}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {role === "viewer" && (
            <div className="col-span-2 space-y-3 rounded-lg border border-border p-4">
              <div>
                <Label>Recurso vinculado ao usuário Viewer</Label>
                <p className="text-xs text-muted-foreground">O viewer verá somente as alocações do recurso vinculado a esta conta.</p>
              </div>
              <Select value={linkedResourceId ? String(linkedResourceId) : ""} onValueChange={(value) => setLinkedResourceId(Number(value))}>
                <SelectTrigger><SelectValue placeholder="Selecione o recurso" /></SelectTrigger>
                <SelectContent>
                  {recursos.filter((item) => !!item.id).map((recurso) => (
                    <SelectItem key={recurso.id} value={String(recurso.id)}>
                      {recurso.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
