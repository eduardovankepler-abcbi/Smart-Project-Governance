import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useData } from "@/contexts/DataContext";

const NOTIFICATION_READ_STORAGE_KEY = "abc_pm_read_notifications_v1";

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

interface Notification {
  id: string;
  type: "atrasada" | "proxima";
  tarefa: string;
  projeto: string;
  message: string;
}

export default function NotificationBell() {
  const { tarefas } = useData();
  const [open, setOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(NOTIFICATION_READ_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const notifications = useMemo<Notification[]>(() => {
    const now = new Date();
    const alerts: Notification[] = [];

    tarefas.forEach(t => {
      if (t.status === "Atrasado") {
        alerts.push({
          id: `late-${t.id}`,
          type: "atrasada",
          tarefa: t.tarefa,
          projeto: t.projeto,
          message: `Tarefa atrasada desde ${t.dataFimPlanej || "N/A"}`,
        });
      } else if (t.status !== "Concluído") {
        const fim = parseDate(t.dataFimPlanej);
        if (fim) {
          const diffDays = Math.ceil((fim.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            alerts.push({
              id: `soon-${t.id}`,
              type: "proxima",
              tarefa: t.tarefa,
              projeto: t.projeto,
              message: `Prazo em ${diffDays} dia(s) — ${t.dataFimPlanej}`,
            });
          }
        }
      }
    });

    return alerts.slice(0, 50);
  }, [tarefas]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NOTIFICATION_READ_STORAGE_KEY, JSON.stringify(readNotificationIds));
  }, [readNotificationIds]);

  useEffect(() => {
    const activeIds = new Set(notifications.map((notification) => notification.id));
    setReadNotificationIds((current) => current.filter((id) => activeIds.has(id)));
  }, [notifications]);

  useEffect(() => {
    if (!open || notifications.length === 0) return;
    setReadNotificationIds((current) => {
      const merged = new Set(current);
      notifications.forEach((notification) => merged.add(notification.id));
      return Array.from(merged);
    });
  }, [open, notifications]);

  const unreadCount = notifications.filter((notification) => !readNotificationIds.includes(notification.id)).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full relative">
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-4 py-3 border-b border-border">
          <h4 className="text-sm font-display font-semibold text-foreground">Notificações</h4>
          <p className="text-xs text-muted-foreground">
            {notifications.length} alerta(s) · {unreadCount} não lido(s)
          </p>
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Nenhum alerta</div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 hover:bg-muted/50 transition-colors ${readNotificationIds.includes(n.id) ? "opacity-70" : ""}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${n.type === "atrasada" ? "bg-destructive" : "bg-warning"}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{n.tarefa}</p>
                      <p className="text-[10px] text-muted-foreground">{n.projeto}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
