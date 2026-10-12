import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListChecks, History, BookOpen, GitPullRequest, LogOut, Users, Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectSwitchableTeams } from "@/store/selectors";
import { setActiveTeam, signOut } from "@/store/slices/authSlice";
import { cn } from "@/lib/utils";

const membersNavItem = { to: "/membros", label: "Membros", icon: Users, end: false };
const teamsNavItem = { to: "/times", label: "Times", icon: Building2, end: false };

const navItems = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/regras", label: "Regras de Review", icon: ListChecks, end: false },
  { to: "/historico", label: "Histórico", icon: History, end: false },
  { to: "/adrs", label: "ADRs", icon: BookOpen, end: false },
];

export function Sidebar() {
  const dispatch = useAppDispatch();
  const { email, role, isAdmin, teamId } = useAppSelector((s) => s.auth);
  const switchableTeams = useAppSelector(selectSwitchableTeams);
  const visibleItems = useMemo(() => {
    const items = [...navItems];
    if (isAdmin || role === "leader") items.push(membersNavItem);
    if (isAdmin) items.push(teamsNavItem);
    return items;
  }, [isAdmin, role]);
  const roleLabel = isAdmin
    ? "Administrador"
    : role === "leader"
      ? "Líder"
      : "Membro";

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

      {/* Time ativo (aparece quando há mais de um time para escolher) */}
      {switchableTeams.length > 1 && (
        <div className="border-b border-gray-800 px-3 py-3">
          <Select
            value={teamId ?? undefined}
            onValueChange={(id) => dispatch(setActiveTeam(id))}
          >
            <SelectTrigger
              aria-label="Time ativo"
              className="border-gray-700 bg-gray-800 text-sm text-white"
            >
              <SelectValue placeholder="Selecione o time" />
            </SelectTrigger>
            <SelectContent className="border-gray-700 bg-gray-900">
              {switchableTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleItems.map(({ to, label, icon: Icon, end }) => (
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
              <p className="text-xs text-gray-600">{roleLabel}</p>
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
