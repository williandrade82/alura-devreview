import { describe, expect, it } from "vitest";
import {
  isKeywordTrends,
  isRecommendationStats,
  isReferenceStats,
  isRepoStats,
  isStatsOverview,
  isTimeseries,
} from "@/lib/statsGuards";

/** Cópia do objeto sem a chave informada (simula a resposta de uma migração desatualizada). */
function without<T extends object>(obj: T, key: keyof T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as Partial<T>;
}

const outcomes = { approved: 0, changes_requested: 0, none: 0, pending: 1 };

const overview = {
  reviews_total: 10,
  reviews_clean: 2,
  avg_issues: 1.6,
  injection_suspected: 0,
  findings_total: 3,
  findings_by_severity: { error: 1, warning: 1, info: 1 },
  findings_by_status: { open: 3, resolved: 0, dismissed: 0 },
};

const references = {
  rules: [{ rule_id: "r1", rule: "Regra", total: 2, errors: 0, dismissed: 0 }],
  adrs: [{ adr_id: "a1", title: null, total: 1 }],
  never_triggered: [{ id: "r2", rule: "Outra", category: "style" }],
  never_triggered_total: 1,
};

const calibration = {
  total: 1,
  with_human_outcome: 0,
  injection_suspected: 1,
  by_recommendation: { approve: 0, request_changes: 1, comment: 0 },
  agreement: { agree: 0, false_approve: 0, false_block: 0, comment_with_outcome: 0 },
  matrix: { approve: outcomes, request_changes: outcomes, comment: outcomes },
  by_confidence: [{ confidence: "high", total: 1, judged: 0, agree: 0 }],
};

const point = {
  bucket_start: "2026-10-12T00:00:00+00:00",
  reviews: 2,
  issues: 3,
  avg_issues: 1.5,
  errors: 0,
  warnings: 3,
  infos: 0,
  in_progress: true,
};

const themes = [
  {
    keyword: "RLS",
    total: 3,
    errors: 0,
    warnings: 0,
    infos: 3,
    last_seen: "2026-10-12T22:31:29+00:00",
    previous_total: 0,
  },
];

const repos = {
  total: 4,
  items: [
    {
      repo: "dono/repo",
      reviews: 2,
      issues: 3,
      avg_issues: 1.5,
      by_category: { style: 0, architecture: 1, security: 0, performance: 0 },
    },
  ],
};

describe("guardas das respostas de estatística", () => {
  it("aceitam o formato esperado", () => {
    expect(isStatsOverview(overview)).toBe(true);
    expect(isReferenceStats(references)).toBe(true);
    expect(isRecommendationStats(calibration)).toBe(true);
    expect(isTimeseries([point, { ...point, avg_issues: null }])).toBe(true);
    expect(isKeywordTrends(themes)).toBe(true);
    expect(isRepoStats(repos)).toBe(true);
  });

  it("aceitam listas vazias", () => {
    expect(isTimeseries([])).toBe(true);
    expect(isKeywordTrends([])).toBe(true);
    expect(isRepoStats({ total: 0, items: [] })).toBe(true);
  });

  it("rejeitam null e tipos errados", () => {
    for (const guard of [isStatsOverview, isReferenceStats, isRecommendationStats, isRepoStats]) {
      expect(guard(null)).toBe(false);
      expect(guard("texto")).toBe(false);
      expect(guard([])).toBe(false);
    }
    expect(isTimeseries(null)).toBe(false);
    expect(isKeywordTrends({})).toBe(false);
  });

  it("rejeitam o formato antigo de get_team_repo_stats (só a lista)", () => {
    expect(isRepoStats(repos.items)).toBe(false);
  });

  it("rejeitam a série sem in_progress (00015 desatualizada)", () => {
    expect(isTimeseries([without(point, "in_progress")])).toBe(false);
  });

  it("rejeitam as referências sem never_triggered_total (00014 desatualizada)", () => {
    expect(isReferenceStats(without(references, "never_triggered_total"))).toBe(false);
  });

  it("rejeitam a calibração por confiança sem judged (00014 desatualizada)", () => {
    const legacy = {
      ...calibration,
      by_confidence: [{ confidence: "high", total: 1, with_human_outcome: 0, agree: 0 }],
    };
    expect(isRecommendationStats(legacy)).toBe(false);
  });

  it("rejeitam campos numéricos ausentes ou não numéricos", () => {
    expect(isStatsOverview({ ...overview, reviews_total: "10" })).toBe(false);
    expect(isStatsOverview({ ...overview, findings_by_status: { open: 1 } })).toBe(false);
    expect(isRepoStats({ ...repos, total: undefined })).toBe(false);
    expect(isKeywordTrends([{ ...themes[0], previous_total: null }])).toBe(false);
  });
});
