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

/** Períodos de até 14 dias são agrupados por dia; os maiores, por semana. */
export function bucketForPeriod(days: number): "day" | "week" {
  return days <= 14 ? "day" : "week";
}

/** Rótulo curto de um período da série (dd/MM; na semana, o dia em que ela começa). */
export function formatBucket(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

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
  const lowFalseApproveRate = falseApproveRate !== null && falseApproveRate <= AUTO_APPROVE_MAX_FALSE_APPROVE_RATE;
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
