import { Sun, Moon, KeyRound } from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/NotificationBell";
import ExcelImport from "@/components/ExcelImport";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { useAuth } from "@/contexts/AuthContext";

export default function Header({ title }: { title: string }) {
  const { theme, toggleTheme } = useTheme();
  const { user, canImport, logout } = useAuth();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 px-5 py-5">
        <div className="surface-panel flex min-h-16 items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Smart Project Governance</p>
          <h1 className="text-xl font-display font-bold text-foreground">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {canImport && <ExcelImport />}
            <NotificationBell />
            <div className="hidden rounded-xl border border-border/80 bg-muted/35 px-3 py-2 md:flex md:flex-col md:text-right">
              <span className="text-sm font-medium text-foreground">{user?.nome}</span>
              <span className="text-xs text-muted-foreground">{user?.roleLabel}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPasswordDialogOpen(true)} className="rounded-xl">
              <KeyRound size={16} className="mr-2" />
              Alterar senha
            </Button>
            <Button variant="outline" size="sm" onClick={() => void logout()} className="rounded-xl">
              Sair
            </Button>
            <Button variant="outline" size="icon" onClick={toggleTheme} className="rounded-xl">
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
          </div>
        </div>
      </header>
      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </>
  );
}
