import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TEAM_ID } from "../lib/team.js";
import { mockReviewRules } from "../mocks/review-rules.js";
import { RULE_CATEGORIES, RULE_SEVERITIES } from "../types.js";

export function registerGetReviewRules(server: McpServer): void {
  server.registerTool(
    "get_review_rules",
    {
      title: "Listar regras de code review",
      description:
        "Retorna as regras de code review do time demo, com filtros opcionais " +
        "por categoria, severidade e status. Os dados são mockados a partir do " +
        "seed do Supabase (supabase/seed.sql).",
      inputSchema: {
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
    async ({ category, severity, active_only }) => {
      const rules = mockReviewRules.filter(
        (r) =>
          (!category || r.category === category) &&
          (!severity || r.severity === severity) &&
          (!active_only || r.active)
      );

      const text = JSON.stringify(
        { team_id: TEAM_ID, total: rules.length, rules },
        null,
        2
      );
      return { content: [{ type: "text", text }] };
    }
  );
}
