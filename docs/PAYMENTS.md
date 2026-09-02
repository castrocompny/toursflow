# Pagamento (Pix) — contrato real, wiring completo, não publicado

Data: 2026-09-02
Status: **contrato real confirmado e implementado ponta a ponta (tipos, rotas internas, client server-only, client do navegador, UI, testes). Nenhuma chamada real foi feita — `MARKETPLACE_PAYMENTS_ENABLED` está desligada no NauticFlow e `PAYMENTS_UI_ENABLED` está travada em `false` no ToursFlow.** Existe só em `feature/booking-checkout`, não publicada.

## Contrato real do NauticFlow

### Criar/reexibir pagamento Pix

```
POST /api/marketplace/bookings/{bookingId}/payment
Authorization: Bearer <TOURSFLOW_API_SECRET>
X-ToursFlow-Client-Key: <HMAC-SHA256 do IP, calculado server-side>
Idempotency-Key: <uuid>
Content-Type: application/json

{ "paymentMethod": "pix" }
```

**Nunca envia `amount`** — o NauticFlow recalcula o valor a partir da
reserva (`bookingId`). Com `MARKETPLACE_PAYMENTS_ENABLED` desligada (hoje),
falha com `PAYMENT_PROVIDER_NOT_ENABLED` antes de criar qualquer
tentativa/cobrança.

### Consultar status (polling)

```
GET /api/marketplace/bookings/{bookingId}
Authorization: Bearer <TOURSFLOW_API_SECRET>
X-ToursFlow-Client-Key: <HMAC-SHA256 do IP, calculado server-side>
```

Somente leitura, sem `Idempotency-Key`. Os dois endpoints devolvem a
mesma "view": `bookingId`, `bookingStatus`, `holdExpiresAt`, `quantity`,
`priceCents`, `totalCents`, `payment: { status, method }` e `pix:
{ payload, encodedImage?, expirationDate }` quando aplicável.

**Estados confirmados de `payment.status`:** `pending`, `paid`, `failed`,
`refunded`, `partially_refunded`. `manual_review` **não é** um status
confirmado do contrato — removido da modelagem depois de revisão; se vier
a existir, precisa ser confirmado antes de qualquer código assumir isso
de novo.

Modelagem completa: `src/types/payment.ts` (comentário no topo do arquivo
espelha exatamente este contrato).

## Arquitetura implementada (trust boundary)

```
Browser
   │  fetch same-origin, sem credencial nenhuma
   ▼
ToursFlow server           <- src/app/api/bookings/[bookingId]/payment/route.ts
   │  IP confiável -> HMAC (X-ToursFlow-Client-Key), sempre server-side
   │  Authorization: Bearer <TOURSFLOW_API_SECRET>
   ▼
NauticFlow                  <- cria cobrança no Asaas, aplica split, recebe webhook
   │
   ▼
Asaas
```

O navegador **nunca** fala com o NauticFlow nem com o Asaas — só com a
própria rota do ToursFlow, exatamente como o fluxo de booking
(`/api/bookings`). Nenhum arquivo alcançável pelo bundle do navegador lê
`TOURSFLOW_API_SECRET` (confirmado por grep antes de cada entrada deste
documento).

## Arquivos

| Arquivo | Camada | Responsabilidade |
|---|---|---|
| `src/types/payment.ts` | contrato | Tipos exatos do contrato real (`PaymentStatus`, `NauticFlowBookingPaymentView`, `PaymentErrorCode`) |
| `src/lib/payment-errors.ts` | server | `PaymentApiError` (status + code + message), mesmo padrão de `booking-errors.ts` |
| `src/lib/payment-error-messages.ts` | server + client | Mensagem segura por `PaymentErrorCode` (+ `NETWORK_ERROR`, só do cliente) |
| `src/lib/payment-validation.ts` | server | Whitelist: só `bookingId` (UUID), `Idempotency-Key`, `paymentMethod: "pix"` — nunca `amount` |
| `src/lib/nauticflow-payments.ts` | server-only | Único módulo que fala com o NauticFlow para pagamento — lê `TOURSFLOW_API_SECRET` |
| `src/lib/http-guards.ts` | server | Origin/Sec-Fetch-Site, Content-Type, limite real de corpo — extraído de `/api/bookings` (Fase 2) para ser reaproveitado aqui sem duplicar |
| `src/app/api/bookings/[bookingId]/payment/route.ts` | server | `POST` (criar Pix) e `GET` (status/polling) — únicas rotas do ToursFlow para pagamento |
| `src/lib/payment-client.ts` | client | `PaymentClient` (interface), `ToursFlowPaymentClient` (real — chama só as rotas acima), `NotImplementedPaymentClient` (mantido) |
| `src/components/tours/PixPayment.tsx` | client (`'use client'`) | QR/copia-e-cola, countdown, polling, os 5 estados reais + `expired` (derivado) |
| `src/components/tours/BookingVoucher.tsx` | client | Tela final (reserva confirmada) |
| `src/test/fake-payment-client.ts` | teste | Fake em memória — nunca importado por código de produção |

## `client-ip.ts` generalizado

`getTrustedClientIp()` passou a receber `onUnavailable: () => never` em
vez de lançar `BookingApiError` fixo — permite ser reaproveitado pela
rota de pagamento (que lança `PaymentApiError`) sem acoplar o módulo
compartilhado a um tipo de erro específico. Mesmo padrão já usado em
`readBodyWithLimit()` (`http-guards.ts`). Comportamento idêntico ao
anterior, só a forma de sinalizar erro mudou — testado (`client-ip.test.ts`).

## Feature flag — e por que ela sozinha NUNCA foi suficiente

`PAYMENTS_UI_ENABLED` (`src/lib/feature-flags.ts`) continua `false` —
constante literal, não lê env var. Enquanto isso:

- `BookingConfirmation` não recebe `onPayWithPix` — mostra só o aviso de
  que pagamento vem depois.
- Os steps `payment-pix`/`voucher` de `BookingSelector` são inatingíveis
  pela UI real — só testados diretamente.

**Achado de segurança corrigido em 2026-09-02 (ADR-012): "a UI esconde o
botão" nunca foi uma proteção de segurança.** Até essa correção,
`POST`/`GET /api/bookings/[bookingId]/payment` não verificavam a flag —
um `curl`/`fetch` direto à rota, com headers corretos, chegaria ao
NauticFlow de verdade, independente do que a UI mostrasse. Corrigido:
`throwIfPaymentsDisabled()` é a **primeira** checagem de ambos os
handlers (antes de Origin, Content-Type, parsing) — a rota falha fechada
por conta própria, não porque o React não oferece o botão.

**Cadeia de defesa em profundidade real, hoje:**

```
Browser
   │  (nenhum botão "Pagar com Pix" — mas isso é UX, não segurança)
   ▼
ToursFlow server-side feature gate      <- throwIfPaymentsDisabled(), PRIMEIRA linha da rota
   │  (mesma constante PAYMENTS_UI_ENABLED, checada aqui de verdade)
   ▼
ToursFlow server-side auth/client-key   <- Origin, Content-Type, IP confiável -> HMAC, Bearer
   ▼
NauticFlow feature gate                  <- MARKETPLACE_PAYMENTS_ENABLED (independente, do outro lado)
   ▼
Asaas
```

Cada camada falha fechada por conta própria — nenhuma depende da anterior
ter funcionado. Confirmado por teste (`route.disabled.test.ts`, sem mock
de `feature-flags`, exercitando o valor real `false`) e por chamada
`curl` real contra o dev server local (`POST`/`GET` bem-formados, ambos
`422 PAYMENT_PROVIDER_NOT_ENABLED` em menos de 1 segundo — tempo
incompatível com uma tentativa real de rede ao NauticFlow).

**`GET` também está travado**, apesar de não ter efeito financeiro —
decisão deliberada (não existe status de pagamento legítimo para
consultar com a flag off; reduz superfície de leitura sem custo real).
Ver ADR-012 para a análise completa.

Ligar a flag exige: `MARKETPLACE_PAYMENTS_ENABLED` ligada em produção no
NauticFlow **e** revisão explícita autorizando a mudança de flag — as
duas, não uma ou outra.

## Idempotência (dois conceitos separados)

- **Idempotency-Key da reserva** (`idempotencyKeyState` em
  `BookingSelector`) — já existia desde a Fase 2/3, usada em
  `/api/bookings`.
- **Idempotency-Key do pagamento** (`paymentIdempotencyKey`, novo) —
  gerada uma única vez ao entrar no step `payment-pix`
  (`createIdempotencyKey()`), reaproveitada em qualquer retry dentro da
  mesma tentativa de pagamento, resetada para `null` depois de um
  `onPaid` (sucesso definitivo) — a próxima tentativa de pagamento
  (ex.: nova reserva) sempre recebe key nova.

`GET` (polling) nunca precisa de `Idempotency-Key` — é leitura pura,
nunca cria nada.

## Segurança

- **`amount` nunca sai do ToursFlow.** Nem o `PaymentClient` do
  navegador, nem a rota interna, nem `nauticflow-payments.ts` aceitam ou
  enviam esse campo — confirmado por grep. O valor mostrado
  (`totalCents`) sempre vem da resposta do NauticFlow.
- **PII:** `PixPayment`/`BookingVoucher` continuam sem tocar
  `cpf`/`email`/`phone`/`customer` — o pagamento opera só sobre
  `bookingId` (já criado com esses dados na Fase 3).
- **Erros nunca vazam detalhe técnico:** todo `PaymentApiError`/
  `PaymentClientError` vira uma das 17 mensagens curadas em
  `payment-error-messages.ts` — nunca o texto bruto do NauticFlow/Asaas.
- **`CUSTOMER_DOCUMENT_REQUIRED`:** o NauticFlow pode exigir CPF para
  Pix — mapeado com mensagem própria ("Para pagar com Pix, informe o CPF
  nos dados do comprador"). Como o CPF já é coletado (opcional) na Fase 2,
  isso é um erro possível de acontecer de verdade quando o fluxo for
  ligado — a UI trata, mas não força o campo a virar obrigatório no
  formulário (fora do escopo desta entrada).

## O que ainda falta (não bloqueante para esta entrega, bloqueante para publicar)

1. Ligar `MARKETPLACE_PAYMENTS_ENABLED` em produção no NauticFlow.
2. Ligar `PAYMENTS_UI_ENABLED` no ToursFlow — só com revisão explícita.
3. **E2E financeiro real da primeira venda** — nenhuma chamada real foi
   feita nesta entrega nem nas anteriores; a primeira transação real
   (mesmo de teste, com Asaas sandbox ou produção controlada) continua
   pendente, e precisa de um mecanismo de cleanup/estorno definido antes
   de acontecer (mesma ressalva do booking, ver
   [DECISIONS.md](DECISIONS.md), ADR-009).
4. Decidir se CPF deve virar obrigatório no `CustomerForm` quando o
   passeio aceitar Pix (hoje é opcional) — para reduzir a chance real de
   `CUSTOMER_DOCUMENT_REQUIRED` no fluxo.

## PLANEJADO / NÃO IMPLEMENTADO

- Qualquer chamada real ao endpoint de pagamento (nenhuma foi feita).
- `PAYMENTS_UI_ENABLED = true` em qualquer ambiente.
- Cartão, split visível ao ToursFlow, webhook (o ToursFlow nunca recebe
  webhook do Asaas — isso é responsabilidade do NauticFlow), voucher real
  (formato/entrega ainda não definidos — `BookingVoucher` é só a
  confirmação visual do lado ToursFlow).
