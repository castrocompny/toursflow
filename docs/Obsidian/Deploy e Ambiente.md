# Deploy e Ambiente

Fonte: `docs/DEPLOYMENT.md` (85 linhas) e `docs/ENVIRONMENT.md` (31 linhas).

## Deploy

- GitHub → Vercel, deploy automático em push para `main` (confirmado
  empiricamente em 28/08/2026 — corrigiu uma suposição anterior de que o
  deploy era manual).
- A mesma integração GitHub → Vercel também gera um **Preview** automático
  para push em qualquer branch (não só `main`) — confirmado em 24/09/2026
  com o commit `1b6fab5` na branch `frontend/mobile-booking-ux`. Ver
  [[UX e Responsividade Mobile]] para o caso de uso real desse Preview.
- Previews da Vercel têm **Vercel Authentication (SSO)** ligada
  (`all_except_custom_domains`) — só membros do time acessam.
- Preview atual usado para o 1º E2E financeiro (29/09/2026):
  `dpl_9PNHYBymvCCLzJFW5n7WkLDGHTZ2`, commit `f4a0398`,
  `toursflow-gh2pmu46r-joao-s-projecto1.vercel.app` (alias de branch
  `toursflow-git-frontend-mobile-booking-ux-joao-s-projecto1.vercel.app`).
  Único Preview com checkout/pagamento ligados — ver [[Feature Flags]].
- Production em 29/09/2026: `dpl_3sKcTa9M3GS5zp8GcG3DukWG21Tc`
  (`main` @ `8acc69f`), flags OFF, não alterada.
- Sem `vercel.json`/`.vercel/` no repositório.
- Dois domínios: `toursflow.com.br` e `toursflow.vercel.app`.
- Sem pipeline de CI para PRs (documentado como não implementado, não
  esquecido).
- Sem ambiente de staging (mesmo status).
- Checklist de pré-push com 5 itens em `docs/DEPLOYMENT.md`.

## Variáveis de ambiente (`docs/ENVIRONMENT.md`)

| Variável | Escopo | Obrigatória? | Efeito se ausente |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Pública | Sim | — |
| `NAUTICFLOW_API_URL` | Servidor | Opcional | Ativa fallback mock (ADR-001) |
| `TOURSFLOW_API_SECRET` | Servidor | Obrigatória só para `/api/bookings` funcionar de verdade | Usada como Bearer auth **e** como chave HMAC de identidade de rate limit |
| `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL` | Pública | Necessária para `CatalogRefresh` funcionar | Sem ela, `CatalogRefresh` faz no-op silencioso |
| `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_ANON_KEY` | Pública | Idem | Idem |

Configuração real dessas duas últimas variáveis na Vercel Produção é
**NÃO CONFIRMADO** nesta rodada — ver [[Estado Atual do Produto]].

`VERCEL_ENV` e `VERCEL_GIT_COMMIT_REF` (sistema) são lidas no build por
`next.config.mjs` e decidem as flags transacionais — ver [[Feature Flags]].
`TOURSFLOW_API_SECRET` do escopo Preview **não autentica** no NauticFlow
Production em 29/09/2026 (401) — ver [[Reservas e Pagamentos (Pix)]].

`VERCEL` é injetada automaticamente pela plataforma — não precisa ser
configurada manualmente.
