# Estado Atual do Produto

Levantamento feito em 24/09/2026, cruzando código atual (`src/app`,
`src/components`, `src/lib`), `src/lib/feature-flags.ts` (lido
diretamente, não só via documentação), e a documentação em `docs/`.
Categorias: **Pronto/Implementado**, **Implementado mas atrás de flag**,
**Desativado**, **Pendente**, **Não confirmado**, **Próximos passos**.

## Catálogo e navegação

| Área | Estado | Evidência |
|---|---|---|
| Home (`/`) | ✅ Pronto | `src/app/page.tsx`; usa `listFeaturedTours()`, `listDestinations()`, `listCategories()`. Claims de "Mais procurados"/"selecionados para a temporada" foram **removidos** em 19/09/2026 (changelog) por não terem suporte real de popularidade/curadoria na API do NauticFlow — não reintroduzir sem esse dado existir de verdade. |
| `/passeios` (listagem) | ✅ Pronto | `src/app/passeios/page.tsx`; tem `loading.tsx` próprio. |
| `/passeios/[destino]` | ✅ Pronto | Listagem filtrada por destino. |
| `/passeios/[destino]/[slug]` (página do passeio) | ✅ Pronto | Tem `loading.tsx` próprio; inclui `BookingSelector`, `TourChecklist`, mapa (`src/lib/maps.ts`), breadcrumbs. |
| `/destinos` e `/destinos/[slug]` | ✅ Pronto | Dirigido por dados (ADR-015) — sem lista de cidades hardcoded; fallback de vitrine (`src/data/vitrine/destinations.ts`) cobre destinos sem conteúdo editorial ainda. |
| Multi-destino | ✅ Pronto (arquitetura) | `listDestinations()` é fonte única para home/`/destinos`/`/destinos/[slug]`/SearchBar/sitemap (ADR-015). Quantidade real de destinos publicados pelo NauticFlow hoje: **NÃO CONFIRMADO** nesta rodada (depende do catálogo real em produção, não verificável só pelo código). |
| Categorias | ✅ Pronto | `listCategories()`, `src/data/vitrine/categories.ts` como fallback de vitrine. |
| Disponibilidade (datas/saídas) | ✅ Pronto | Exibida em `BookingSelector`; tipos de preço (`per_person`/`per_group`/`starting_from`) tratados por `PRICE-TYPES.md` (ver [[Arquitetura e Camada de Dados]]). |
| Páginas legais (Termos/Privacidade) | ❌ Não existem | Nenhuma rota `termos`/`privacidade` encontrada em `src/app`. Mencionado como item aberto em `docs/AUDITORIA-PRE-INTEGRACAO.md` (25/08/2026); status de decisão de negócio sobre isso: **NÃO CONFIRMADO**. |
| SEO | ✅ Pronto | `src/app/sitemap.ts`, `src/app/robots.ts`, `src/lib/seo.ts` (testado), JSON-LD sanitizado contra XSS (`toSafeJsonLdScript`, ver [[Segurança]]). |
| Loading/erro | 🟡 Parcial | `src/app/error.tsx` e `src/app/not-found.tsx` globais existem. `loading.tsx` dedicado existe em `/passeios` e `/passeios/[destino]/[slug]`, mas **não** em `/`, `/destinos` nem `/destinos/[slug]` — Next usa o comportamento padrão (sem skeleton dedicado) nessas rotas. Não é um bug, mas é uma cobertura desigual que vale registrar. |
| Responsividade (BookingSelector, seletor de datas) | ✅ Pronto | Validado visualmente em browser real de 320px a 1440px em 22/09/2026 e novamente em 24/09/2026 (trabalho em andamento na branch atual, ver `git log`); `useDateWindowSize()` ajusta 3/4/5/7 chips por breakpoint. 470 testes / 39 arquivos passando na última rodada completa registrada (22/09/2026) — ver nota de staleness em [[Segurança]]. |

## Realtime

| Área | Estado | Evidência |
|---|---|---|
| `CatalogRefresh` (Supabase Realtime → `router.refresh()`) | ✅ Implementado, montado em produção | `src/app/layout.tsx:52` monta `<CatalogRefresh />` globalmente (confirmado por leitura direta do arquivo). Assina Postgres Changes na tabela singleton `public.marketplace_catalog_state` do NauticFlow, debounce de 400ms (ADR-014). |
| Variáveis `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL` / `_ANON_KEY` configuradas na Vercel Produção | ⚠️ **NÃO CONFIRMADO** | Não verificável a partir do repositório/sessão local (exigiria acesso ao painel/CLI da Vercel). Se ausentes, `CatalogRefresh` faz no-op silencioso — o site funciona normalmente, só sem auto-refresh de abas já abertas quando o catálogo muda no NauticFlow. Item pendente já registrado em `docs/DECISIONS.md` (ADR-014). |

## Fluxo transacional (reserva e pagamento)

Ver [[Feature Flags]] para o mecanismo exato. Resumo de estado:

| Área | Estado | Evidência |
|---|---|---|
| Infraestrutura de reserva (hold) — `POST /api/bookings` | 🔒 Implementado mas atrás de flag (`BOOKING_CHECKOUT_ENABLED = false`) | Confirmado por leitura direta de `src/lib/feature-flags.ts` linha 31 em 24/09/2026. Rota falha fechada por conta própria mesmo sem a flag — não depende só da UI esconder o botão. |
| `BookingSelector` (seleção de data/quantidade) | ✅ Pronto (UI) / dados reais funcionam, submissão de reserva bloqueada pela flag | `src/components/tours/BookingSelector.tsx` + `.test.tsx`/`.booking.test.tsx`/`.payment.test.tsx`. |
| Formulário do cliente (nome/e-mail/telefone/CPF) | 🔒 Implementado mas atrás de flag | `src/lib/customer-form.ts` (testado); só alcançável se `BOOKING_CHECKOUT_ENABLED = true`. |
| Revisão da reserva (`BookingConfirmation`) | 🔒 Implementado mas atrás de flag | Enquanto a flag estiver `false`, mostra só aviso de "reserva online em breve" — nunca instrui a contatar o operador (decisão deliberada, ver `feature-flags.ts`). |
| Pagamento Pix (`PixPayment`) | 🔒 Implementado mas atrás de flag (`PAYMENTS_UI_ENABLED = false`) | Confirmado por leitura direta, linha 53. Componente só é exercitado por teste direto (`PixPayment.test.tsx`), não alcançável pela UI real hoje. Depende também de `BOOKING_CHECKOUT_ENABLED = true` (uma reserva precisa existir antes de haver pagamento). |
| Contrato real de pagamento com NauticFlow | ✅ Confirmado (contrato), 🔒 atrás de flag (uso) | `docs/PAYMENTS.md`, validado 02/09/2026: endpoints reais, 5 valores de `PaymentStatus` confirmados. `amount` nunca é enviado pelo ToursFlow. |
| Voucher + compartilhamento via WhatsApp | 🔒 Implementado mas atrás de flag | `BookingVoucher.tsx` + `src/lib/whatsapp-voucher.ts` (ADR-017). Só alcançável após `PixPayment` reportar `status: 'paid'` — que por sua vez só é alcançável com as duas flags ligadas. Não é o voucher operacional do NauticFlow (sem QR code, sem validação de embarque); compartilhamento é manual (`wa.me`), sem envio automático. |
| Política de cancelamento (marketplace) | ✅ Pronto (texto/copy), ⏳ Pendente (regras/valores) | `src/lib/marketplace-cancellation-policy.ts` (ADR-016) centraliza a política pública, mas deliberadamente **sem** prazos/percentuais de reembolso inventados — isso é uma decisão de negócio ainda não tomada. |
| Idempotência de reserva/pagamento | ✅ Pronto | `src/lib/idempotency-key.ts`, testado; lifecycle documentado em `docs/RESERVAS-SERVER-TO-SERVER.md`. |

## Rodapé (footer) e conteúdo institucional

- Footer existe e é testado (`src/components/layout/Footer.test.tsx`), preparado para expansão
  multidestino (commit `af140b8`, ver `git log`). Conteúdo institucional específico (termos,
  privacidade, sobre) não foi auditado item a item nesta rodada — ver nota acima sobre páginas legais.

## Próximos passos registrados na documentação (não inferidos, citados diretamente das fontes)

- Decisão de negócio para ligar `BOOKING_CHECKOUT_ENABLED` (equipe operacional pronta para
  acompanhar holds) — `src/lib/feature-flags.ts`.
- Confirmar `MARKETPLACE_PAYMENTS_ENABLED` ligada em produção no NauticFlow antes de
  `PAYMENTS_UI_ENABLED = true` — mesmo arquivo.
- Confirmar configuração de `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL`/`_ANON_KEY` na Vercel Produção
  (ADR-014) — item pendente formal.
- Decisão de negócio sobre prazos/percentuais de reembolso da política de cancelamento (ADR-016).
- Fase 4 de segurança (upgrade para Next.js 16) — pendente formal, ver [[Segurança]].
- CI pipeline para PRs e ambiente de staging — `docs/DEPLOYMENT.md` lista como não implementado.

## Divergências encontradas nesta rodada

Nenhuma divergência entre documentação e código foi encontrada nos pontos verificados
diretamente (versões de dependências, valores das duas feature flags, ausência de rotas
`/operadores/[slug]` e de páginas legais, montagem do `CatalogRefresh`). Isso não significa
que não existam divergências em áreas não verificadas linha a linha nesta rodada — ver
[[Notas da Auditoria Documental]] para o que ficou fora do escopo desta verificação.
