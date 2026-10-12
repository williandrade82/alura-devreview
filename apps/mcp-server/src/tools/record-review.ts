import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../lib/supabase.js";
import { RULE_CATEGORIES, RULE_SEVERITIES } from "../types.js";

// Só PRs do GitHub. Repositório e número do PR são derivados da URL pelo banco,
// para não poderem ser registrados de forma inconsistente com ela.
const PR_URL_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/;

const MAX_SUMMARY_LENGTH = 2000;
const MAX_FINDINGS = 100;
const FOREIGN_KEY_VIOLATION = "23503";

const findingSchema = z
  .object({
    severity: z.enum(RULE_SEVERITIES).describe("error e warning contam como problemas; info é informativo"),
    category: z.enum(RULE_CATEGORIES).describe("Categoria do achado, igual às categorias das regras"),
    rule_id: z
      .string()
      .uuid()
      .optional()
      .describe("ID da regra do time violada (de get_review_rules), quando houver"),
    file_path: z.string().trim().min(1).max(300).optional().describe("Arquivo do achado"),
    line_start: z.number().int().min(1).optional().describe("Primeira linha do achado"),
    line_end: z.number().int().min(1).optional().describe("Última linha (exige line_start)"),
    message: z.string().trim().min(1).max(500).describe("O que está errado, em até 500 caracteres"),
    suggestion: z.string().trim().min(1).max(1000).optional().describe("Como corrigir"),
    code_snippet: z
      .string()
      .max(600)
      .optional()
      .describe(
        "Trecho de código (até 12 linhas). Inclua SOMENTE se for curto e claramente sem dados sensíveis. " +
          "Em dúvida, omita. Achados de segurança nunca guardam trecho. O banco descarta trechos suspeitos."
      ),
  })
  .refine((f) => f.line_end === undefined || (f.line_start !== undefined && f.line_end >= f.line_start), {
    message: "line_end exige line_start e deve ser maior ou igual a ele",
    path: ["line_end"],
  });

interface RecordReviewResult {
  id: string;
  reviewed_at: string;
  repo: string;
  pr_number: number;
  issues_found: number;
  info_not_counted: number;
  findings_recorded: number;
  snippets_omitted: number;
}

/**
 * Registra a tool `record_review`, que grava uma revisão de PR e seus achados
 * estruturados em `review_history` e `review_findings`, de forma atômica.
 * Cada chamada cria um novo registro: revisar o mesmo PR de novo preserva o histórico.
 */
export function registerRecordReview(server: McpServer): void {
  server.registerTool(
    "record_review",
    {
      title: "Registrar revisão de PR no histórico",
      description:
        "Grava no histórico da equipe uma revisão de pull request já concluída e publicada, com seus achados estruturados. " +
        "Cada chamada cria um novo registro (não substitui revisões anteriores do mesmo PR). " +
        "Apenas achados 'error' e 'warning' contam como problemas (issues_found, calculado pelo servidor); 'info' é informativo. " +
        "Uma lista de achados vazia significa revisão com sucesso, sem problemas. " +
        "NUNCA coloque segredos, chaves, tokens ou senhas nos campos de texto. " +
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
          .array(findingSchema)
          .max(MAX_FINDINGS)
          .describe(`Achados da revisão (até ${MAX_FINDINGS}). Lista vazia = sem problemas`),
        commit_sha: z
          .string()
          .trim()
          .regex(/^[0-9a-f]{7,40}$/i, "Use o SHA do commit revisado (7 a 40 caracteres hexadecimais)")
          .optional()
          .describe("Commit do PR que foi revisado"),
        pr_title: z.string().trim().min(1).max(300).optional().describe("Título do PR"),
        reviewer: z.string().trim().min(1).max(100).optional().describe("Quem revisou, ex.: claude-code"),
      },
    },
    async ({ team_id, pr_url, review_summary, findings, commit_sha, pr_title, reviewer }) => {
      const { data, error } = await getSupabase().rpc("record_review_with_findings", {
        p_team_id: team_id,
        p_pr_url: pr_url,
        p_review_summary: review_summary,
        p_commit_sha: commit_sha?.toLowerCase() ?? null,
        p_pr_title: pr_title ?? null,
        p_reviewer: reviewer ?? null,
        p_findings: findings,
      });

      if (error) {
        throw new Error(
          error.code === FOREIGN_KEY_VIOLATION
            ? "Equipe não encontrada. Confira o team_id."
            : `Erro ao registrar a revisão: ${error.message}`
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data as RecordReviewResult) }],
      };
    }
  );
}
