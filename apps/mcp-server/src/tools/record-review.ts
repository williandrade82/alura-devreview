import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../lib/supabase.js";

// Só PRs do GitHub: dali saem o repositório e o número, que não são pedidos
// separadamente para o modelo não poder registrá-los inconsistentes com a URL.
const PR_URL_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)$/;

const MAX_SUMMARY_LENGTH = 2000;
const MAX_FINDINGS_PER_SEVERITY = 1000;
const FOREIGN_KEY_VIOLATION = "23503";

const findingCount = z.number().int().min(0).max(MAX_FINDINGS_PER_SEVERITY).default(0);

/**
 * Registra a tool `record_review`, que grava uma revisão de PR em `review_history`.
 * Cada chamada cria uma nova linha: revisar o mesmo PR de novo preserva o histórico.
 */
export function registerRecordReview(server: McpServer): void {
  server.registerTool(
    "record_review",
    {
      title: "Registrar revisão de PR no histórico",
      description:
        "Grava no histórico da equipe uma revisão de pull request já concluída e publicada. " +
        "Cada chamada cria um novo registro (não substitui revisões anteriores do mesmo PR). " +
        "Informe a quantidade de achados por severidade; apenas 'error' e 'warning' contam como problemas " +
        "(issues_found), 'info' é informativo e não entra na contagem. " +
        "Use somente depois de a revisão ter sido feita, e não para estimativas.",
      inputSchema: {
        team_id: z.string().uuid().describe("ID da equipe dona do repositório"),
        pr_url: z
          .string()
          .trim()
          .regex(PR_URL_PATTERN, "Use a URL do PR no formato https://github.com/dono/repo/pull/123")
          .describe("URL do pull request no GitHub"),
        review_summary: z
          .string()
          .trim()
          .min(1)
          .max(MAX_SUMMARY_LENGTH)
          .describe(`Resumo da revisão (até ${MAX_SUMMARY_LENGTH} caracteres)`),
        findings: z
          .object({
            error: findingCount.describe("Achados de severidade error"),
            warning: findingCount.describe("Achados de severidade warning"),
            info: findingCount.describe("Achados informativos (não contam como problemas)"),
          })
          .describe("Quantidade de achados por severidade"),
      },
    },
    async ({ team_id, pr_url, review_summary, findings }) => {
      // O regex já foi validado pelo schema; o match aqui só extrai os grupos.
      const match = PR_URL_PATTERN.exec(pr_url);
      if (!match) throw new Error("URL de PR inválida.");
      const [, repo, prNumber] = match;
      const issuesFound = findings.error + findings.warning;

      const { data, error } = await getSupabase()
        .from("review_history")
        .insert({
          team_id,
          pr_url,
          pr_number: Number(prNumber),
          repo,
          review_summary,
          issues_found: issuesFound,
        })
        .select("id, reviewed_at")
        .single();

      if (error) {
        throw new Error(
          error.code === FOREIGN_KEY_VIOLATION
            ? "Equipe não encontrada. Confira o team_id."
            : `Erro ao registrar a revisão: ${error.message}`
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: data.id,
              reviewed_at: data.reviewed_at,
              repo,
              pr_number: Number(prNumber),
              issues_found: issuesFound,
              info_not_counted: findings.info,
            }),
          },
        ],
      };
    }
  );
}
