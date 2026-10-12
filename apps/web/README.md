# DevReview Web

Painel do DevReview. Voltar para o [README da raiz](../../README.md).

## Stack

React 18, TypeScript, Vite, TailwindCSS, shadcn/ui (Radix), Redux Toolkit e React Router. Qualidade: Vitest, ESLint e Prettier.

## Como rodar

Com o Supabase local no ar (veja o [README do Supabase](../../supabase/README.md)):

```bash
cp .env.example .env
npm run dev          # na raiz do repo; ou "npm -w apps/web run dev"
```

O app abre em `http://localhost:5173`.

### Variáveis de ambiente (`.env`)

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL da API do Supabase (local: `http://localhost:54321`) |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/publishable. Vai no bundle, por isso só tem acesso de leitura pública limitada pelo RLS |

### Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | Serve o build de produção |
| `npm run test` | Testes unitários (Vitest) |
| `npm run lint` | ESLint (TypeScript e regras de hooks do React) em `src` |
| `npm run format:check` | Confere a formatação (Prettier) |
| `npm run format` | Aplica a formatação |
| `npm run check` | Lint, formatação, testes e build, nesta ordem (o mesmo que a CI roda) |

## Páginas

O login é por e-mail e senha (Supabase Auth).

| Rota | Conteúdo |
| --- | --- |
| `/` | Dashboard com um resumo das revisões |
| `/regras` | Regras de review do time (categoria, severidade, ativa/inativa) |
| `/adrs` | ADRs (Architecture Decision Records) do time |
| `/historico` | Histórico de revisões, com achados, palavras-chave e referências a regras e ADRs |
| `/estatisticas` | Estatísticas do time no período (veja abaixo) |
| `/membros` | Membros do time e aprovação de pedidos de entrada |
| `/times` | Gestão de times (administrador da plataforma) |

### Estatísticas (`/estatisticas`)

Visível a todos os membros do time, com seletor de período (7, 30, 90 ou 180 dias) e gráficos simples em CSS (sem biblioteca de gráficos). As agregações são feitas no banco, por funções que respeitam o RLS: cada membro só vê o próprio time.

| Seção | O que mostra |
| --- | --- |
| Visão geral | Revisões, média de issues, % de PRs sem problemas, % de achados resolvidos, suspeitas de injeção, e achados por severidade e por status |
| Evolução no tempo | Revisões e média de issues por dia (períodos de até 14 dias) ou por semana. O primeiro período é completo e o atual, em andamento, aparece mais claro |
| Temas | Palavras-chave mais analisadas, com a severidade e a variação contra o período anterior de mesma duração |
| Regras e ADRs | Regras mais violadas (com achados dispensados, indício de falso positivo), ADRs mais citados e regras ativas que nunca dispararam |
| Repositórios | Revisões, issues e média por repositório, com um mapa de calor de achados por categoria |
| Calibração do modelo | Recomendação do modelo × decisão humana: concordância, falsos aprovados, concordância por confiança e um indicador de prontidão para aprovação automática |

Detalhes de funcionamento:

- **Seções independentes:** cada seção carrega e falha sozinha. Uma consulta com erro mostra um aviso só naquela seção.
- **Formato conferido:** as respostas do banco passam por guardas de tipo (`src/lib/statsGuards.ts`). Com uma migration desatualizada, a seção afetada mostra "resposta em formato inesperado" em vez de quebrar a tela.
- **Calibração depende do desfecho humano:** a concordância só aparece depois que a tool `sync_review_outcomes` do MCP preenche a decisão dos revisores no GitHub.
- **Prontidão para aprovação automática:** é só um indicativo (mínimo de 50 aprovações recomendadas já decididas e no máximo 2% de falsos aprovados; constantes em `src/lib/stats.ts`). Nada é aprovado automaticamente.
- **Migrations necessárias:** da `00012` à `00015`: palavras-chave, recomendação e as funções de estatística (veja o [README do Supabase](../../supabase/README.md#migrations)).

## Permissões

Aplicadas por RLS no banco; a interface apenas reflete o que o banco permite.

- **Membro aprovado:** lê regras, ADRs, histórico e estatísticas do seu time.
- **Líder:** edita regras e ADRs e aprova, promove e remove membros. Cada time tem no máximo 2 líderes e nunca fica sem líder.
- **Administrador da plataforma:** cria times e vê os dados de todos. É criado só por SQL ou service key.
- O cadastro cria um pedido **pendente** que um líder aprova.

## Estrutura de `src/`

```
src/
├── pages/        # Uma página por rota
├── components/   # layout/, history/, stats/, shared/ e ui/ (shadcn)
├── store/        # Redux Toolkit: slices (auth, teams, rules, adrs, history, members, stats), selectors e hooks
├── hooks/        # useAuthBootstrap
├── lib/          # Cliente Supabase, limits.ts, stats.ts (cálculos) e statsGuards.ts (formato das respostas)
└── types/
```

Os limites de tamanho de texto em `src/lib/limits.ts` espelham os checks da migration `00005` do banco. Ao alterar um, altere o outro.

## Qualidade (testes, lint e formatação)

- `npm run test`: testes unitários (Vitest) das funções puras (`lib/stats`) e das guardas de formato (`lib/statsGuards`).
- `npm run lint`: ESLint com typescript-eslint e as regras de hooks do React, em todo o `src`.
- `npm run check`: lint, formatação, testes e build, nesta ordem. Na raiz: `npm run web:check`.
- **CI:** o workflow `.github/workflows/web-ci.yml` roda o `check` em todo PR que mexe em `apps/web`.

A formatação (Prettier) é adotada de forma incremental: `format` e `format:check` cobrem só os arquivos da tela de estatísticas (a lista está nos scripts do `package.json`). O restante do código ainda não foi formatado; para ampliar a cobertura, formate o resto num PR dedicado e inclua os caminhos nesses scripts.
