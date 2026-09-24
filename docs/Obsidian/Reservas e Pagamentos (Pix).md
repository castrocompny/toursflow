# Reservas e Pagamentos (Pix)

Toda a infraestrutura abaixo está implementada e testada, mas inacessível
pela UI pública porque atrás das flags descritas em [[Feature Flags]].

## Fluxo de reserva (hold)

1. `BookingSelector` coleta data/saída + quantidade
   (`src/lib/booking-selection.ts`).
2. `validateBookingInput()` extrai **só** os campos da whitelist:
   `departureId`, `quantity`, `customer.{name,email,phone,cpf}`
   (ADR-005) — nunca repassa preço, total, `companyId`, status ou
   qualquer outro campo não previsto.
3. `POST /api/bookings` chama `POST /api/marketplace/bookings` do
   NauticFlow com `Authorization: Bearer <TOURSFLOW_API_SECRET>`.
4. O NauticFlow recalcula preço/total a partir do `departureId` — o
   ToursFlow nunca envia nem confia em preço vindo do cliente.

## Tipos de preço (`docs/PRICE-TYPES.md`, confirmado em `src/types/index.ts`)

| NauticFlow | ToursFlow | Vendável? |
|---|---|---|
| `por_pessoa` | `per_person` | Sim — total = preço × quantidade |
| `por_grupo` | `per_group` | Sim — total = preço fixo, quantidade não multiplica |
| `a_partir_de` | `starting_from` | **Não** — só catálogo; NauticFlow rejeita com `PRICE_TYPE_NOT_SELLABLE` |
| (nenhum) | `per_boat` | Legado/só mock — nunca produzido pelo mapeamento real; tratado como não vendável por segurança |
| valor desconhecido | — | Fail-safe para `starting_from` (não vendável) — lado seguro do fail-safe, confirmado com o operador real em 28/08/2026 |

## Identidade de rate limit (ADR-004)

`X-ToursFlow-Client-Key = HMAC-SHA256(TOURSFLOW_API_SECRET, "rate-limit:v1:" + ip)`,
calculado só no servidor a partir de `x-vercel-forwarded-for` em
produção. Um header desse tipo vindo do cliente é sempre ignorado e
recalculado. Confirmado exercitado contra o NauticFlow real em produção
em 01/09/2026 — o NauticFlow hoje exige esse header em produção (isso
corrigiu uma suposição anterior da documentação de que era validado só
localmente).

## Idempotência

`src/lib/idempotency-key.ts`: a chave é reaproveitada em retry com a
mesma "fingerprint" de dados, regenerada quando dados relevantes mudam,
e resetada para `null` depois de sucesso definitivo ou de um
`IDEMPOTENCY_CONFLICT`. Existem duas chaves de idempotência separadas no
fluxo completo: uma para a reserva, outra para o pagamento.

## Pagamento Pix (`docs/PAYMENTS.md`, contrato real confirmado em 02/09/2026)

- Endpoints reais: `POST /api/marketplace/bookings/{bookingId}/payment`
  e `GET /api/marketplace/bookings/{bookingId}/payment`, além de
  `GET /api/marketplace/bookings/{bookingId}`.
- `PaymentStatus` tem **exatamente 5 valores confirmados**: `pending`,
  `paid`, `failed`, `refunded`, `partially_refunded`. `manual_review`
  foi removido da documentação por não ser confirmado.
- `amount` **nunca** é enviado pelo ToursFlow — o NauticFlow sempre
  recalcula.

## Voucher e compartilhamento via WhatsApp (ADR-017)

- `BookingVoucher.tsx` + `src/lib/whatsapp-voucher.ts`
  (`buildVoucherShareMessage` / `buildWhatsAppShareUrl`).
- Compartilhamento manual via `https://wa.me/?text=...` — sem número de
  destino fixo, sem envio automático.
- Nenhum PII no tipo de mensagem do voucher.
- Só alcançável depois que `PixPayment` reporta `status: 'paid'`.
- **Não é** o voucher operacional do NauticFlow — sem QR code, sem
  validação de embarque.

## Política de cancelamento (ADR-016)

`src/lib/marketplace-cancellation-policy.ts` — objeto
`MARKETPLACE_CANCELLATION_POLICY` (id/version/title/summary) substitui,
na UI pública, a antiga política por operador
(`tour.cancellationPolicy`). Deliberadamente **sem nenhum número
financeiro ou prazo inventado ainda** — os requisitos da política oficial
já estão enumerados (cancelamento pelo turista, no-show, condições
climáticas/marítimas, segurança, cancelamento operacional, remarcação,
elegibilidade de reembolso, prazo de reembolso), mas nenhum foi decidido.
**Pendente formal**, não um esquecimento.

## Componentes e arquivos principais

`BookingSelector.tsx`, `BookingConfirmation.tsx`, `PixPayment.tsx`,
`BookingVoucher.tsx`, `src/lib/booking-validation.ts`,
`src/lib/booking-submission.ts`, `src/lib/nauticflow-bookings.ts`,
`src/lib/nauticflow-payments.ts`, `src/lib/payment-client.ts`,
`src/lib/toursflow-client-key.ts`, `src/lib/idempotency-key.ts`.
