import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/services/api";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    try {
      if (!currentPassword || !nextPassword || !confirmPassword) {
        toast({ title: "Erro", description: "Preencha todos os campos da senha.", variant: "destructive" });
        return;
      }
      if (nextPassword !== confirmPassword) {
        toast({ title: "Erro", description: "A confirmação da nova senha não confere.", variant: "destructive" });
        return;
      }
      setSaving(true);
      await api.changePassword(currentPassword, nextPassword);
      toast({
        title: "Senha atualizada",
        description: "A nova senha já está ativa. As demais sessões foram encerradas automaticamente.",
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
          <DialogTitle>Alterar senha</DialogTitle>
          <DialogDescription>
            Use uma senha forte com pelo menos 8 caracteres, letra maiúscula, minúscula, número e caractere especial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="next-password">Nova senha</Label>
            <Input
              id="next-password"
              type="password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              placeholder="Digite a nova senha"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
