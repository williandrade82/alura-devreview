import type { OutcomeCounts, Recommendation } from "@/types";

/** Períodos oferecidos na tela de estatísticas (em dias). */
export const STATS_PERIODS = [7, 30, 90, 180] as const;
export const DEFAULT_STATS_PERIOD = 30;

/**
 * Critérios indicativos para avaliar uma futura aprovação automática. Não ligam nada:
 * só mostram o quanto o modelo já se aproximou deles.
 */
export const AUTO_APPROVE_MIN_DECIDED = 50;
export const AUTO_APPROVE_MAX_FALSE_APPROVE_RATE = 0.02;

/** Porcentagem com uma casa ("—" quando não há base de cálculo). */
export function percent(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Number(((part / total) * 100).toFixed(1))}%`;
}

export interface Readiness {
  /** Recomendações "approve" que já têm decisão humana (aprovado ou mudanças pedidas). */
  decidedApprovals: number;
  falseApprovals: number;
  falseApproveRate: number | null;
  enoughData: boolean;
  lowFalseApproveRate: boolean;
  ready: boolean;
}

/** Avalia os critérios de prontidão a partir dos desfechos das recomendações "approve". */
export function readiness(matrix: Record<Recommendation, OutcomeCounts>): Readiness {
  const decidedApprovals = matrix.approve.approved + matrix.approve.changes_requested;
  const falseApprovals = matrix.approve.changes_requested;
  const falseApproveRate = decidedApprovals === 0 ? null : falseApprovals / decidedApprovals;
  const enoughData = decidedApprovals >= AUTO_APPROVE_MIN_DECIDED;
  const lowFalseApproveRate =
    falseApproveRate !== null && falseApproveRate <= AUTO_APPROVE_MAX_FALSE_APPROVE_RATE;
  return {
    decidedApprovals,
    falseApprovals,
    falseApproveRate,
    enoughData,
    lowFalseApproveRate,
    ready: enoughData && lowFalseApproveRate,
  };
}

/** Concordância: approve x aprovado e request_changes x mudanças pedidas, entre as decididas. */
export function agreementCounts(matrix: Record<Recommendation, OutcomeCounts>) {
  const agree = matrix.approve.approved + matrix.request_changes.changes_requested;
  const judged =
    matrix.approve.approved +
    matrix.approve.changes_requested +
    matrix.request_changes.approved +
    matrix.request_changes.changes_requested;
  return { agree, judged };
}
