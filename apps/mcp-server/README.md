# DevReview MCP Server

MCP server (`devreview`, transporte stdio) que dá ao agente acesso às regras, ADRs e métricas do time, lê pull requests do GitHub e registra a revisão no histórico. Voltar para o [README da raiz](../../README.md).

## Stack

Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, `@supabase/supabase-js` e Zod.

## Como rodar

```bash
cp .env.example .env     # preencha SUPABASE_URL e SUPABASE_SERVICE_KEY
npm run mcp:build        # na raiz do repo; gera apps/mcp-server/build
```

O `.mcp.json` da raiz registra o server para o Claude Code (`node apps/mcp-server/build/index.js`), junto com os MCPs do Supabase e do GitHub. Para testar fora do Claude Code: `npm run mcp:inspector`.

No stdio, stdout é o canal JSON-RPC: logs do server vão sempre para stderr.

### Variáveis de ambiente (`.env`)

O `.env` é lido de `apps/mcp-server/.env`, independentemente do diretório de onde o server sobe. Variáveis já definidas no ambiente têm precedência.

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | sim | Secret key (ignora RLS). Nunca versionar |
| `GITHUB_PAT` | não | Token com escrita em Pull requests. Sem ele, a revisão só é gravada no histórico |
| `GITHUB_ALLOWED_REPOS` | não | Repositórios onde o server pode **publicar** comentários (`dono/repo` ou `dono/*`, separados por vírgula). Sem ela nada é publicado |

Sem o `.env`, o server sobe normalmente e só falha ao usar o Supabase sem as variáveis.

## Tools

| Tool | Função |
| --- | --- |
| `get_review_rules` | Regras de review de um time (`team_id` obrigatório) |
| `search_teams_adrs` | Pesquisa ADRs dos times |
| `get_pull_request` | Dados de um PR do GitHub |
| `get_pull_request_diff` | Diff de um PR |
| `get_review_metrics` | Métricas das revisões registradas |
| `record_review` | Grava a revisão e seus achados no histórico (e publica no PR, se permitido) |

## Prompt

`review_pull_request` (`pr_url`, `team_id`): fluxo completo de revisão, já com as regras de segurança. No Claude Code: `/mcp__devreview__review_pull_request`.

## Segurança (prompt injection)

O servidor orienta o modelo a tratar resultados de tools como dados não confiáveis:

- `instructions` do servidor: regras curtas enviadas ao cliente em qualquer uso.
- O prompt `review_pull_request` traz o fluxo completo com as regras de segurança.
- Tools de leitura (`get_pull_request`, `get_pull_request_diff`, `get_review_rules`, `search_teams_adrs`) devolvem o conteúdo dentro de um bloco `<untrusted-NONCE>` com nonce aleatório por resposta.
- `get_review_rules` exige `team_id` (antes, sem ele, devolvia as regras de todos os times).

Os textos ficam em `src/lib/security-prompt.ts`. São orientação ao modelo, não garantia. As defesas que não dependem dele são:

- a redação de segredos no banco (veja o [README do Supabase](../../supabase/README.md));
- a checagem de posse de regra/ADR pelo time;
- `GITHUB_ALLOWED_REPOS`, que limita onde o server publica.

## Estrutura de `src/`

```
src/
├── index.ts      # Cria o server, registra tools e prompt, conecta o stdio
├── tools/        # get-review-rules, adr, github-pr, metrics, record-review
├── prompts/      # review-pull-request
├── lib/          # env, supabase, github, publish-review, security-prompt, untrusted
└── types.ts
```
