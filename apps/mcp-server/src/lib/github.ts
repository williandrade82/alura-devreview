// Cliente mínimo da API REST do GitHub. O token vem de GITHUB_PAT no ambiente do server
// e nunca é devolvido às tools nem incluído em mensagens de erro.
const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 10_000;

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

export type GithubFailure = "token_invalid" | "forbidden" | "not_found" | "unprocessable" | "unreachable" | "error";

export class GithubError extends Error {
  constructor(
    readonly kind: GithubFailure,
    message: string
  ) {
    super(message);
  }
}

export function getGithubToken(): string | undefined {
  return process.env.GITHUB_PAT?.trim() || undefined;
}

export function parsePullRequestUrl(url: string): PullRequestRef {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d{1,10})$/.exec(url);
  if (!match) throw new Error("Use a URL do PR no formato https://github.com/dono/repo/pull/123");
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

/** Chama a API do GitHub. Leituras funcionam sem token em repositórios públicos. */
export async function githubRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<T> {
  const token = getGithubToken();
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "devreview-mcp",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GithubError("unreachable", "Não foi possível falar com o GitHub (rede ou tempo esgotado).");
  }

  if (response.ok) return (await response.json()) as T;

  switch (response.status) {
    case 401:
      throw new GithubError("token_invalid", "O GitHub recusou o GITHUB_PAT (inválido, expirado ou revogado).");
    case 403:
      throw new GithubError("forbidden", "Sem permissão no GitHub (o token precisa de acesso de escrita a Pull requests) ou limite de requisições atingido.");
    case 404:
      throw new GithubError("not_found", "PR não encontrado, ou o token não tem acesso ao repositório (repositório privado?).");
    case 422:
      throw new GithubError("unprocessable", "O GitHub rejeitou o conteúdo enviado.");
    default:
      throw new GithubError("error", `O GitHub respondeu ${response.status}.`);
  }
}
