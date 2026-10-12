export type RuleSeverity = "error" | "warning" | "info";
export type RuleCategory =
  | "style"
  | "architecture"
  | "security"
  | "performance";
export type TeamRole = "leader" | "member";
export type MemberStatus = "pending" | "approved";
export type FindingStatus = "open" | "resolved" | "dismissed";
export type AdrStatus = "proposed" | "accepted" | "deprecated";

export interface ReviewRule {
  id: string;
  team_id: string;
  category: RuleCategory;
  rule: string;
  severity: RuleSeverity;
  active: boolean;
}

export interface Team {
  id: string;
  name: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  email: string | null;
  role: TeamRole;
  status: MemberStatus;
}

export interface ReviewHistory {
  id: string;
  pr_url: string;
  pr_number: number;
  repo: string;
  review_summary: string;
  issues_found: number;
  reviewed_at: string;
  commit_sha: string | null;
  pr_title: string | null;
  reviewer: string | null;
  /** Recomendação de ação do modelo (modo sombra; nula em revisões antigas). */
  recommendation: Recommendation | null;
  recommendation_reason: string | null;
  recommendation_confidence: "low" | "medium" | "high" | null;
  injection_suspected: boolean;
  outcome_decision: HumanOutcome | null;
  outcome_pr_state: "open" | "closed" | "merged" | null;
}

export interface Adr {
  id: string;
  team_id: string;
  title: string;
  context: string;
  decision: string;
  status: AdrStatus;
  created_at: string;
}

export interface ReviewKeyword {
  id: string;
  review_id: string;
  keyword: string;
  severity: RuleSeverity;
  position: number;
  reviewed_at: string;
}

export interface ReviewFinding {
  id: string;
  review_id: string;
  severity: RuleSeverity;
  category: RuleCategory;
  rule_id: string | null;
  rule_text: string | null;
  adr_id: string | null;
  adr_title: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  message: string;
  suggestion: string | null;
  code_snippet: string | null;
  status: FindingStatus;
  resolved_at: string | null;
}

export type Recommendation = "approve" | "request_changes" | "comment";
/** Decisão humana no GitHub; "none" = PR sem aprovação nem pedido de mudança. */
export type HumanOutcome = "approved" | "changes_requested" | "none";

/** Resultado de get_team_stats_overview. */
export interface StatsOverview {
  reviews_total: number;
  reviews_clean: number;
  avg_issues: number;
  injection_suspected: number;
  findings_total: number;
  findings_by_severity: Record<RuleSeverity, number>;
  findings_by_status: Record<FindingStatus, number>;
}

/** Resultado de get_team_reference_stats. */
export interface ReferenceStats {
  rules: { rule_id: string; rule: string | null; total: number; errors: number; dismissed: number }[];
  adrs: { adr_id: string; title: string | null; total: number }[];
  never_triggered: { id: string; rule: string; category: RuleCategory }[];
  /** Total real de regras que nunca dispararam (a lista acima vem cortada em 20). */
  never_triggered_total: number;
}

/** Revisões de uma recomendação por desfecho humano (pending = ainda não sincronizado). */
export interface OutcomeCounts {
  approved: number;
  changes_requested: number;
  none: number;
  pending: number;
}

/** Um período (dia ou semana) de get_team_stats_timeseries; períodos sem revisão vêm com zeros. */
export interface TimeseriesPoint {
  bucket_start: string;
  reviews: number;
  issues: number;
  /** null quando o período não teve revisões. */
  avg_issues: number | null;
  errors: number;
  warnings: number;
  infos: number;
}

/** Um tema (palavra-chave) de get_team_keyword_trends, com o total do período anterior. */
export interface KeywordTrend {
  keyword: string;
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  last_seen: string;
  previous_total: number;
}

/** Um repositório de get_team_repo_stats (by_category conta todos os achados, inclusive info). */
export interface RepoStat {
  repo: string;
  reviews: number;
  issues: number;
  avg_issues: number;
  by_category: Record<RuleCategory, number>;
}

/** Resultado de get_team_recommendation_stats. */
export interface RecommendationStats {
  total: number;
  with_human_outcome: number;
  injection_suspected: number;
  by_recommendation: Record<Recommendation, number>;
  agreement: {
    agree: number;
    false_approve: number;
    false_block: number;
    comment_with_outcome: number;
  };
  matrix: Record<Recommendation, OutcomeCounts>;
  /** judged = recomendações approve/request_changes já decididas por humanos (base da concordância). */
  by_confidence: { confidence: string; total: number; judged: number; agree: number }[];
}
