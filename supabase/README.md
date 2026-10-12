# DevReview Supabase

Banco PostgreSQL, autenticação, RLS, migrations e seed do DevReview. Voltar para o [README da raiz](../README.md).

## Como rodar (local)

```bash
npx supabase start       # sobe o stack local (requer Docker)
npx supabase db reset    # aplica as migrations e o seed.sql
```

| Serviço | Porta |
| --- | --- |
| API | 54321 |
| Banco (Postgres) | 54322 |
| Studio | 54323 |
| Inbucket (e-mails de teste) | 54324 |

A senha mínima do Auth (`minimum_password_length`) está em `config.toml` e é espelhada em `apps/web/src/lib/limits.ts`.

### Projeto remoto

Em um projeto remoto, aplique as migrations de `migrations/` em ordem (por exemplo, no SQL Editor do Supabase). O painel de migrations do Supabase só registra o que for aplicado pela CLI; scripts colados no SQL Editor não aparecem lá.

As migrations `00013`, `00014` e `00015` usam `create or replace` e `drop ... if exists`, então podem ser reexecutadas. Se uma delas mudar depois de aplicada, aplique o arquivo de novo. O painel mostra "formato inesperado" nas seções afetadas enquanto o banco estiver com uma versão antiga das funções de estatística.

## Seed

`seed.sql` cria três times com IDs fixos, para referência no MCP server e nos exemplos:

| Time | ID |
| --- | --- |
| Frontend | `11111111-1111-1111-1111-111111111111` |
| Backend | `22222222-2222-2222-2222-222222222222` |
| Integrations | `33333333-3333-3333-3333-333333333333` |

Também traz regras de exemplo por time, histórico de revisões do Frontend e ADRs do Frontend.

O seed não cria usuários. O primeiro líder de cada time e o administrador da plataforma são criados à mão, por SQL ou service key.

## Tabelas

| Tabela | Conteúdo |
| --- | --- |
| `teams` | Times |
| `team_members` | Vínculo usuário-time, com papel (`leader`/`member`) e status (`pending`/`approved`) |
| `platform_admins` | Administradores da plataforma, acima dos times |
| `review_rules` | Regras de review (categoria, severidade, ativa) |
| `adrs` | Architecture Decision Records (status `proposed`, `accepted`, `deprecated`) |
| `review_history` | Uma linha por revisão de PR, com a recomendação do modelo e o desfecho humano |
| `review_findings` | Um registro por achado da revisão |
| `review_keywords` | Até 5 palavras-chave (assuntos) por revisão, com severidade e posição |

### Recomendação e desfecho em `review_history`

| Coluna | Conteúdo |
| --- | --- |
| `recommendation` | `approve`, `request_changes` ou `comment` (nula em revisões antigas) |
| `recommendation_reason`, `recommendation_confidence` | Motivo (até 500 caracteres) e confiança (`low`, `medium`, `high`) |
| `injection_suspected` | O revisor suspeitou de prompt injection no PR |
| `outcome_decision` | Decisão humana no GitHub: `approved`, `changes_requested` ou `none` (sem decisão); nula até a sincronização |
| `outcome_pr_state`, `outcome_checked_at` | Estado do PR (`open`, `closed`, `merged`) e quando foi consultado |

## Migrations

| Migration | O que faz |
| --- | --- |
| `00001_init_schema` | Tabelas `teams`, `review_rules`, `review_history` e `adrs` |
| `00002_enable_rls` | Liga o RLS; leitura pública para a chave anon, escrita só pela service key |
| `00003_team_roles_and_approval` | `team_members` com papéis e aprovação, trigger de auto-cadastro como `member`/`pending`, limite de 2 líderes e RLS por time |
| `00004_protect_last_leader` | Impede que um usuário deixe o time sem líder |
| `00005_text_length_limits` | Limites de tamanho de texto validados no banco |
| `00006_platform_admins` | Administrador da plataforma: cria times, lê todos os dados, gerencia membros (`admin_add_member`) |
| `00007_review_history_write_and_service_role_grants` | Privilégio mínimo da service role: `select` nas tabelas de consulta e `insert` no histórico |
| `00008_review_findings` | `review_findings` e a função atômica `record_review_with_findings` |
| `00009_record_review_hardening` | Detector de segredos (`contains_secret`) em texto livre e validação do número do PR |
| `00010_review_github_publish` | `github_review_url` no histórico e `set_review_github_url`, para não publicar a mesma revisão duas vezes |
| `00011_finding_adr_reference` | Referência opcional a ADR nos achados (`adr_id`, `adr_title`) |
| `00012_review_keywords` | `review_keywords` (normalização em `normalize_keyword`), gravação das palavras-chave em `record_review_with_findings` e `get_team_keyword_stats` |
| `00013_review_recommendation` | Recomendação do modelo e desfecho humano em `review_history`, guardas de coerência em `record_review_with_findings`, `set_review_outcome` e `get_team_recommendation_stats` |
| `00014_stats_page` | Funções de estatística da tela (`get_team_stats_overview`, `get_team_reference_stats`) e a matriz recomendação × desfecho em `get_team_recommendation_stats`, liberadas ao `authenticated` |
| `00015_stats_evolution_themes_repos` | `get_team_stats_timeseries`, `get_team_keyword_trends` e `get_team_repo_stats` |

A `record_review_with_findings` é criada na `00008` e recriada nas `00009`, `00011`, `00012` e `00013`. As duas últimas mudam a lista de parâmetros e por isso removem a assinatura anterior (`drop function`), para não haver duas sobrecargas ambíguas na chamada via RPC.

## Funções de estatística

Chamadas pelo painel (`authenticated`) e pelo MCP (`service_role`). São `security invoker`: o RLS vale para quem chama, então um membro só enxerga o próprio time e o administrador, todos. Nenhuma é executável pelo `anon`.

| Função | Retorno |
| --- | --- |
| `get_team_stats_overview` | Totais do período: revisões, achados por severidade e por status, suspeitas de injeção |
| `get_team_reference_stats` | Regras e ADRs mais citados e regras ativas que nunca dispararam |
| `get_team_recommendation_stats` | Concordância entre recomendação e decisão humana, matriz e detalhe por confiança |
| `get_team_stats_timeseries` | Revisões e achados por dia ou semana, com os períodos vazios; o atual vem marcado `in_progress` |
| `get_team_keyword_trends` | Ranking de temas com o total do período anterior de mesma duração |
| `get_team_repo_stats` | `{items, total}`: revisões, issues e achados por categoria em cada repositório |

`get_team_keyword_stats` (palavras-chave) é executável só pela `service_role`.

## Segurança

- **RLS em todas as tabelas.** Membro aprovado lê os dados do time; líder escreve regras e ADRs; administrador lê tudo.
- **Funções auxiliares no schema `private`**, fora da API exposta.
- **Gravação de revisões:** `record_review_with_findings` roda só com a `service_role`, que no histórico tem apenas `select` e `insert`. A função:
  - calcula `issues_found` (error + warning) no banco, não confia no chamador;
  - não grava trecho de código por padrão: só se passar pelo filtro `is_snippet_safe`;
  - substitui por aviso os textos livres que pareçam conter segredo (a resposta informa quantos em `text_redacted`);
  - valida que `rule_id` e `adr_id` pertencem ao time da revisão;
  - valida as palavras-chave (até 5, de 1 a 3 palavras) e recusa as que pareçam conter segredo;
  - recusa recomendações incoerentes: `approve` com achado `error` ou com `injection_suspected`, e `request_changes` sem `error` nem `warning`.
- **Desfecho humano:** a `service_role` não tem `update` em `review_history`; o desfecho só é gravado por `set_review_outcome`, com valores validados.
- **Limites de texto** nos checks da migration `00005`, espelhados em `apps/web/src/lib/limits.ts`.
