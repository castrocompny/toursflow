# Deploy

## Onde roda

- **Repositório:** `github.com/castrocompny/toursflow`, branch `main`.
- **Hospedagem:** Vercel, via CLI (`vercel --prod`) — não há `.vercel/`
  nem `vercel.json` commitado neste repositório; a ligação
  projeto-Vercel/env vars é feita na própria dashboard da Vercel, não em
  arquivo versionado.
- **Domínio de produção:** `https://toursflow.com.br` (valor de
  `NEXT_PUBLIC_SITE_URL`, usado em canonical/OG/sitemap).
- **Build:** `npm run build` (Next.js 14.2.5, App Router). Sem passo de
  build customizado além do padrão do Next.

## Regra deste projeto: deploy nunca é automático a partir de uma sessão

Rodar `vercel --prod` só acontece com autorização explícita do usuário
**a cada vez** — não é implícito por "o código está pronto" ou "os testes
passaram". Um `git push origin main` por si só não dispara deploy de
produção nesta configuração (sem `vercel.json` versionado nem CI de deploy
neste repo) — o deploy é um passo manual e separado.

## Variáveis de ambiente em produção

Configuradas na dashboard da Vercel (Project Settings → Environment
Variables), por ambiente (`Production`/`Preview`/`Development`). Lista
completa e propósito de cada uma: [ENVIRONMENT.md](ENVIRONMENT.md).
`TOURSFLOW_API_SECRET` precisa ser **o mesmo valor** configurado no lado do
NauticFlow — um deploy que muda esse valor de um lado sem coordenar o outro
quebra `/api/bookings` (ver
[RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md)).

## Antes de qualquer deploy de produção

1. `git fetch origin` + confirmar `HEAD` local == `origin/main` (nunca
   deployar código que diverge do que está no GitHub).
2. `npm run typecheck && npm run lint && npm test && npm run build` locais,
   todos verdes.
3. Confirmar que a mudança sendo deployada está documentada (`docs/` e
   `docs/changelog/CHANGELOG.md`) — regra permanente deste projeto.
4. Se a mudança envolve `TOURSFLOW_API_SECRET` ou o contrato com o
   NauticFlow (`X-ToursFlow-Client-Key`, formato de payload, price types),
   confirmar que o lado do NauticFlow está compatível **antes** de
   deployar — ver limitação conhecida em
   [SECURITY.md](SECURITY.md#limitações-conhecidas-aceitas-não-resolvidas-nesta-etapa)
   sobre o rate limit ainda não estar coordenado nos dois lados.

## PLANEJADO / NÃO IMPLEMENTADO

- Pipeline de CI que rode typecheck/lint/test/build automaticamente em PR
  (não existe hoje neste repositório).
- Deploy automático a partir de push em `main` (deliberadamente não
  configurado — ver regra acima).
- Ambiente de staging/preview dedicado e documentado (Vercel gera preview
  deploys por PR/branch por padrão, mas isso não foi verificado nem
  documentado como parte do fluxo deste projeto).
