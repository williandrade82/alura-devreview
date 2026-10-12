import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../lib/supabase.js";

const MS_PER_DAY = 86_400_000;

interface KeywordStat {
  keyword: string;
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  last_seen: string;
}

/**
 * Registra a tool `get_review_keywords`: ranking das palavras-chave mais usadas nas revisões
 * do time, para reaproveitar o vocabulário ao registrar uma nova revisão.
 */
export function registerKeywordTools(server: McpServer): void {
  server.registerTool(
    "get_review_keywords",
    {
      title: "Listar palavras-chave das revisões do time",
      description:
        "Retorna as palavras-chave (assuntos analisados) mais frequentes nas revisões de uma equipe, com a contagem por severidade. " +
        "Use antes de record_review para reaproveitar o vocabulário existente em vez de criar sinônimos.",
      inputSchema: {
        team_id: z.string().uuid().describe("ID da equipe"),
        days: z
          .number()
          .int()
          .min(7)
          .max(365)
          .default(90)
          .describe("Período de retrospectiva em dias (7–365, padrão: 90)"),
        limit: z.number().int().min(1).max(50).default(20).describe("Quantidade máxima de palavras (padrão: 20)"),
      },
    },
    async ({ team_id, days, limit }) => {
      const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();
      const { data, error } = await getSupabase().rpc("get_team_keyword_stats", {
        p_team_id: team_id,
        p_since: since,
        p_limit: limit,
      });

      if (error) {
        throw new Error(`Erro ao obter palavras-chave: ${error.message}`);
      }

      const keywords = (data ?? []) as KeywordStat[];
      return {
        content: [{ type: "text", text: JSON.stringify({ period_days: days, keywords }) }],
      };
    }
  );
}
