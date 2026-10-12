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
| `review_history` | Uma linha por revisão de PR |
| `review_findings` | Um registro por achado da revisão |

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

## Segurança

- **RLS em todas as tabelas.** Membro aprovado lê os dados do time; líder escreve regras e ADRs; administrador lê tudo.
- **Funções auxiliares no schema `private`**, fora da API exposta.
- **Gravação de revisões:** `record_review_with_findings` roda só com a `service_role`, que no histórico tem apenas `select` e `insert`. A função:
  - calcula `issues_found` (error + warning) no banco, não confia no chamador;
  - não grava trecho de código por padrão: só se passar pelo filtro `is_snippet_safe`;
  - substitui por aviso os textos livres que pareçam conter segredo (a resposta informa quantos em `text_redacted`);
  - valida que `rule_id` e `adr_id` pertencem ao time da revisão.
- **Limites de texto** nos checks da migration `00005`, espelhados em `apps/web/src/lib/limits.ts`.
