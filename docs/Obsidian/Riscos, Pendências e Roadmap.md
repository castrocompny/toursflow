# Riscos, Pendências e Roadmap

Consolida, em um único lugar, os itens pendentes/abertos já citados
individualmente em [[Estado Atual do Produto]], [[Segurança]] e
[[Integração NauticFlow - Plano e Contratos]]. Esta nota **não substitui**
essas notas — cada item abaixo tem um link para a nota-fonte com o
detalhe completo; o objetivo aqui é só dar uma visão única do que está
em aberto, para não precisar reconstruir esse quadro toda sessão.

## Decisões de negócio pendentes (não são bugs, são decisões não tomadas)

- Ligar `BOOKING_CHECKOUT_ENABLED` — depende de a equipe operacional
  estar pronta para acompanhar holds. Ver [[Feature Flags]].
- Ligar `PAYMENTS_UI_ENABLED` — depende de 3 condições, incluindo
  confirmação (não verificável pelo ToursFlow) de que
  `MARKETPLACE_PAYMENTS_ENABLED` está ligada no NauticFlow em produção.
  Ver [[Feature Flags]].
- Prazos/percentuais de reembolso da política de cancelamento do
  marketplace (ADR-016) — requisitos já enumerados, nenhum valor
  decidido. Ver [[Reservas e Pagamentos (Pix)]].
- Decisão de negócio sobre páginas legais (Termos/Privacidade) — hoje
  não existem rotas para elas. Ver [[Estado Atual do Produto]].

## Não confirmado nesta rodada (depende de acesso externo, não de código)

- Configuração real de `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL` /
  `_ANON_KEY` na Vercel Produção — sem elas, `CatalogRefresh` faz no-op
  silencioso (o site funciona, só sem auto-refresh). Ver
  [[Arquitetura e Camada de Dados]] e [[Deploy e Ambiente]].
- Estado real de `MARKETPLACE_PAYMENTS_ENABLED` no NauticFlow em
  produção. Ver [[Feature Flags]].
- Quantidade real de destinos publicados pelo NauticFlow hoje. Ver
  [[Estado Atual do Produto]].

## Trabalho técnico pendente formal (documentado, não implementado)

- Fase 4 de segurança: upgrade para Next.js 16. Ver [[Segurança]].
- CI pipeline para PRs e ambiente de staging — `docs/DEPLOYMENT.md` lista
  como não implementado. Ver [[Deploy e Ambiente]].
- Página `/operadores/[slug]` — nunca implementada; classificada como
  importante mas não obrigatória. Ver
  [[Integração NauticFlow - Plano e Contratos]].
- CSP completa — hoje só headers pontuais de segurança, sem CSP. Ver
  [[Segurança]].

## Risco aberto (não é decisão de negócio, é uma lacuna de diagnóstico)

- Causa raiz exata do overflow mobile relatado em dispositivo físico
  (não reproduzido em emulação DevTools) não foi formalmente isolada —
  o sintoma foi resolvido na validação manual do usuário após o commit
  `1b6fab5`, mas não há reprodução determinística em ferramenta. Ver
  [[UX e Responsividade Mobile]].

## Cobertura desigual (não é bug, mas vale registrar)

- `loading.tsx` dedicado existe em `/passeios` e
  `/passeios/[destino]/[slug]`, mas não em `/`, `/destinos` nem
  `/destinos/[slug]`. Ver [[Estado Atual do Produto]].

## Como usar esta nota

Cada rodada de trabalho que resolver um item acima deve: (1) atualizar a
nota-fonte original (ex.: [[Feature Flags]] quando uma flag for ligada),
e (2) remover a linha correspondente daqui. Não deixar um item "resolvido
nos dois lugares com texto divergente" — a nota-fonte manda.
