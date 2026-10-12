import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../lib/supabase.js";

const MS_PER_DAY = 86_400_000;
// O PostgREST limita cada resposta (1000 linhas por padrão): busca em páginas.
const PAGE_SIZE = 1000;

interface ReviewRow {
  issues_found: number;
  repo: string;
}

async function fetchReviewRows(teamId: string, since: string): Promise<ReviewRow[]> {
  const rows: ReviewRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getSupabase()
      .from("review_history")
      .select("issues_found, repo")
      .eq("team_id", teamId)
      .gte("reviewed_at", since)
      .order("reviewed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Erro ao obter métricas de revisão: ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/**
 * Registra a tool `get_review_metrics` (total de revisões, média de issues e
 * principais repositórios de uma equipe em um período).
 */
export function registerMetricsTools(server: McpServer): void {
  server.registerTool(
    "get_review_metrics",
    {
      title: "Obter métricas de revisão de código",
      description:
        "Retorna métricas de revisão para uma equipe: total de revisões, média de problemas encontrados, principais repositórios. " +
        "Use para contexto sobre tendências de qualidade antes de revisar um PR.",
      inputSchema: {
        team_id: z
          .string()
          .uuid()
          .describe("ID da equipe (da tabela de times) para a qual as métricas devem ser obtidas"),
        days: z
          .number()
          .int()
          .min(7)
          .max(90)
          .default(30)
          .describe("Período de retrospectiva em dias (7–90, padrão: 30)"),
      },
    },
    async ({ team_id, days }) => {
      const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();
      const rows = await fetchReviewRows(team_id, since);

      const totalReviews = rows.length;
      const avgIssues =
        totalReviews > 0
          ? Number(
              (rows.reduce((sum, row) => sum + row.issues_found, 0) / totalReviews).toFixed(1)
            )
          : 0;

      const byRepo = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.repo] = (acc[row.repo] || 0) + 1;
        return acc;
      }, {});

      const topRepos = Object.entries(byRepo)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([repo, count]) => ({ repo, count }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              period_days: days,
              total_reviews: totalReviews,
              avg_issues_per_review: avgIssues,
              top_repos: topRepos,
            }),
          },
        ],
      };
    }
  );
}
