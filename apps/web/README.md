# DevReview Web

Painel do DevReview. Voltar para o [README da raiz](../../README.md).

## Stack

React 18, TypeScript, Vite, TailwindCSS, shadcn/ui (Radix), Redux Toolkit e React Router.

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

## Páginas

O login é por e-mail e senha (Supabase Auth).

| Rota | Conteúdo |
| --- | --- |
| `/` | Dashboard com estatísticas das revisões |
| `/regras` | Regras de review do time (categoria, severidade, ativa/inativa) |
| `/adrs` | ADRs (Architecture Decision Records) do time |
| `/historico` | Histórico de revisões, com achados e referências a regras e ADRs |
| `/membros` | Membros do time e aprovação de pedidos de entrada |
| `/times` | Gestão de times (administrador da plataforma) |

## Permissões

Aplicadas por RLS no banco; a interface apenas reflete o que o banco permite.

- **Membro aprovado:** lê regras, ADRs e histórico do seu time.
- **Líder:** edita regras e ADRs e aprova, promove e remove membros. Cada time tem no máximo 2 líderes e nunca fica sem líder.
- **Administrador da plataforma:** cria times e vê os dados de todos. É criado só por SQL ou service key.
- O cadastro cria um pedido **pendente** que um líder aprova.

## Estrutura de `src/`

```
src/
├── pages/        # Uma página por rota
├── components/   # layout/, history/, shared/ e ui/ (shadcn)
├── store/        # Redux Toolkit: slices (auth, teams, rules, adrs, history, members), selectors e hooks
├── hooks/        # useAuthBootstrap
├── lib/          # Cliente Supabase, utilitários e limits.ts
└── types/
```

Os limites de tamanho de texto em `src/lib/limits.ts` espelham os checks da migration `00005` do banco. Ao alterar um, altere o outro.
