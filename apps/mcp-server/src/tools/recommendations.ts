import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GithubError, githubRequest, parsePullRequestUrl } from "../lib/github.js";
import { getSupabase } from "../lib/supabase.js";

const MS_PER_DAY = 86_400_000;
const REVIEWS_SCANNED = 200;
const MAX_PRS_PER_SYNC = 30;

type Outcome = "approved" | "changes_requested" | "none";
type PrState = "open" | "closed" | "merged";

interface PullStateResponse {
  state: string;
  merged: boolean;
}

interface PullReviewResponse {
  state: string;
  submitted_at: string | null;
  user: { login: string; type: string } | null;
}

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

/**
 * Decisão humana vigente: a última decisão de cada revisor (COMMENTED não decide; DISMISSED
 * anula a anterior), ignorando bots. Qualquer "changes requested" vigente prevalece.
 */
function humanDecision(reviews: PullReviewResponse[]): Outcome {
  const latest = new Map<string, string>();
  const ordered = [...reviews].sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  for (const review of ordered) {
    if (!review.user || review.user.type === "Bot") continue;
    if (review.state === "APPROVED" || review.state === "CHANGES_REQUESTED") {
      latest.set(review.user.login, review.state);
    } else if (review.state === "DISMISSED") {
      latest.delete(review.user.login);
    }
  }
  const states = new Set(latest.values());
  if (states.has("CHANGES_REQUESTED")) return "changes_requested";
  if (states.has("APPROVED")) return "approved";
  return "none";
}

/**
 * Registra `sync_review_outcomes` (busca no GitHub o que humanos decidiram nos PRs já revisados)
 * e `get_recommendation_stats` (concordância entre a recomendação do modelo e o desfecho humano).
 */
export function registerRecommendationTools(server: McpServer): void {
  server.registerTool(
    "sync_review_outcomes",
    {
      title: "Sincronizar desfecho humano dos PRs revisados",
      description:
        "Consulta o GitHub e grava, para as revisões do time que têm recomendação e cujo PR ainda não foi encerrado, " +
        "a decisão dos revisores humanos (approved, changes_requested ou none) e o estado do PR (open, closed, merged). " +
        "É o que permite comparar a recomendação do modelo com o resultado real em get_recommendation_stats. " +
        "Só lê do GitHub e só atualiza o desfecho de revisões já existentes do time; os valores vêm do GitHub, nunca do chamador.",
      inputSchema: {
        team_id: z.string().uuid().describe("ID da equipe"),
        days: z.number().int().min(1).max(180).default(90).describe("Considera revisões dos últimos N dias (1–180, padrão: 90)"),
      },
    },
    async ({ team_id, days }) => {
      const supabase = getSupabase();
      const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();
      const { data, error } = await supabase
        .from("review_history")
        .select("id, pr_url")
        .eq("team_id", team_id)
        .gte("reviewed_at", since)
        .not("recommendation", "is", null)
        .or("outcome_pr_state.is.null,outcome_pr_state.eq.open")
        .order("reviewed_at", { ascending: false })
        .limit(REVIEWS_SCANNED);
      if (error) throw new Error(`Erro ao buscar revisões para sincronizar: ${error.message}`);

      // Um PR pode ter várias revisões: consulta o GitHub uma vez por PR.
      const byPr = new Map<string, string[]>();
      for (const row of data ?? []) byPr.set(row.pr_url, [...(byPr.get(row.pr_url) ?? []), row.id]);
      const pending = [...byPr.entries()];
      const batch = pending.slice(0, MAX_PRS_PER_SYNC);

      let updated = 0;
      let failed = 0;
      for (const [prUrl, reviewIds] of batch) {
        try {
          const { owner, repo, number } = parsePullRequestUrl(prUrl);
          const base = `/repos/${owner}/${repo}/pulls/${number}`;
          const [pr, reviews] = await Promise.all([
            githubRequest<PullStateResponse>(base),
            githubRequest<PullReviewResponse[]>(`${base}/reviews?per_page=100`),
          ]);
          const state: PrState = pr.merged ? "merged" : pr.state === "open" ? "open" : "closed";
          const decision = humanDecision(reviews);
          for (const id of reviewIds) {
            const { error: rpcError } = await supabase.rpc("set_review_outcome", {
              p_review_id: id,
              p_decision: decision,
              p_pr_state: state,
            });
            if (rpcError) failed += 1;
            else updated += 1;
          }
        } catch (err) {
          if (!(err instanceof GithubError)) throw err;
          failed += reviewIds.length;
        }
      }

      return textResult({
        reviews_updated: updated,
        reviews_failed: failed,
        prs_checked: batch.length,
        prs_remaining: pending.length - batch.length,
      });
    }
  );

  server.registerTool(
    "get_recommendation_stats",
    {
      title: "Estatísticas das recomendações do modelo",
      description:
        "Retorna, para o time e o período, quantas recomendações (approve, request_changes, comment) foram feitas, " +
        "quantas já têm desfecho humano e a concordância: agree, false_approve (modelo aprovaria, humano pediu mudanças), " +
        "false_block (modelo pediria mudanças, humano aprovou) e o detalhamento por confiança. " +
        "Rode sync_review_outcomes antes para atualizar os desfechos.",
      inputSchema: {
        team_id: z.string().uuid().describe("ID da equipe"),
        days: z.number().int().min(7).max(365).default(90).describe("Período em dias (7–365, padrão: 90)"),
      },
    },
    async ({ team_id, days }) => {
      const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();
      const { data, error } = await getSupabase().rpc("get_team_recommendation_stats", {
        p_team_id: team_id,
        p_since: since,
      });
      if (error) throw new Error(`Erro ao obter estatísticas de recomendação: ${error.message}`);
      return textResult({ period_days: days, ...(data as object) });
    }
  );
}
