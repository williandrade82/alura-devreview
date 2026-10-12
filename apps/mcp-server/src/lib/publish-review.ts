import { getSupabase } from "./supabase.js";
import {
  GithubError,
  getGithubToken,
  isPublishAllowed,
  githubRequest,
  parsePullRequestUrl,
  type GithubFailure,
} from "./github.js";

const MAX_REVIEW_BODY = 60_000;
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
const SEVERITY_LABEL = { error: "🔴 Erro", warning: "🟡 Aviso", info: "🔵 Info" } as const;

const NO_TOKEN_MESSAGE =
  "A análise está disponível na interface do DevReview, mas não foi gravada como comentário no PR do GitHub. " +
  "Para automatizar, defina a variável GITHUB_PAT (token com permissão de escrita em Pull requests) " +
  "no ambiente do MCP devreview.";

const NOT_ALLOWED_MESSAGE =
  "A revisão foi gravada, mas não publicada no PR: o repositório não está em GITHUB_ALLOWED_REPOS. " +
  "Para publicar, defina essa variável no ambiente do MCP devreview (ex.: dono/repo ou dono/*).";

// Caractere de largura zero: quebra @menção e #referência sem alterar o texto visível.
const ZWSP = String.fromCharCode(0x200b);

/**
 * Neutraliza no texto publicado o que geraria efeito colateral no GitHub: menções (@usuario),
 * referências a issues (#123) e imagens (rastreamento). Trechos entre crases ficam intactos.
 */
function sanitizeMarkdown(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/@(?=[A-Za-z0-9_])/g, "@" + ZWSP)
            .replace(/(^|[^A-Za-z0-9&])#(?=\d)/g, "$1#" + ZWSP)
            .replace(/!\[/g, "[")
    )
    .join("");
}

export interface PublishOutcome {
  published: boolean;
  review_url?: string;
  reason?: "no_token" | "repo_not_allowed" | GithubFailure | "disabled";
  message: string;
}

interface StoredFinding {
  severity: keyof typeof SEVERITY_ORDER;
  category: string;
  rule_text: string | null;
  adr_title: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  message: string;
  suggestion: string | null;
  code_snippet: string | null;
}

function location(f: StoredFinding): string {
  if (!f.file_path) return "";
  if (f.line_start === null) return `\`${f.file_path}\``;
  const lines = f.line_end && f.line_end !== f.line_start ? `${f.line_start}-${f.line_end}` : `${f.line_start}`;
  return `\`${f.file_path}:${lines}\``;
}

/** Corpo do comentário de um achado (usado em linha ou no resumo). */
function findingBody(f: StoredFinding): string {
  const parts = [`**${SEVERITY_LABEL[f.severity]}** · ${f.category}`, sanitizeMarkdown(f.message)];
  if (f.rule_text) parts.push(`_Regra: ${sanitizeMarkdown(f.rule_text)}_`);
  if (f.adr_title) parts.push(`_ADR: ${sanitizeMarkdown(f.adr_title)}_`);
  if (f.suggestion) parts.push(`💡 **Sugestão:** ${sanitizeMarkdown(f.suggestion)}`);
  if (f.code_snippet) parts.push("```\n" + f.code_snippet.replace(/```/g, "'''") + "\n```");
  return parts.join("\n\n");
}

interface StoredKeyword {
  keyword: string;
  severity: keyof typeof SEVERITY_ORDER;
}

function buildSummary(
  summary: string,
  findings: StoredFinding[],
  issues: number,
  inlineIds: Set<StoredFinding>,
  keywords: StoredKeyword[]
): string {
  const lines = [
    "## DevReview",
    "",
    sanitizeMarkdown(summary),
    "",
    `**Problemas (erro + aviso):** ${issues} · **Achados:** ${findings.length}`,
  ];
  if (keywords.length > 0) {
    lines.push("", `**Tópicos:** ${keywords.map((k) => `\`${k.keyword.replace(/`/g, "'")}\``).join(" · ")}`);
  }

  const notInline = findings.filter((f) => !inlineIds.has(f));
  if (notInline.length > 0) {
    lines.push("", "### Achados");
    for (const f of notInline) {
      const where = location(f);
      lines.push("", `- ${where ? where + " — " : ""}${findingBody(f).replace(/\n/g, "\n  ")}`);
    }
  }

  lines.push("", "---", "_Revisão registrada no histórico do DevReview._");
  return lines.join("\n").slice(0, MAX_REVIEW_BODY);
}

interface ReviewResponse {
  html_url: string;
}

/**
 * Publica no PR a revisão já gravada. Usa o conteúdo ARMAZENADO no banco (já passou pelo
 * filtro de segredos), não o texto recebido do LLM. Nunca lança: falhas viram `published: false`.
 */
export async function publishReviewToGithub(args: {
  reviewId: string;
  prUrl: string;
  commitSha?: string;
  issues: number;
}): Promise<PublishOutcome> {
  if (!getGithubToken()) {
    return { published: false, reason: "no_token", message: NO_TOKEN_MESSAGE };
  }
  if (!isPublishAllowed(parsePullRequestUrl(args.prUrl))) {
    return { published: false, reason: "repo_not_allowed", message: NOT_ALLOWED_MESSAGE };
  }

  try {
    const supabase = getSupabase();
    const [
      { data: review, error: reviewError },
      { data: findingRows, error: findingsError },
      { data: keywordRows },
    ] = await Promise.all([
      supabase.from("review_history").select("review_summary").eq("id", args.reviewId).single(),
      supabase
        .from("review_findings")
        .select("severity, category, rule_text, adr_title, file_path, line_start, line_end, message, suggestion, code_snippet")
        .eq("review_id", args.reviewId),
      supabase
        .from("review_keywords")
        .select("keyword, severity")
        .eq("review_id", args.reviewId)
        .order("position", { ascending: true }),
    ]);
    const keywords = (keywordRows ?? []) as StoredKeyword[];
    if (reviewError || findingsError || !review) {
      return { published: false, reason: "error", message: "Revisão gravada, mas não foi possível ler seu conteúdo para publicar no PR." };
    }

    const findings = ((findingRows ?? []) as StoredFinding[]).sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );
    const { owner, repo, number } = parsePullRequestUrl(args.prUrl);
    const path = `/repos/${owner}/${repo}/pulls/${number}/reviews`;
    const commit = args.commitSha ? { commit_id: args.commitSha } : {};

    // Achados com arquivo e linha viram comentários em linha; o resto vai no resumo.
    const inline = findings.filter((f) => f.file_path && f.line_start !== null);
    const inlineComments = inline.map((f) => ({
      path: f.file_path as string,
      line: f.line_end ?? (f.line_start as number),
      side: "RIGHT",
      ...(f.line_end && f.line_end !== f.line_start ? { start_line: f.line_start as number, start_side: "RIGHT" } : {}),
      body: findingBody(f),
    }));

    let posted: ReviewResponse;
    try {
      posted = await githubRequest<ReviewResponse>(path, {
        method: "POST",
        body: {
          ...commit,
          event: "COMMENT",
          body: buildSummary(review.review_summary ?? "", findings, args.issues, new Set(inline), keywords),
          comments: inlineComments,
        },
      });
    } catch (error) {
      // Linha fora do diff faz o GitHub rejeitar a review inteira: tenta de novo sem comentários em linha.
      if (!(error instanceof GithubError) || error.kind !== "unprocessable" || inlineComments.length === 0) throw error;
      posted = await githubRequest<ReviewResponse>(path, {
        method: "POST",
        body: {
          ...commit,
          event: "COMMENT",
          body: buildSummary(review.review_summary ?? "", findings, args.issues, new Set(), keywords),
        },
      });
    }

    const { error: urlError } = await supabase.rpc("set_review_github_url", {
      p_review_id: args.reviewId,
      p_url: posted.html_url,
    });

    return {
      published: true,
      review_url: posted.html_url,
      message: urlError
        ? "Comentário publicado no PR, mas a URL não pôde ser gravada no histórico."
        : "Comentário publicado no PR do GitHub.",
    };
  } catch (error) {
    if (error instanceof GithubError) {
      return { published: false, reason: error.kind, message: `Revisão gravada, mas não publicada no PR: ${error.message}` };
    }
    return { published: false, reason: "error", message: "Revisão gravada, mas ocorreu um erro inesperado ao publicar no PR." };
  }
}

export const PUBLISH_DISABLED: PublishOutcome = {
  published: false,
  reason: "disabled",
  message: "Publicação no PR desativada nesta chamada (publish=false).",
};
