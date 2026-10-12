import type {
  KeywordTrend,
  RecommendationStats,
  ReferenceStats,
  RepoStats,
  StatsOverview,
  TimeseriesPoint,
} from "@/types";

/**
 * Guardas de tipo das respostas das funções de estatística do banco. Os tipos de `@/types` só
 * valem como contrato se o formato for conferido em tempo de execução: com uma migração
 * desatualizada, a resposta chega num formato diferente e a seção deve falhar sozinha.
 */

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const hasNumbers = (v: unknown, keys: readonly string[]): boolean => isRecord(v) && keys.every((k) => isNum(v[k]));
const everyItem = (v: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(v) && v.every(check);

const OUTCOME_KEYS = ["approved", "changes_requested", "none", "pending"] as const;
const RECOMMENDATION_KEYS = ["approve", "request_changes", "comment"] as const;
const CATEGORY_KEYS = ["style", "architecture", "security", "performance"] as const;

/** Resultado de get_team_stats_overview. */
export function isStatsOverview(v: unknown): v is StatsOverview {
  return (
    isRecord(v) &&
    hasNumbers(v, ["reviews_total", "reviews_clean", "avg_issues", "injection_suspected", "findings_total"]) &&
    hasNumbers(v.findings_by_severity, ["error", "warning", "info"]) &&
    hasNumbers(v.findings_by_status, ["open", "resolved", "dismissed"])
  );
}

/** Resultado de get_team_reference_stats (never_triggered_total vem da 00014 corrigida). */
export function isReferenceStats(v: unknown): v is ReferenceStats {
  return (
    isRecord(v) &&
    isNum(v.never_triggered_total) &&
    everyItem(v.rules, (r) => isRecord(r) && isStr(r.rule_id) && hasNumbers(r, ["total", "errors", "dismissed"])) &&
    everyItem(v.adrs, (a) => isRecord(a) && isStr(a.adr_id) && hasNumbers(a, ["total"])) &&
    everyItem(v.never_triggered, (r) => isRecord(r) && isStr(r.id) && isStr(r.rule) && isStr(r.category))
  );
}

/** Resultado de get_team_recommendation_stats (by_confidence.judged vem da 00014 corrigida). */
export function isRecommendationStats(v: unknown): v is RecommendationStats {
  return (
    isRecord(v) &&
    hasNumbers(v, ["total", "with_human_outcome", "injection_suspected"]) &&
    hasNumbers(v.by_recommendation, RECOMMENDATION_KEYS) &&
    hasNumbers(v.agreement, ["agree", "false_approve", "false_block", "comment_with_outcome"]) &&
    isRecord(v.matrix) &&
    RECOMMENDATION_KEYS.every((k) => hasNumbers((v.matrix as Rec)[k], OUTCOME_KEYS)) &&
    everyItem(v.by_confidence, (c) => isRecord(c) && isStr(c.confidence) && hasNumbers(c, ["total", "judged", "agree"]))
  );
}

/** Resultado de get_team_stats_timeseries (in_progress vem da versão corrigida da 00015). */
export function isTimeseries(v: unknown): v is TimeseriesPoint[] {
  return everyItem(
    v,
    (p) =>
      isRecord(p) &&
      isStr(p.bucket_start) &&
      hasNumbers(p, ["reviews", "issues", "errors", "warnings", "infos"]) &&
      (p.avg_issues === null || isNum(p.avg_issues)) &&
      typeof p.in_progress === "boolean"
  );
}

/** Resultado de get_team_keyword_trends. */
export function isKeywordTrends(v: unknown): v is KeywordTrend[] {
  return everyItem(
    v,
    (t) =>
      isRecord(t) &&
      isStr(t.keyword) &&
      isStr(t.last_seen) &&
      hasNumbers(t, ["total", "errors", "warnings", "infos", "previous_total"])
  );
}

/** Resultado de get_team_repo_stats: {items, total} (a versão antiga devolvia só a lista). */
export function isRepoStats(v: unknown): v is RepoStats {
  return (
    isRecord(v) &&
    isNum(v.total) &&
    everyItem(
      v.items,
      (r) =>
        isRecord(r) &&
        isStr(r.repo) &&
        hasNumbers(r, ["reviews", "issues", "avg_issues"]) &&
        hasNumbers(r.by_category, CATEGORY_KEYS)
    )
  );
}
