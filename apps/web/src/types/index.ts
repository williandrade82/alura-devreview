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
