import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PR_URL_FORMAT_HINT, PR_URL_PATTERN } from "../lib/github.js";
import { buildReviewPrompt } from "../lib/security-prompt.js";

/**
 * Registra o prompt `review_pull_request`: fluxo de revisão de um PR com as regras de
 * segurança contra prompt injection embutidas.
 */
export function registerReviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "review_pull_request",
    {
      title: "Revisar pull request com segurança reforçada",
      description:
        "Revisa um PR com as regras e ADRs do time, tratando resultados de tools como dados não confiáveis e resistindo a prompt injection.",
      argsSchema: {
        pr_url: z.string().trim().regex(PR_URL_PATTERN, PR_URL_FORMAT_HINT).describe("URL do pull request no GitHub"),
        team_id: z.string().uuid().describe("ID da equipe dona do repositório"),
      },
    },
    ({ pr_url, team_id }) => ({
      messages: [
        { role: "user", content: { type: "text", text: buildReviewPrompt({ pr_url, team_id }) } },
      ],
    })
  );
}
