import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ListTodo, GanttChart, Users, ClipboardList, Shield, Link2, Gauge, History } from "lucide-react";
import logo from "@/assets/logo_abc.png";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cadastro", label: "Cadastro", icon: ClipboardList, canSee: (role?: string) => role === "admin" || role === "pmo" },
  { to: "/governanca", label: "Governança", icon: Shield, canSee: (role?: string) => role === "admin" || role === "pmo" },
  { to: "/projetos", label: "Projetos", icon: FolderKanban },
  { to: "/tarefas", label: "Tarefas", icon: ListTodo },
  { to: "/alocacoes", label: "Alocações", icon: Link2 },
  { to: "/capacidade", label: "Capacidade", icon: Gauge, canSee: (role?: string) => role === "admin" || role === "pmo" || role === "bi" },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/gantt", label: "Gantt", icon: GanttChart },
  { to: "/recursos", label: "Recursos", icon: Users },
];

export default function Sidebar() {
  const { user } = useAuth();
  const visibleItems = navItems.filter((item) => !item.canSee || item.canSee(user?.role));

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-4">
        <div className="rounded-2xl border border-white/10 bg-white/95 px-4 py-4 text-slate-900 shadow-sm">
          <div className="flex items-center gap-3">
            <img src={logo} alt="ABC Technology Group" className="h-8 w-auto" />
          </div>
        </div>
        <div className="px-1 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sidebar-foreground/55">Smart Project Governance</p>
          <p className="mt-2 text-sm font-medium leading-6 text-sidebar-foreground/88">
            Portfólio, governança e execução em uma camada única.
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_10px_30px_-18px_rgba(239,68,68,0.95)]"
                  : "text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`
            }
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 transition-colors group-hover:bg-white/10">
              <Icon size={16} />
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
          <p className="text-xs font-medium text-sidebar-foreground">{user?.nome ?? "Usuário"}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/50">
            {user?.roleLabel ?? "Acesso"}
          </p>
        </div>
        <p className="mt-3 px-1 text-xs text-sidebar-foreground/45">Grupo ABC © 2026</p>
      </div>
    </aside>
  );
}
