import { useEffect } from "react";
import { GitPullRequest, ListChecks, BookOpen, AlertTriangle, Building2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/shared/StatCard";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchRules } from "@/store/slices/rulesSlice";
import { fetchHistory } from "@/store/slices/historySlice";
import { fetchAdrs } from "@/store/slices/adrsSlice";
import {
  issueSeverity,
  selectActiveRulesCount,
  selectDashboardAvgIssues,
  selectRecentPeriodHistory,
  selectTeamsCount,
} from "@/store/selectors";

export function DashboardPage() {
  const dispatch = useAppDispatch();
  const rules = useAppSelector((s) => s.rules.items);
  const history = useAppSelector(selectRecentPeriodHistory);
  const activeRules = useAppSelector(selectActiveRulesCount);
  const avgIssues = useAppSelector(selectDashboardAvgIssues);
  const adrs = useAppSelector((s) => s.adrs.items);
  const teamsCount = useAppSelector(selectTeamsCount);
  const isAdmin = useAppSelector((s) => s.auth.isAdmin);

  const teamId = useAppSelector((s) => s.auth.teamId);

  useEffect(() => {
    if (!teamId) return;
    dispatch(fetchRules(teamId));
    dispatch(fetchHistory(teamId));
    dispatch(fetchAdrs(teamId));
  }, [dispatch, teamId]);

  const recentHistory = history.slice(0, 3);
  const recentRules = rules.slice(0, 4);

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header title="Início" />

      <div className="flex-1 space-y-6 p-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            title="Total de Reviews"
            value={history.length}
            icon={GitPullRequest}
            iconColor="bg-blue-500/20 text-blue-400"
            description="Últimos 30 dias"
          />
          <StatCard
            title="Regras Ativas"
            value={activeRules}
            icon={ListChecks}
            iconColor="bg-green-500/20 text-green-400"
            description={`de ${rules.length} regras cadastradas`}
          />
          <StatCard
            title="ADRs"
            value={adrs.length}
            icon={BookOpen}
            iconColor="bg-purple-500/20 text-purple-400"
            description="Decisões arquiteturais"
          />
          <StatCard
            title="Times"
            value={teamsCount}
            icon={Building2}
            iconColor="bg-cyan-500/20 text-cyan-400"
            description={
              isAdmin
                ? "Cadastrados na plataforma"
                : teamsCount === 1
                  ? "Time do qual você faz parte"
                  : "Times dos quais você faz parte"
            }
          />
          <StatCard
            title="Média de Issues"
            value={avgIssues}
            icon={AlertTriangle}
            iconColor="bg-amber-500/20 text-amber-400"
            description="Por PR revisado"
          />
        </div>

        {/* Recent content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent reviews */}
          <div className="rounded-lg border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                Últimos Reviews
              </h2>
            </div>
            <div className="divide-y divide-gray-800">
              {recentHistory.map((review) => (
                <div key={review.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      #{review.pr_number}{" "}
                      <span className="text-gray-400">{review.repo}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {review.review_summary}
                    </p>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <SeverityBadge severity={issueSeverity(review.issues_found)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent rules */}
          <div className="rounded-lg border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                Regras Recentes
              </h2>
            </div>
            <div className="divide-y divide-gray-800">
              {recentRules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{rule.rule}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <CategoryBadge category={rule.category} />
                    <SeverityBadge severity={rule.severity} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
