# Pagamento (Pix) — contrato real, wiring completo, publicado atrás de feature flag

Data: 2026-09-02
Status: **contrato real confirmado e implementado ponta a ponta (tipos, rotas internas, client server-only, client do navegador, UI, testes) — código publicado em `main`/produção (`217c5bc`), gate server-side confirmado ao vivo contra `https://toursflow.com.br` (`422 PAYMENT_PROVIDER_NOT_ENABLED`, sem chamada upstream). Nenhuma chamada real ao NauticFlow foi feita a partir do ToursFlow.** O estado das flags financeiras do NauticFlow em Production (`MARKETPLACE_PAYMENTS_ENABLED`, `MARKETPLACE_PAYMENTS_MODE`, `MARKETPLACE_WITHDRAWAL_PAYOUT_ENABLED`) deve ser confirmado diretamente no ambiente antes de qualquer E2E financeiro — não deve ser assumido a partir desta documentação ou de sessões anteriores. O ToursFlow permanece protegido por `PAYMENTS_UI_ENABLED = false` independentemente desse estado. Fluxo transacional continua inatingível ao público.

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
reserva (`bookingId`). Se `MARKETPLACE_PAYMENTS_ENABLED` estiver desligada
no NauticFlow, a chamada falha com `PAYMENT_PROVIDER_NOT_ENABLED` antes de
criar qualquer tentativa/cobrança — o estado atual dessa flag em Production
deve ser confirmado diretamente no ambiente do NauticFlow, não assumido a
partir desta documentação.

### Consultar status (polling)

```
GET /api/marketplace/bookings/{bookingId}
Authorization: Bearer <TOURSFLOW_API_SECRET>
X-ToursFlow-Client-Key: <HMAC-SHA256 do IP, calculado server-side>
```

Somente leitura, sem `Idempotency-Key`. Devolve a "view" da reserva:
`bookingId`, `bookingStatus`, `holdExpiresAt`, `quantity`, `priceCents`,
`totalCents`, `payment: { status, method }` e `pix: { payload,
encodedImage?, expirationDate }` só enquanto o pagamento está pending E o
hold ainda vale.

**Correção (30/09/2026, conferido no código do NauticFlow Production
`ede8fb0`):** o POST **não** devolve a mesma view — devolve a tentativa
(`{ paymentId, status, paymentMethod, amountCents, currency, pix? }`,
`MarketplacePaymentAttemptDTO`). Antes, o navegador lia `payment.status`
(ausente → sempre "pending", inclusive num replay já `paid`) e
`totalCents` (ausente → preço inválido até o 1º polling). Agora a rota
POST do ToursFlow faz o POST e, em seguida, o GET, e devolve a view
normalizada (`mergePaymentAttemptIntoView` em
`src/lib/nauticflow-payments.ts`): status/valores sempre do GET; Pix da
tentativa só como fallback com pagamento pending e hold válido pelo
relógio do servidor.

### Semântica de nova tentativa (contrato NauticFlow `ede8fb0`)

- **Mesma `Idempotency-Key`** → replay: devolve a tentativa existente
  (antes de checar hold) e reconcilia a cobrança no Asaas por
  `externalReference` — nunca cobrança duplicada. É o que o botão
  "Tentar gerar Pix novamente" faz depois de erro ambíguo/transitório.
- **`Idempotency-Key` nova** → só cria outra tentativa se nenhuma estiver
  `pending`/`paid` (índice único `payments_one_active_per_reservation`);
  senão `PAYMENT_ALREADY_ACTIVE`. Depois de `failed` é "retry legítimo"
  (comentário da migration 0052) — é o que "Gerar novo Pix" faz. Hold
  vencido → `HOLD_EXPIRED`, sem cobrança.

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
| `src/components/tours/PixPayment.tsx` | client (`'use client'`) | QR/copia-e-cola, countdown, polling, os 5 estados reais + `reconciling`/`expired` (derivados; countdown local nunca decide settlement — ver changelog 2026-09-29) |
| `src/components/tours/BookingVoucher.tsx` | client | Tela final (reserva confirmada) — comprovante ToursFlow + compartilhamento manual via WhatsApp (ver ADR-017 em DECISIONS.md) |
| `src/lib/whatsapp-voucher.ts` | puro/testável | Monta a mensagem do comprovante e a URL `wa.me` — só campos públicos, nenhum campo de PII no tipo de entrada |
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

**Camada abaixo, também travada (ADR-013):** `BOOKING_CHECKOUT_ENABLED`
(mesmo arquivo, mesmo padrão) controla se existe reserva/hold público —
logicamente anterior a esta flag, já que não há pagamento sem uma reserva
primeiro. Também `false` hoje, com o mesmo tipo de trava server-side em
`POST /api/bookings` (`throwIfBookingCheckoutDisabled()`). Detalhe:
[RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md),
[SECURITY.md](SECURITY.md#16-rota-de-reserva-também-falha-fechada-server-side--booking_checkout_enabled-adr-013).

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

Recuperação de falha na criação do Pix (`PixPayment`, 30/09/2026): o
`bookingId` nunca se perde (estado do `BookingSelector`). Erro
ambíguo/transitório (`NETWORK_ERROR`, `PAYMENT_SERVICE_UNAVAILABLE`,
`INTERNAL_ERROR`, `PAYMENT_PROVIDER_ERROR`, `RATE_LIMITED`,
`CLIENT_IP_UNAVAILABLE`, `INVALID_CLIENT_KEY`, `UNAUTHORIZED`) →
"Tentar gerar Pix novamente" com a **mesma** key. `PAYMENT_ALREADY_ACTIVE`
/ `HOLD_EXPIRED` / `BOOKING_NOT_PENDING` / `BOOKING_NOT_FOUND` → só
"Verificar pagamento" (GET), que reaproveita um Pix ativo ou revela
`paid`. Demais códigos → só a mensagem. `failed` confirmado pelo
servidor → "Gerar novo Pix" com key **nova** (`BookingSelector` remonta
o `PixPayment` com `key={paymentIdempotencyKey}`).

## CPF obrigatório no checkout com Pix

Contrato real (NauticFlow `ede8fb0`): `POST /bookings` aceita CPF
opcional (11 dígitos se informado), mas a criação do Pix exige CPF/CNPJ
válido do cliente, senão devolve `CUSTOMER_DOCUMENT_REQUIRED` (checagem
dentro da RPC da migration 0059, antes de qualquer cobrança). Não existe
endpoint para corrigir o CPF de uma reserva já criada.

Regra (02/10/2026, achado [medium] do Codex `review-muroohvc-k067jh`):
com `PAYMENTS_UI_ENABLED`, o CPF válido (checksum) é obrigatório **antes**
de criar a reserva:

- `CustomerForm` com `cpfRequired`: rótulo "obrigatório para pagar com
  Pix", `aria-required`, sem avançar para a revisão.
- `BookingSelector.handleConfirmBooking` confere de novo antes do POST.
- `/api/bookings` recusa (400 `INVALID_REQUEST`) sem CPF válido quando
  `PAYMENTS_UI_ENABLED` — cobre chamada direta/build antigo.
- Com pagamentos OFF, o CPF continua opcional (comportamento anterior).
- CPF enviado só em dígitos (`normalizeCpf`), igual ao validado.
- Defesa residual: se `CUSTOMER_DOCUMENT_REQUIRED` ainda vier, o
  `PixPayment` mostra erro explícito sem retry, sem nova reserva e sem
  nova cobrança (a mensagem não promete corrigir o CPF da reserva).

## Política de cancelamento no checkout

Desde 02/10/2026 o `BookingReview` exibe, antes de "Confirmar reserva",
a política aprovada `MARKETPLACE_CANCELLATION_POLICY`
(`toursflow-standard`, versão `2026-10`; texto em
`src/lib/marketplace-cancellation-policy.ts`):

1. Cancelamentos com pelo menos 48 horas de antecedência: reembolso integral.
2. Cancelamentos entre 24 e 48 horas antes do passeio: reembolso de 50%.
3. Cancelamentos com menos de 24 horas de antecedência: sem reembolso.
4. Não comparecimento (no-show): sem reembolso.
5. Cancelamento pelo operador por condições climáticas, condições
   marítimas, segurança ou impossibilidade operacional: o cliente escolhe
   entre remarcação ou reembolso integral.
6. Reembolsos aprovados são processados pelo mesmo meio de pagamento da
   reserva, respeitando o prazo operacional desse meio.

Sem checkbox de aceite (ADR-016). A reserva ainda **não** grava
`id`/`version` da política — `CANCELLATION_POLICY_SNAPSHOT_PENDING`.

`TOURSFLOW_AUTH=VALIDATED` em 02/10/2026 (sonda com departure
inexistente: `404 DEPARTURE_NOT_FOUND`). E2E financeiro ainda não
executado.

## Segurança

- **`amount` nunca sai do ToursFlow.** Nem o `PaymentClient` do
  navegador, nem a rota interna, nem `nauticflow-payments.ts` aceitam ou
  enviam esse campo — confirmado por grep. O valor mostrado
  (`totalCents`) sempre vem da resposta do NauticFlow.
- **PII:** `PixPayment`/`BookingVoucher` continuam sem tocar
  `cpf`/`email`/`phone`/`customer` — o pagamento opera só sobre
  `bookingId` (já criado com esses dados na Fase 3). A mensagem de
  compartilhamento do WhatsApp (`whatsapp-voucher.ts`) segue a mesma
  regra: o tipo de entrada (`VoucherShareData`) não tem campo de
  nome/CPF/e-mail/telefone do comprador, Idempotency-Key nem id técnico
  de payment provider — não porque um filtro os remove, mas porque a
  interface nunca os aceita. `tourName`/`boardingPointName`/
  `boardingPointReference` chegam por prop explícita (nunca por URL,
  nunca persistidos em localStorage/sessionStorage).
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
  webhook do Asaas — isso é responsabilidade do NauticFlow), voucher
  operacional real do NauticFlow (formato/entrega ainda não definidos —
  `BookingVoucher` é só o comprovante ToursFlow do lado turista, com
  compartilhamento manual via WhatsApp; não é, nem substitui, o voucher
  operacional do NauticFlow — ver ADR-017 em DECISIONS.md).
- Envio automático de WhatsApp (WhatsApp Business API/Meta) — hoje o
  compartilhamento é sempre uma ação explícita do turista
  (`https://wa.me/?text=...`, sem número de destino). Envio automático
  ao telefone do comprador quando o pagamento é confirmado é evolução
  futura separada, não implementada — exigiria credenciais de
  provedor/Meta, templates aprovados, consentimento/base legal, retry e
  observabilidade (ver ADR-017).
