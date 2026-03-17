import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";
import type { UserAccount } from "@/types/auth";

interface ResetUserPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserAccount | null;
  onSuccess: () => Promise<void> | void;
}

export default function ResetUserPasswordDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: ResetUserPasswordDialogProps) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirmPassword("");
      setSaving(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    try {
      if (!user?.id) return;
      if (!password || !confirmPassword) {
        toast({ title: "Erro", description: "Preencha e confirme a nova senha.", variant: "destructive" });
        return;
      }
      if (password !== confirmPassword) {
        toast({ title: "Erro", description: "A confirmação da nova senha não confere.", variant: "destructive" });
        return;
      }
      setSaving(true);
      await api.resetUserPassword(user.id, password);
      await onSuccess();
      toast({
        title: "Senha redefinida",
        description: `A senha de ${user.nome} foi atualizada e as sessões anteriores foram encerradas.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha temporária para <strong>{user?.nome || "o usuário"}</strong>. Ao salvar, as sessões ativas dessa conta serão encerradas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reset-password">Nova senha temporária</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ex.: Temp@1234"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-password-confirm">Confirmar nova senha</Label>
            <Input
              id="reset-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Salvando..." : "Redefinir senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
