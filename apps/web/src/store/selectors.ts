import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import type { RuleSeverity } from "@/types";

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
