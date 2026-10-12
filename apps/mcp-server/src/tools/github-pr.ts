import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GithubError, githubRequest, parsePullRequestUrl } from "../lib/github.js";

const FILES_PER_PAGE = 100;
const MAX_BODY_CHARS = 4000;
const DEFAULT_MAX_PATCH_CHARS = 60_000;

const prUrlSchema = z
  .string()
  .trim()
  .describe("URL do pull request, ex.: https://github.com/dono/repo/pull/123");

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

/** Transforma falhas do GitHub em erros de tool legíveis (sem detalhes sensíveis). */
function rethrow(error: unknown): never {
  if (error instanceof GithubError) throw new Error(error.message);
  throw error;
}

interface PullRequestResponse {
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  merged: boolean;
  user: { login: string } | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  changed_files: number;
  additions: number;
  deletions: number;
  commits: number;
}

interface PullFileResponse {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

/**
 * Registra as tools de leitura de PR: `get_pull_request` (metadados) e
 * `get_pull_request_diff` (arquivos alterados com o patch, paginado).
 */
export function registerGithubPrTools(server: McpServer): void {
  server.registerTool(
    "get_pull_request",
    {
      title: "Obter dados de um pull request",
      description:
        "Retorna título, descrição, autor, branches, SHA do commit mais recente e totais de alterações de um PR do GitHub. " +
        "Use head_sha como commit_sha em record_review.",
      inputSchema: { pr_url: prUrlSchema },
    },
    async ({ pr_url }) => {
      const { owner, repo, number } = parsePullRequestUrl(pr_url);
      try {
        const pr = await githubRequest<PullRequestResponse>(`/repos/${owner}/${repo}/pulls/${number}`);
        return textResult({
          url: pr.html_url,
          title: pr.title,
          description: pr.body?.slice(0, MAX_BODY_CHARS) ?? null,
          state: pr.merged ? "merged" : pr.state,
          draft: pr.draft,
          author: pr.user?.login ?? null,
          base_branch: pr.base.ref,
          head_branch: pr.head.ref,
          head_sha: pr.head.sha,
          commits: pr.commits,
          changed_files: pr.changed_files,
          additions: pr.additions,
          deletions: pr.deletions,
        });
      } catch (error) {
        rethrow(error);
      }
    }
  );

  server.registerTool(
    "get_pull_request_diff",
    {
      title: "Obter o diff de um pull request",
      description:
        "Retorna os arquivos alterados de um PR com o patch de cada um (formato unified diff, com cabeçalhos @@), " +
        "em páginas de até 100 arquivos. Se has_more for true, chame de novo com a próxima página. " +
        "Arquivos binários ou muito grandes vêm sem patch (patch_omitted).",
      inputSchema: {
        pr_url: prUrlSchema,
        page: z.number().int().min(1).default(1).describe("Página de arquivos (100 por página)"),
        max_patch_chars: z
          .number()
          .int()
          .min(1000)
          .max(200_000)
          .default(DEFAULT_MAX_PATCH_CHARS)
          .describe("Limite total de caracteres de patch na resposta; patches além do limite são omitidos"),
      },
    },
    async ({ pr_url, page, max_patch_chars }) => {
      const { owner, repo, number } = parsePullRequestUrl(pr_url);
      try {
        const files = await githubRequest<PullFileResponse[]>(
          `/repos/${owner}/${repo}/pulls/${number}/files?per_page=${FILES_PER_PAGE}&page=${page}`
        );

        let remaining = max_patch_chars;
        const result = files.map((file) => {
          const base = {
            file: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
          };
          if (file.patch === undefined) return { ...base, patch_omitted: "sem patch (binário ou muito grande)" };
          if (file.patch.length > remaining) return { ...base, patch_omitted: "limite de max_patch_chars atingido" };
          remaining -= file.patch.length;
          return { ...base, patch: file.patch };
        });

        return textResult({
          page,
          files: result,
          has_more: files.length === FILES_PER_PAGE,
        });
      } catch (error) {
        rethrow(error);
      }
    }
  );
}
