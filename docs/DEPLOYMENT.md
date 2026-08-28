# Deploy

## Onde roda

- **Repositório:** `github.com/castrocompny/toursflow`, branch `main`.
- **Hospedagem:** Vercel, com **deploy automático via integração
  GitHub → Vercel**: todo push em `main` gera um novo Production
  Deployment sem passo manual — confirmado em produção em 2026-08-28 (o
  commit `9594cec`, pushado sem rodar `vercel --prod`, apareceu como
  Production Deployment `READY` no dashboard e foi confirmado servindo o
  fix nele contido via smoke test HTTP real). Não há `.vercel/` neste
  repositório (o link projeto-Vercel vive só na configuração da conta
  Vercel/GitHub, não em arquivo versionado) nem `vercel.json`.
- **Domínios de produção:** `https://toursflow.com.br` e
  `https://toursflow.vercel.app` (ambos servem o mesmo deployment).
  `NEXT_PUBLIC_SITE_URL` usa o primeiro (canonical/OG/sitemap).
- **Build:** `npm run build` (Next.js 14.2.5, App Router). Sem passo de
  build customizado além do padrão do Next.

## Deploy é automático a partir de `main` — não existe passo manual de rotina

Um `git push origin main` **já é** o deploy de produção — a Vercel builda
e publica automaticamente via GitHub App, sem intervenção manual. Rodar
`vercel --prod` a partir de uma sessão **não deveria ser necessário** no
fluxo normal; se algum dia for preciso (ex.: forçar redeploy sem novo
commit), isso continua exigindo autorização explícita do usuário a cada
vez — nunca implícito.

Nota de correção (2026-08-28): uma versão anterior deste documento
afirmava que o deploy era manual (`vercel --prod`, sem auto-deploy
configurado). Isso estava incorreto — era uma suposição não verificada,
não um fato checado contra a configuração real da Vercel. Corrigido nesta
entrada depois de confirmar o auto-deploy do commit `9594cec` na prática.

## Variáveis de ambiente em produção

Configuradas na dashboard da Vercel (Project Settings → Environment
Variables), por ambiente (`Production`/`Preview`/`Development`). Lista
completa e propósito de cada uma: [ENVIRONMENT.md](ENVIRONMENT.md).
`TOURSFLOW_API_SECRET` precisa ser **o mesmo valor** configurado no lado do
NauticFlow — um deploy que muda esse valor de um lado sem coordenar o outro
quebra `/api/bookings` (ver
[RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md)).

## Antes de qualquer push em `main` (já é o deploy)

Como o push já publica em produção, os passos abaixo precisam acontecer
**antes** do push, não depois:

1. `git fetch origin` + confirmar `HEAD` local == `origin/main` antes de
   commitar em cima (nunca divergir do que está no GitHub).
2. `npm run typecheck && npm run lint && npm test && npm run build` locais,
   todos verdes.
3. Confirmar que a mudança está documentada (`docs/` e
   `docs/changelog/CHANGELOG.md`) — regra permanente deste projeto.
4. Se a mudança envolve `TOURSFLOW_API_SECRET` ou o contrato com o
   NauticFlow (`X-ToursFlow-Client-Key`, formato de payload, price types),
   confirmar que o lado do NauticFlow está compatível **antes** do push —
   ver limitação conhecida em
   [SECURITY.md](SECURITY.md#limitações-conhecidas-aceitas-não-resolvidas-nesta-etapa)
   sobre o rate limit ainda não estar coordenado nos dois lados.
5. Depois do push, validar produção com smoke test HTTP real (`/`,
   `/passeios`, uma página de passeio real) antes de considerar a mudança
   entregue — não assumir sucesso só pelo build local.

## Histórico de deploys confirmados

| Commit | Data | Conteúdo | Confirmado em produção |
|---|---|---|---|
| `9594cec` | 2026-08-28 | Fix de XSS no JSON-LD (`toSafeJsonLdScript`) + documentação | Sim — smoke test HTTP real (`toursflow.com.br`, `toursflow.vercel.app`), commit reportado `READY` no dashboard da Vercel |

## PLANEJADO / NÃO IMPLEMENTADO

- Pipeline de CI que rode typecheck/lint/test/build automaticamente em PR
  (não existe hoje neste repositório — o auto-deploy da Vercel builda o
  projeto, mas não é a mesma coisa que um CI de PR com esses 4 passos).
- Ambiente de staging/preview dedicado e documentado (Vercel gera preview
  deploys por PR/branch por padrão, mas isso não foi verificado nem
  documentado como parte do fluxo deste projeto).
- Acesso a essa conta/projeto Vercel a partir de sessões de agente neste
  ambiente: a CLI autenticada aqui em 2026-08-28 só enxergava o time/projeto
  do NauticFlow, não o do ToursFlow — validação de deploy nesta data foi
  feita por HTTP direto contra os domínios públicos, não via API/CLI da
  Vercel.
