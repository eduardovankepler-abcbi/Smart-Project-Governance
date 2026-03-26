import { Sun, Moon, KeyRound, LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/NotificationBell";
import ExcelImport from "@/components/ExcelImport";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { useAuth } from "@/contexts/AuthContext";

function getInitials(name?: string) {
  return String(name || "SP")
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Header({ title }: { title: string }) {
  const { theme, toggleTheme } = useTheme();
  const { user, canImport, logout } = useAuth();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const initials = useMemo(() => getInitials(user?.nome), [user?.nome]);

  return (
    <>
      <header className="sticky top-0 z-30 -mx-6 mb-6 border-b border-white/6 bg-background/88 px-6 py-4 backdrop-blur-xl">
        <div className="flex min-h-14 items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Smart Project</p>
            <h1 className="text-lg font-display font-semibold text-foreground">{title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {canImport ? <ExcelImport /> : null}
            <NotificationBell />

            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-10 w-10 rounded-2xl border border-white/6 bg-white/[0.03]">
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setPasswordDialogOpen(true)} className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 text-muted-foreground hover:text-foreground">
              <KeyRound size={15} className="mr-2" />
              Senha
            </Button>

            <Button variant="ghost" size="sm" onClick={() => void logout()} className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 text-muted-foreground hover:text-foreground">
              <LogOut size={15} className="mr-2" />
              Sair
            </Button>

            <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-primary px-3 font-display text-sm font-semibold text-primary-foreground shadow-[0_18px_30px_-18px_rgba(59,130,246,0.95)]">
              {initials}
            </div>
          </div>
        </div>
      </header>
      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </>
  );
}
