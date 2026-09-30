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

## Preparação do 1º E2E financeiro (29/09/2026)

### Autenticação ToursFlow → NauticFlow: **TOURSFLOW_AUTH=FAILED**

Sonda segura no Preview `dpl_9PNHYBymvCCLzJFW5n7WkLDGHTZ2`:
`POST /api/bookings` com `departureId` UUID aleatório inexistente, dados
de cliente fictícios, client-key real (HMAC calculado pelo próprio
servidor). Não tinha como criar booking (no máximo `DEPARTURE_NOT_FOUND`).

- Resposta: **HTTP 401, `UNAUTHORIZED`**.
- Runtime logs do NauticFlow: `POST /api/marketplace/bookings 401` na
  deployment de Production `dpl_62K79FMQ5SMbFtGQ5ahqYrkyxcBq` (`ede8fb0`)
  no mesmo segundo → o `NAUTICFLOW_API_URL` do Preview aponta para o
  NauticFlow Production correto; o que falha é o Bearer.
- No NauticFlow, 401 só sai de `isAuthorizedToursFlowRequest`: secret
  ausente no NauticFlow, ou `TOURSFLOW_API_SECRET` do ToursFlow (escopo
  Preview) diferente do NauticFlow Production (inclui espaço/quebra de
  linha no valor). Nenhum secret foi lido, impresso ou copiado.
- **Ação necessária (usuário)**: alinhar `TOURSFLOW_API_SECRET` do
  ToursFlow no escopo **Preview** da Vercel com o do NauticFlow Production
  e fazer **Redeploy** do Preview (env nova só vale em build/deploy novo).
  Repetir a mesma sonda: esperado `404 DEPARTURE_NOT_FOUND`.

### Polling de pagamento: **COMPATÍVEL**

- `PixPayment.tsx`: `POLL_INTERVAL_MS = 5000`. Começa só depois do Pix
  criado (`phase === 'pending'`), para em `paid` (chama `onPaid` →
  voucher), em qualquer status não-pending (`failed`, `refunded`,
  `partially_refunded`) e em `expired` (calculado no cliente a partir de
  `pix.expirationDate ?? holdExpiresAt`). Sem timeout global separado —
  a expiração é o teto. Erro transitório de polling é ignorado e tenta no
  próximo tick.
- NauticFlow (`ede8fb0`, defaults do código): poll 40 req/60s por client
  key, 3000 req/60s global. 5 s = 12 req/min por visitante → cabe com
  folga (~3 abas do mesmo IP). Valores reais de env do NauticFlow
  Production: **NÃO CONFIRMADO** (só os defaults do código foram lidos).

### Fluxo revalidado (código)

Preço nunca autoritativo (confirmação mostra `priceCents`/`totalCents`
do NauticFlow); duplo-submit bloqueado por `isSubmittingRef` + botão
`disabled`; Idempotency-Key com fingerprint, reusada em retry e zerada em
sucesso/`IDEMPOTENCY_CONFLICT`; hold expirado esconde "Pagar com Pix";
`bookingId` preservado em memória; key de pagamento gerada uma vez por
tentativa (sem cobrança duplicada); voucher só após `paid`.

Lacunas conhecidas (não bloqueiam E2E controlado):
- `PixPayment` em `error`/`failed` não tem botão de nova tentativa — o
  texto de `failed` sugere "gerar um novo Pix", mas o único caminho é
  recarregar, o que perde o `bookingId` em memória (o hold continua no
  NauticFlow até expirar).
- Pagamento confirmado depois da expiração local não é detectado pela UI
  (polling já parou).
