# Deploy e Ambiente

Fonte: `docs/DEPLOYMENT.md` (85 linhas) e `docs/ENVIRONMENT.md` (31 linhas).

## Deploy

- GitHub → Vercel, deploy automático em push para `main` (confirmado
  empiricamente em 28/08/2026 — corrigiu uma suposição anterior de que o
  deploy era manual).
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

`VERCEL` é injetada automaticamente pela plataforma — não precisa ser
configurada manualmente.
