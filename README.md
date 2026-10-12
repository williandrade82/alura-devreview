# DevReview

Ferramenta de code review assistida por IA, projeto do Curso 5: MCP, Conectando o Agent ao Mundo Real.

Cada time define suas regras de review e ADRs em um painel web. Um agente (ex.: Claude Code) usa um MCP server para ler essas regras, revisar um pull request do GitHub e registrar o resultado no histórico, que volta a aparecer no painel. Além do resultado, o agente registra uma **recomendação de ação** (aprovar, solicitar mudanças ou apenas comentar), que o painel compara com a decisão humana para medir a qualidade do modelo.

## Subprojetos

| Parte | O que é | Documentação |
| --- | --- | --- |
| `apps/web` | Painel React: regras, ADRs, histórico, estatísticas e membros | [apps/web/README.md](apps/web/README.md) |
| `apps/mcp-server` | MCP server `devreview`: tools de regras, ADRs, PRs, métricas, palavras-chave, recomendações e registro de revisões | [apps/mcp-server/README.md](apps/mcp-server/README.md) |
| `supabase` | Banco PostgreSQL, auth, RLS, migrations e seed | [supabase/README.md](supabase/README.md) |

## Como as partes se conectam

```
 Painel web (anon/authenticated + RLS) ──┐
                                         ├──► Supabase (Postgres + Auth)
 MCP server (service key) ───────────────┘
        ▲
        │ stdio
 Claude Code ──► GitHub (PR, diff e comentário de review)
```

- O painel lê e escreve no Supabase com o JWT do usuário; o RLS decide o que cada um vê e edita. As estatísticas são calculadas no banco, por funções que respeitam o RLS.
- O MCP server usa a service key, com privilégios mínimos (leitura das regras e ADRs, inserção no histórico via função).
- O fluxo de uma revisão: o agente chama `get_review_rules` e `search_teams_adrs`, lê o PR com `get_pull_request` e `get_pull_request_diff`, e grava o resultado com `record_review`. O painel mostra o histórico e as estatísticas em seguida. O prompt `review_pull_request` do MCP traz esse fluxo pronto.

## Modo sombra: recomendação do modelo

Em cada revisão o modelo registra uma recomendação (`approve`, `request_changes` ou `comment`), com motivo e confiança. **Nada aprova ou bloqueia o PR no GitHub**: o comentário publicado é sempre `COMMENT`, e a recomendação aparece nele como informativa.

- O banco recusa recomendações incoerentes: `approve` com achado de severidade `error` ou com suspeita de prompt injection, e `request_changes` sem nenhum `error` ou `warning`.
- A tool `sync_review_outcomes` busca no GitHub o que os revisores humanos decidiram e o estado do PR.
- A tela **Estatísticas** compara recomendação e decisão humana (concordância, falsos aprovados e falsos bloqueios) e mostra um indicador de prontidão para uma futura aprovação automática. É só um indicativo: nenhuma aprovação automática existe.

## Pré-requisitos

- Node.js 20+
- npm 10+
- Supabase CLI (`npm install -g supabase`)
- Docker (usado pelo `supabase start`)

## Quick start

```bash
# 1. Instalar dependências (monorepo com npm workspaces)
npm install

# 2. Iniciar o Supabase local e aplicar migrations e seed
npx supabase start
npx supabase db reset

# 3. Configurar e iniciar o painel
cp apps/web/.env.example apps/web/.env
npm run dev
```

O app abre em `http://localhost:5173` e o Supabase Studio em `http://localhost:54323`.

Para usar o MCP server, siga o [README dele](apps/mcp-server/README.md).

Em um projeto Supabase remoto, as migrations de `supabase/migrations/` precisam ser aplicadas em ordem (por exemplo, no SQL Editor). Veja a [lista de migrations](supabase/README.md#migrations): as mais recentes (`00014` e `00015`) são reexecutáveis.

## Scripts da raiz

| Script | O que faz |
| --- | --- |
| `npm run dev` | Painel em modo desenvolvimento (Vite) |
| `npm run build` | Build de produção do painel |
| `npm run web:check` | Lint, formatação, testes e build do painel (o mesmo que a CI roda) |
| `npm run mcp:build` | Compila o MCP server para `apps/mcp-server/build` |
| `npm run mcp:dev` | Compila o MCP server em modo watch |
| `npm run mcp:inspector` | Abre o MCP Inspector apontando para o server compilado |

## Integração contínua

O workflow `.github/workflows/web-ci.yml` roda `npm run web:check` em todo pull request que mexe em `apps/web`.

## Estrutura

```
devreview/
├── apps/
│   ├── web/          # Painel React
│   └── mcp-server/   # MCP server
├── supabase/         # Configuração, migrations e seed data
├── .github/          # Workflow de CI do painel
├── .mcp.json         # MCPs usados pelo Claude Code (devreview, supabase, github)
└── docs/             # Documentação do curso (gitignored)
```
