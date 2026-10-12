import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../lib/supabase.js";

/**
 * Registra a tool `search_teams_adrs` (busca de ADRs aceitos por palavra-chave).
 */
export function registerAdrTools(server: McpServer): void {
  server.registerTool(
    "search_teams_adrs",
    {
      title: "Pesquisar ADRs de equipes",
      description:
        "Pesquisa os ADRs já aceitos das equipes com base em critérios de pesquisa fornecidos. " +
        "Usar quando uma PR tocar em conceitos arquiteturais (estado de gerenciamento, autenticação, caching, etc.) " +
        "e você quiser verificar se a equipe já possui ADRs relacionados a esses conceitos.",
      inputSchema: {
        team_id: z
          .string()
          .uuid()
          .describe(
            "ID da equipe (da tabela de times) para a qual os ADRs devem ser pesquisados"
          ),
        keyword: z
          .string()
          .min(2)
          .describe(
            "Palavra-chave para pesquisa nos títulos e decisões dos ADRs. Deve ter pelo menos 2 caracteres. " +
              "Exemplo: 'autenticação', 'cache', 'gerenciamento de estado'"
          ),
      },
    },
    async ({ team_id, keyword }) => {
      // Vírgula, parênteses, aspas, % e \ têm significado na sintaxe de .or()/ilike.
      const term = keyword.replace(/[,()"%\\]/g, " ").trim();
      if (term.length < 2) {
        throw new Error("Palavra-chave inválida: use ao menos 2 caracteres alfanuméricos.");
      }

      const { data, error } = await getSupabase()
        .from("adrs")
        .select("title, decision, status")
        .eq("team_id", team_id)
        .eq("status", "accepted")
        .or(`title.ilike.%${term}%,decision.ilike.%${term}%`);

      if (error) {
        throw new Error(`Erro ao pesquisar ADRs: ${error.message}`);
      }

      const adrs = data ?? [];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ adrs, count: adrs.length }),
          },
        ],
      };
    }
  );
}
