import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  GanttChart,
  Users,
  ClipboardList,
  Shield,
  Link2,
  Gauge,
  History,
  BarChart3,
  GitBranch,
  Boxes,
  Building2,
  MessageSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import logo from "@/assets/logo_abc.png";
import { useAuth } from "@/contexts/AuthContext";

type RoleGuard = (role?: string) => boolean;

interface NavSubItem {
  to: string;
  icon: LucideIcon;
  label: string;
  canSee?: RoleGuard;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  subItems?: NavSubItem[];
  canSee?: RoleGuard;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    heading: "Visão",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        subItems: [
          { to: "/?tab=resumo", icon: BarChart3, label: "Resumo" },
          { to: "/?tab=curva-s", icon: GitBranch, label: "Curva S" },
        ],
      },
      { to: "/projetos", label: "Projetos", icon: FolderKanban },
      { to: "/tarefas", label: "Tarefas", icon: ListTodo },
      { to: "/alocacoes", label: "Alocações", icon: Link2 },
      {
        to: "/capacidade",
        label: "Capacidade",
        icon: Gauge,
        canSee: (role?: string) => role === "admin" || role === "pmo" || role === "bi",
      },
      { to: "/gantt", label: "Gantt", icon: GanttChart },
    ],
  },
  {
    heading: "Cadastros",
    items: [
      {
        to: "/cadastro",
        label: "Cadastro",
        icon: ClipboardList,
        subItems: [
          { to: "/cadastro?tab=business-units", icon: Building2, label: "BUs" },
          { to: "/cadastro?tab=produtos", icon: Boxes, label: "Produtos" },
          { to: "/cadastro?tab=projetos", icon: FolderKanban, label: "Projetos" },
          { to: "/cadastro?tab=tarefas", icon: ListTodo, label: "Tarefas" },
          { to: "/cadastro?tab=recursos", icon: Users, label: "Recursos" },
        ],
        canSee: (role?: string) => role === "admin" || role === "pmo",
      },
      { to: "/recursos", label: "Recursos", icon: Users },
    ],
  },
  {
    heading: "Gestão",
    items: [
      {
        to: "/governanca",
        label: "Governança",
        icon: Shield,
        canSee: (role?: string) => role === "admin" || role === "pmo",
      },
      {
        to: "/historico",
        label: "Histórico",
        icon: History,
        subItems: [
          { to: "/historico?tab=comentarios", icon: MessageSquare, label: "Comentários" },
          { to: "/historico?tab=auditoria", icon: History, label: "Auditoria", canSee: (role?: string) => role === "admin" || role === "pmo" },
        ],
      },
    ],
  },
];

function MiniNavItem({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-all ${
          isActive
            ? "bg-white/10 text-sidebar-primary-foreground"
            : "text-sidebar-foreground/58 hover:bg-white/[0.04] hover:text-sidebar-foreground/88"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-lg border ${
              isActive
                ? "border-white/18 bg-white/10 text-sidebar-primary-foreground"
                : "border-white/8 bg-white/[0.03]"
            }`}
          >
            <Icon size={12} />
          </span>
          <span className="truncate font-medium">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => !item.canSee || item.canSee(user?.role))
        .map((item) => ({
          ...item,
          subItems: item.subItems?.filter((subItem) => !subItem.canSee || subItem.canSee(user?.role)) || [],
        })),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-72 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="rounded-[22px] bg-white px-4 py-4 shadow-[0_18px_30px_-24px_rgba(255,255,255,0.85)]">
          <img src={logo} alt="ABC Technology Group" className="h-10 w-auto" />
        </div>
        <div className="pt-4 text-center">
          <p className="font-display text-[1.05rem] font-semibold tracking-tight text-sidebar-foreground">Smart Project</p>
          <p className="mt-1 text-xs uppercase tracking-[0.26em] text-sidebar-foreground/42">Governance Suite</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-6 pb-4">
          {visibleSections.map((section) => (
            <div key={section.heading} className="space-y-2.5">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-sidebar-foreground/42">
                {section.heading}
              </p>
              <div className="space-y-1">
                {section.items.map(({ to, label, icon: Icon, subItems }) => (
                  <div key={to} className="space-y-1.5">
                    <NavLink
                      to={to}
                      end={to === "/"}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm font-medium transition-all ${
                          isActive
                            ? "bg-gradient-to-r from-blue-500 to-blue-400 text-sidebar-primary-foreground shadow-[0_18px_30px_-18px_rgba(59,130,246,0.95)]"
                            : "text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`
                      }
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/6 transition-colors group-hover:bg-white/10">
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px]">{label}</span>
                    </NavLink>

                    {subItems.length ? (
                      <div className="ml-12 space-y-1">
                        {subItems.map((subItem) => (
                          <MiniNavItem key={`${to}-${subItem.label}`} to={subItem.to} icon={subItem.icon} label={subItem.label} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-sidebar-border px-5 py-4">
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3.5">
          <p className="text-sm font-medium text-sidebar-foreground">{user?.nome ?? "Usuário"}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-sidebar-foreground/42">
            {user?.roleLabel ?? "Acesso"}
          </p>
        </div>
        <p className="mt-3 px-1 text-xs text-sidebar-foreground/38">Grupo ABC © 2026</p>
      </div>
    </aside>
  );
}
