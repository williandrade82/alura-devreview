import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../lib/supabase.js";
import { RULE_CATEGORIES } from "../types.js";

export function registerReviewRulesTools(server: McpServer): void {
  server.registerTool(
    "get_team_review_rules",
    {
      title: "Listar regras de code review de um time",
      description:
        "Obtém as regras de revisão de código ativas de uma equipe específica, " +
        "com filtro opcional por categoria. Usar ao revisar uma PR para exibir " +
        "os padrões de codificação do time.",
      inputSchema: {
        team_id: z
          .string()
          .uuid()
          .describe(
            "ID da equipe (da tabela de times) para a qual as regras de revisão devem ser recuperadas"
          ),
        category: z
          .enum(RULE_CATEGORIES)
          .optional()
          .describe(
            "Filtro por categoria de regras de revisão. Se não for fornecido, todas as categorias serão retornadas."
          ),
      },
    },
    async ({ team_id, category }) => {
      let query = getSupabase()
        .from("review_rules")
        .select("category, rule, severity")
        .eq("team_id", team_id)
        .eq("active", true)
        .order("category", { ascending: true });

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Erro ao recuperar regras de revisão: ${error.message}`);
      }

      const rules = data ?? [];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ rules, count: rules.length }),
          },
        ],
      };
    }
  );
}
