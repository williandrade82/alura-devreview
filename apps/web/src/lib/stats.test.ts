import { describe, expect, it } from "vitest";
import {
  AUTO_APPROVE_MIN_DECIDED,
  agreementCounts,
  bucketForPeriod,
  formatBucket,
  percent,
  readiness,
} from "@/lib/stats";
import type { OutcomeCounts, Recommendation } from "@/types";

const zero: OutcomeCounts = { approved: 0, changes_requested: 0, none: 0, pending: 0 };

/** Matriz recomendação × desfecho só com os valores informados. */
function matrix(overrides: Partial<Record<Recommendation, Partial<OutcomeCounts>>>) {
  return {
    approve: { ...zero, ...overrides.approve },
    request_changes: { ...zero, ...overrides.request_changes },
    comment: { ...zero, ...overrides.comment },
  };
}

describe("bucketForPeriod", () => {
  it("agrupa por dia até 14 dias e por semana acima disso", () => {
    expect(bucketForPeriod(7)).toBe("day");
    expect(bucketForPeriod(14)).toBe("day");
    expect(bucketForPeriod(15)).toBe("week");
    expect(bucketForPeriod(180)).toBe("week");
  });
});

describe("formatBucket", () => {
  it("formata dd/MM em UTC", () => {
    expect(formatBucket("2026-10-12T00:00:00+00:00")).toBe("12/10");
    expect(formatBucket("2026-01-05T23:59:59+00:00")).toBe("05/01");
  });
});

describe("percent", () => {
  it("devolve '—' sem base de cálculo", () => {
    expect(percent(0, 0)).toBe("—");
    expect(percent(3, 0)).toBe("—");
  });

  it("arredonda para uma casa e remove zeros à direita", () => {
    expect(percent(1, 3)).toBe("33.3%");
    expect(percent(1, 2)).toBe("50%");
    expect(percent(2, 2)).toBe("100%");
  });
});

describe("agreementCounts", () => {
  it("conta approve×aprovado e request_changes×mudanças pedidas como concordância", () => {
    const m = matrix({
      approve: { approved: 4, changes_requested: 1 },
      request_changes: { approved: 2, changes_requested: 3 },
      comment: { approved: 9, changes_requested: 9 },
    });
    expect(agreementCounts(m)).toEqual({ agree: 7, judged: 10 });
  });

  it("ignora 'comment' e desfechos sem decisão ou pendentes", () => {
    const m = matrix({ approve: { none: 5, pending: 5 }, comment: { approved: 3 } });
    expect(agreementCounts(m)).toEqual({ agree: 0, judged: 0 });
  });
});

describe("readiness", () => {
  it("fica pronto com dados suficientes e falsos aprovados no limite", () => {
    const result = readiness(matrix({ approve: { approved: 49, changes_requested: 1 } }));
    expect(result.decidedApprovals).toBe(AUTO_APPROVE_MIN_DECIDED);
    expect(result.falseApproveRate).toBeCloseTo(0.02);
    expect(result.ready).toBe(true);
  });

  it("não fica pronto com poucos dados", () => {
    const result = readiness(matrix({ approve: { approved: 10 } }));
    expect(result.enoughData).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("não fica pronto com muitos falsos aprovados", () => {
    const result = readiness(matrix({ approve: { approved: 48, changes_requested: 2 } }));
    expect(result.enoughData).toBe(true);
    expect(result.lowFalseApproveRate).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("sem aprovações decididas, a taxa é nula e não está pronto", () => {
    const result = readiness(matrix({}));
    expect(result.falseApproveRate).toBeNull();
    expect(result.lowFalseApproveRate).toBe(false);
    expect(result.ready).toBe(false);
  });
});
