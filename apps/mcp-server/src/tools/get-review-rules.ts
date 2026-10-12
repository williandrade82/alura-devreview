import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../lib/supabase.js";
import { RULE_CATEGORIES, RULE_SEVERITIES } from "../types.js";

/**
 * Registra a tool `get_review_rules` (regras de code review, com filtros opcionais).
 */
export function registerGetReviewRules(server: McpServer): void {
  server.registerTool(
    "get_review_rules",
    {
      title: "Listar regras de code review",
      description:
        "Retorna as regras de code review cadastradas no Supabase, com filtros " +
        "opcionais por time, categoria, severidade e status. Sem team_id, retorna " +
        "as regras de todos os times; cada regra traz o team_id do seu time.",
      inputSchema: {
        team_id: z
          .string()
          .uuid()
          .optional()
          .describe("ID do time; se omitido, retorna as regras de todos os times"),
        category: z
          .enum(RULE_CATEGORIES)
          .optional()
          .describe("Filtra pela categoria da regra"),
        severity: z
          .enum(RULE_SEVERITIES)
          .optional()
          .describe("Filtra pela severidade da regra"),
        active_only: z
          .boolean()
          .default(true)
          .describe("Se true, retorna apenas regras ativas"),
      },
    },
    async ({ team_id, category, severity, active_only }) => {
      let query = getSupabase()
        .from("review_rules")
        .select("id, team_id, category, rule, severity, active")
        .order("team_id", { ascending: true })
        .order("category", { ascending: true });

      if (team_id) query = query.eq("team_id", team_id);
      if (category) query = query.eq("category", category);
      if (severity) query = query.eq("severity", severity);
      if (active_only) query = query.eq("active", true);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Erro ao recuperar regras de revisão: ${error.message}`);
      }

      const rules = data ?? [];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: rules.length, rules }, null, 2),
          },
        ],
      };
    }
  );
}
