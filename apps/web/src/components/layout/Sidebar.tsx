import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListChecks, History, BookOpen, GitPullRequest, LogOut, Users } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { signOut } from "@/store/slices/authSlice";
import { cn } from "@/lib/utils";

const leaderNavItems = [
  { to: "/membros", label: "Membros", icon: Users, end: false },
];

const navItems = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/regras", label: "Regras de Review", icon: ListChecks, end: false },
  { to: "/historico", label: "Histórico", icon: History, end: false },
  { to: "/adrs", label: "ADRs", icon: BookOpen, end: false },
];

export function Sidebar() {
  const dispatch = useAppDispatch();
  const { email, role } = useAppSelector((s) => s.auth);

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-gray-800 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
          <GitPullRequest className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-semibold tracking-tight text-white">
          DevReview
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {[...navItems, ...(role === "leader" ? leaderNavItems : [])].map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800/60 hover:text-white"
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-2 border-t border-gray-800 px-4 py-3">
        {email && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-gray-300" title={email}>{email}</p>
              <p className="text-xs text-gray-600">{role === "leader" ? "Líder" : "Membro"}</p>
            </div>
            <button
              type="button"
              title="Sair"
              aria-label="Sair"
              onClick={() => dispatch(signOut())}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        <p className="text-xs text-gray-600">v0.1.0 — Alura MCP Course</p>
      </div>
    </aside>
  );
}
