# DevReview MCP Server

MCP server (`devreview`, transporte stdio) que dá ao agente acesso às regras, ADRs e métricas do time, lê pull requests do GitHub e registra a revisão no histórico, com palavras-chave e uma recomendação de ação. Voltar para o [README da raiz](../../README.md).

## Stack

Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, `@supabase/supabase-js` e Zod.

## Como rodar

```bash
cp .env.example .env     # preencha SUPABASE_URL e SUPABASE_SERVICE_KEY
npm run mcp:build        # na raiz do repo; gera apps/mcp-server/build
```

O `.mcp.json` da raiz registra o server para o Claude Code (`node apps/mcp-server/build/index.js`), junto com os MCPs do Supabase e do GitHub. Para testar fora do Claude Code: `npm run mcp:inspector`.

Depois de mudar o código, rode `npm run mcp:build` e reinicie o server no cliente (por exemplo, `/mcp` no Claude Code): ele roda a partir de `build/`.

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
| `get_review_keywords` | Palavras-chave (assuntos) mais frequentes nas revisões do time, para reaproveitar o vocabulário |
| `record_review` | Grava a revisão, os achados, as palavras-chave e a recomendação no histórico (e publica no PR, se permitido) |
| `sync_review_outcomes` | Busca no GitHub a decisão dos revisores humanos e o estado dos PRs já revisados, e grava no histórico |
| `get_recommendation_stats` | Concordância entre a recomendação do modelo e a decisão humana, por time e período |

### `record_review`

Campos principais:

| Campo | Descrição |
| --- | --- |
| `team_id`, `pr_url`, `review_summary`, `findings` | Obrigatórios. `findings` pode ser vazio (revisão sem problemas) |
| `recommendation` | Obrigatório: `approve`, `request_changes` ou `comment` |
| `recommendation_reason` | Obrigatório: motivo em até 500 caracteres |
| `confidence` | `low`, `medium` ou `high` |
| `injection_suspected` | `true` se o PR tem algo que parece instrução ao revisor; nunca combina com `approve` |
| `keywords` | Até 5 assuntos analisados (1 a 3 palavras), cada um com severidade |
| `commit_sha`, `pr_title`, `reviewer`, `publish` | Opcionais; `publish` (padrão `true`) publica o resultado como comentário no PR |

A recomendação **não aprova nem bloqueia** o PR: é só registrada, para calibrar o modelo. O banco recusa `approve` com achado `error` ou com `injection_suspected`, e `request_changes` sem nenhum `error` ou `warning`. Cada chamada cria um novo registro; revisar o mesmo PR de novo preserva o histórico.

## Prompt

`review_pull_request` (`pr_url`, `team_id`): fluxo completo de revisão, já com as regras de segurança e a orientação para escolher a recomendação. No Claude Code: `/mcp__devreview__review_pull_request`.

## Segurança (prompt injection)

O servidor orienta o modelo a tratar resultados de tools como dados não confiáveis:

- `instructions` do servidor: regras curtas enviadas ao cliente em qualquer uso.
- O prompt `review_pull_request` traz o fluxo completo com as regras de segurança.
- Tools de leitura (`get_pull_request`, `get_pull_request_diff`, `get_review_rules`, `search_teams_adrs`) devolvem o conteúdo dentro de um bloco `<untrusted-NONCE>` com nonce aleatório por resposta.
- `get_review_rules` exige `team_id` (antes, sem ele, devolvia as regras de todos os times).
- Suspeita de manipulação vira um achado `error` de segurança, com `injection_suspected` marcado e sem `approve`.

Os textos ficam em `src/lib/security-prompt.ts`. São orientação ao modelo, não garantia. As defesas que não dependem dele são:

- a redação de segredos no banco (veja o [README do Supabase](../../supabase/README.md));
- a checagem de posse de regra/ADR pelo time;
- as guardas da recomendação no banco (`approve` recusado com `error` ou `injection_suspected`);
- `GITHUB_ALLOWED_REPOS`, que limita onde o server publica;
- em `sync_review_outcomes`, os valores gravados vêm do GitHub, nunca do chamador.

## Estrutura de `src/`

```
src/
├── index.ts      # Cria o server, registra tools e prompt, conecta o stdio
├── tools/        # get-review-rules, adr, github-pr, metrics, keywords, record-review, recommendations
├── prompts/      # review-pull-request
├── lib/          # env, supabase, github, publish-review, security-prompt, untrusted
└── types.ts
```
