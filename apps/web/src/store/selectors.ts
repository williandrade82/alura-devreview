import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import type { AdrStatus, RuleSeverity } from "@/types";

const DASHBOARD_PERIOD_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/**
 * Severidade exibida para um review, conforme a quantidade de issues encontradas.
 */
export function issueSeverity(issues: number): RuleSeverity {
  if (issues >= 4) return "error";
  if (issues > 0) return "warning";
  return "info";
}

/**
 * Média de issues por review, formatada com uma casa decimal ("0" sem reviews).
 */
export function averageIssues(issuesPerReview: readonly number[]): string {
  if (issuesPerReview.length === 0) return "0";
  const total = issuesPerReview.reduce((acc, issues) => acc + issues, 0);
  return (total / issuesPerReview.length).toFixed(1);
}

const selectRules = (state: RootState) => state.rules.items;
const selectHistory = (state: RootState) => state.history.items;
const selectRepoFilter = (state: RootState) => state.history.repoFilter;

/** Quantidade de regras ativas do time. */
export const selectActiveRulesCount = createSelector(
  [selectRules],
  (rules) => rules.filter((rule) => rule.active).length
);

/** Reviews do período exibido no dashboard (últimos 30 dias). */
export const selectRecentPeriodHistory = createSelector(
  [selectHistory],
  (history) => {
    const since = Date.now() - DASHBOARD_PERIOD_DAYS * MS_PER_DAY;
    return history.filter((review) => new Date(review.reviewed_at).getTime() >= since);
  }
);

/** Média de issues por review no período do dashboard. */
export const selectDashboardAvgIssues = createSelector(
  [selectRecentPeriodHistory],
  (history) => averageIssues(history.map((review) => review.issues_found))
);

/** Reviews filtrados pelo repositório digitado na página de histórico. */
export const selectFilteredHistory = createSelector(
  [selectHistory, selectRepoFilter],
  (history, repoFilter) => {
    const term = repoFilter.toLowerCase();
    return history.filter(
      (review) => term === "" || review.repo.toLowerCase().includes(term)
    );
  }
);

/** Total de issues do histórico filtrado. */
export const selectFilteredTotalIssues = createSelector(
  [selectFilteredHistory],
  (history) => history.reduce((acc, review) => acc + review.issues_found, 0)
);

/** Média de issues por review do histórico filtrado. */
export const selectFilteredAvgIssues = createSelector(
  [selectFilteredHistory],
  (history) => averageIssues(history.map((review) => review.issues_found))
);

const selectMembers = (state: RootState) => state.members.items;
const selectCategoryFilter = (state: RootState) => state.rules.categoryFilter;
const selectSeverityFilter = (state: RootState) => state.rules.severityFilter;
const selectAdrs = (state: RootState) => state.adrs.items;
const selectAdrStatusFilter = (state: RootState) => state.adrs.statusFilter;

/** Regras filtradas por categoria e severidade na página de regras. */
export const selectFilteredRules = createSelector(
  [selectRules, selectCategoryFilter, selectSeverityFilter],
  (rules, category, severity) =>
    rules.filter(
      (rule) =>
        (category === "all" || rule.category === category) &&
        (severity === "all" || rule.severity === severity)
    )
);

/** ADRs filtradas pelo status selecionado nas abas. */
export const selectFilteredAdrs = createSelector(
  [selectAdrs, selectAdrStatusFilter],
  (adrs, status) =>
    status === "all" ? adrs : adrs.filter((adr) => adr.status === status)
);

/** Quantidade de ADRs por status (para os contadores das abas). */
export const selectAdrCountByStatus = createSelector([selectAdrs], (adrs) => {
  const counts: Record<AdrStatus, number> = {
    proposed: 0,
    accepted: 0,
    deprecated: 0,
  };
  for (const adr of adrs) counts[adr.status] += 1;
  return counts;
});

/** Solicitações de entrada aguardando aprovação de um líder. */
export const selectPendingMembers = createSelector([selectMembers], (members) =>
  members.filter((member) => member.status === "pending")
);

/** Membros já aprovados do time. */
export const selectApprovedMembers = createSelector(
  [selectMembers],
  (members) => members.filter((member) => member.status === "approved")
);

/** Quantidade de líderes aprovados (o time comporta no máximo 2). */
export const selectLeaderCount = createSelector(
  [selectApprovedMembers],
  (members) => members.filter((member) => member.role === "leader").length
);

const selectAuthTeams = (state: RootState) => state.auth.teams;
const selectMemberships = (state: RootState) => state.auth.memberships;
const selectIsAdmin = (state: RootState) => state.auth.isAdmin;

/** Times que o usuário pode abrir: todos para o admin, os próprios para os demais. */
export const selectSwitchableTeams = createSelector(
  [selectAuthTeams, selectMemberships, selectIsAdmin],
  (teams, memberships, isAdmin) =>
    isAdmin ? teams : teams.filter((team) => team.id in memberships)
);

/** Quantidade de times: todos para o admin, os do próprio usuário para os demais. */
export const selectTeamsCount = createSelector(
  [selectSwitchableTeams],
  (teams) => teams.length
);
