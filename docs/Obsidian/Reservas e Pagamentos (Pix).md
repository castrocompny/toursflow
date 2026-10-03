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
`MARKETPLACE_CANCELLATION_POLICY` (id/version/title/summary/terms)
substitui, na UI pública, a antiga política por operador
(`tour.cancellationPolicy`).

**Política comercial aprovada pelo usuário em 02/10/2026** —
`toursflow-standard`, versão **`2026-10`**:

1. Cancelamentos com pelo menos 48 horas de antecedência: reembolso integral.
2. Cancelamentos entre 24 e 48 horas antes do passeio: reembolso de 50%.
3. Cancelamentos com menos de 24 horas de antecedência: sem reembolso.
4. Não comparecimento (no-show): sem reembolso.
5. Cancelamento pelo operador por condições climáticas, condições
   marítimas, segurança ou impossibilidade operacional: o cliente escolhe
   entre remarcação ou reembolso integral.
6. Reembolsos aprovados são processados pelo mesmo meio de pagamento da
   reserva, respeitando o prazo operacional desse meio.

Exibida integralmente (resumo + lista) no checkout (`BookingReview`,
logo antes de "Confirmar reserva", só quando o botão existe) e na página
do passeio. Sem checkbox de aceite (ADR-016). Motivo: achado [medium] do
Codex (02/10/2026, `review-muro2f8i-uca0v9`): o checkout mostrava só o
placeholder "serão apresentadas antes da confirmação".

**`CANCELLATION_POLICY_SNAPSHOT_PENDING`**: a reserva ainda não grava
`id`/`version`/snapshot da política (exige NauticFlow/banco). Não bloqueia
o E2E interno no Preview; bloqueia o go-live público definitivo.

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
  voucher) e em qualquer status não-pending do servidor (`failed`,
  `refunded`, `partially_refunded`). Quando o countdown local zera, **não
  para mais**: entra em `reconciling` (ver seção "Reconciliação
  pós-expiração" abaixo). Erro transitório de polling é ignorado e tenta
  no próximo tick.
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
- ~~Pagamento confirmado depois da expiração local não é detectado pela UI
  (polling já parou).~~ **Corrigido em 29/09/2026** — ver abaixo.

### Reconciliação pós-expiração (achado HIGH do Codex, 29/09/2026)

**Achado** (`/codex:adversarial-review --base main`, verdict
`needs-attention`): "Keep reconciling payment status after the local
countdown expires". **Causa:** o efeito de expiração do `PixPayment`
fazia `phase='expired'` com base no relógio do navegador, e isso parava o
polling. Pagamento feito perto do fim + webhook Asaas → NauticFlow
atrasado (ou relógio do navegador adiantado) = cliente vê "Pix expirou"
para sempre, `onPaid` nunca é chamado, voucher nunca aparece.

**Regra nova:** relógio local só decide a expiração **visual** do QR;
settlement é sempre do servidor.

- Fases: `creating → pending → reconciling → expired`, com `paid` /
  `failed` / `refunded` / `partially_refunded` vindos do servidor a partir
  de qualquer uma delas, e `error` (falha ao criar).
- `pending` → countdown zera → `reconciling`: QR/copia-e-cola escondidos,
  mensagem "Verificando pagamento… não pague de novo", polling continua.
- Janela: `RECONCILE_MAX_POLLS = 24` consultas × 5 s = **2 min**, contadas
  desde a entrada em `reconciling` (não por timestamp → imune a clock
  skew). O contrato não expõe janela server-side de liquidação; 2 min
  cobre atraso normal de webhook; 12 req/min ≪ 40/60 s do NauticFlow.
- Fim da janela → **uma** consulta final (GET). Só se ela ainda for
  `pending` (ou falhar por rede) → `expired`. Depois disso não há mais
  polling (sem loop infinito).
- `expired` = "não confirmado a tempo", não falha definitiva: mantém o
  botão **"Verificar pagamento"**.
- **"Verificar pagamento"** (em `reconciling` e `expired`): só
  `getBookingPaymentStatus(bookingId)` — nunca POST, nunca novo
  booking/cobrança/Pix. Desabilitado durante a consulta (ref síncrona
  contra clique repetido); erro de rede mostra mensagem e mantém o
  `bookingId`.
- `settledRef`: primeiro estado terminal do servidor vence; respostas
  atrasadas não sobrescrevem nem chamam `onPaid` duas vezes. A criação
  também passa por `applyServerView` (se o POST idempotente já devolver
  `paid`, vai direto ao voucher).
- `bookingId`: continua em memória no `BookingSelector` (`bookingResult`)
  durante todo o step `payment-pix` — nenhuma persistência nova.
- Testes: 10 novos em `PixPayment.test.tsx` (paid após expiração local,
  reconciling não-terminal, paid vence, failed terminal, consulta final,
  final paid, final com erro de rede, clock skew +20 min, verificar só GET
  + anti-spam, bookingId preservado, sem polling após terminal). Todos
  falham contra o componente antigo. O teste antigo "expira pela detecção
  local" foi removido — codificava o comportamento inseguro.

**Retry "Gerar novo Pix": NÃO implementado (follow-up).** Uma nova
tentativa exige nova `Idempotency-Key`; se o NauticFlow aceita criar outra
cobrança para um booking com tentativa `failed` (ou devolve
`PAYMENT_ALREADY_ACTIVE`/`HOLD_EXPIRED`) não é provável pelo código do
ToursFlow, então não foi feito às cegas.

### Booking preso por falha na criação do Pix + política no checkout (Codex, 30/09/2026)

Review `review-muni5eye-qgk5sn` (`--base main`, `needs-attention`):

- **[high] Recuperar falha ambígua ao criar o Pix**
  (`src/lib/feature-flags.ts:83`). Se o NauticFlow cria o Pix mas a
  resposta se perde ou estoura o timeout de 8s do ToursFlow,
  `PixPayment` caía em `error`. Essa tela não tinha verificar nem
  retry, e o polling não roda em `error`. Recarregar perde `bookingId`
  e key.
  - **Resolvido:**
    - "Tentar gerar Pix novamente" para erros ambíguos/transitórios. Usa
      a MESMA key, então o NauticFlow faz replay da tentativa e
      reconcilia a cobrança, sem cobrança nova.
    - "Verificar pagamento" (só GET) para `PAYMENT_ALREADY_ACTIVE`,
      `HOLD_EXPIRED`, `BOOKING_NOT_PENDING` e `BOOKING_NOT_FOUND`.
      Reaproveita o Pix ativo ou revela `paid`.
    - "Gerar novo Pix" depois de `failed`, com key NOVA, no mesmo
      booking.
    - Guardas síncronas contra clique repetido.
    - Detalhe das regras em `docs/PAYMENTS.md`.
- **Achado colateral (contrato):** o POST do NauticFlow devolve a
  *tentativa*, não a view. A rota POST do ToursFlow agora faz POST e
  depois GET e devolve a view normalizada (`mergePaymentAttemptIntoView`).
- **[medium] Política de cancelamento antes da confirmação**
  (`src/lib/feature-flags.ts:59`).
  - **Parcialmente resolvido:**
    - `BookingReview` mostra `MARKETPLACE_CANCELLATION_POLICY`
      (`toursflow-standard`, versão `2026-09`, título + summary) logo
      antes de "Confirmar reserva", só quando o botão existe.
    - Sem checkbox: ADR-016 deixa o aceite para decisão de produto.
  - **Continua pendente (decisão de negócio, não código):**
    - O `summary` atual não tem condições concretas. ADR-016 lista o
      que a versão oficial precisa cobrir.
    - Snapshot `id`/`version` na reserva: não implementado (exige
      NauticFlow/banco), é follow-up.
  - **Mitigação do E2E:** o Preview é protegido por Vercel SSO, então é
    um fluxo interno autenticado, e Production continua OFF.
- **Testes:**
  - 6 de integração em `BookingSelector.payment.test.tsx`:
    - retry 503 com a mesma key até o voucher;
    - rede + clique repetido;
    - `PAYMENT_ALREADY_ACTIVE` reaproveitando o Pix;
    - `HOLD_EXPIRED` só com GET;
    - erro fatal sem ações;
    - `failed` → key nova.

    5 deles falham contra o código antigo.
  - 3 de rota: POST+GET normalizado, replay `paid`, GET pós-POST falhando.
  - 5 de `mergePaymentAttemptIntoView`.
  - 1 de política na revisão, e asserção de que ela fica oculta com as
    flags OFF.

**Sonda de auth repetida em 01/10/2026: `TOURSFLOW_AUTH=FAILED`.**

| Item | Valor |
|---|---|
| Preview | `fcc6321` (`dpl_2uA7WGZAgynQftW4zjbTzKDie29q`) |
| Requisição | POST `/api/bookings` com departure inexistente (UUID zerado) |
| Resposta | **HTTP 401 `UNAUTHORIZED`** |

- O ToursFlow só produz `UNAUTHORIZED` quando o NauticFlow responde 401.
  Então o Bearer enviado pelo Preview não bate com o secret do NauticFlow
  Production.
- O NauticFlow Production foi redeployado em `5e5c6f2`, antes do build
  deste Preview. Entre `ede8fb0` e `5e5c6f2` só mudaram docs, o webhook
  Asaas e a migration 0079. O contrato de booking/pagamento ficou igual.
- **Ação do usuário:** conferir no projeto ToursFlow da Vercel se
  `TOURSFLOW_API_SECRET` foi atualizada também no escopo **Preview**
  (não só Production), sem espaço nem quebra de linha. Depois, redeployar
  o Preview e repetir a sonda. Esperado: `404 DEPARTURE_NOT_FOUND`.
- Nenhum valor de secret foi lido ou exibido. Nenhum booking válido foi
  criado.

### Auth revalidada (02/10/2026): **TOURSFLOW_AUTH=VALIDATED**

Depois da nova rotação do `TOURSFLOW_API_SECRET` e de um Preview criado
após a atualização (`dpl_CEvMisnmsSHjYTTkPnjSLJd8MAYw`, commit `cd06ab3`),
a sonda `POST /api/bookings` com departure inexistente retornou
`HTTP_STATUS=404`, `ERROR_CODE=DEPARTURE_NOT_FOUND` — o NauticFlow
Production aceitou a autenticação. Nenhum booking/cobrança/Pix criado.
E2E financeiro ainda **não executado**.

### CPF obrigatório antes da reserva no checkout com Pix (02/10/2026)

Achado [medium] do Codex (`review-muroohvc-k067jh`): CPF vazio criava a
reserva e o Pix falhava depois com `CUSTOMER_DOCUMENT_REQUIRED`, deixando
o hold preso. Agora, com `PAYMENTS_UI_ENABLED`, o CPF válido é
obrigatório no `CustomerForm`, conferido de novo antes do POST e exigido
por `/api/bookings` (400 sem chamar o NauticFlow). Pagamentos OFF: CPF
segue opcional. Detalhes em `docs/PAYMENTS.md`.

### Recuperação depois de reload (02/10/2026, ADR-018)

Achado [high] do Codex (`review-murpf4bf-6614rm`). Sintoma: um reload no
meio do Pix (app do banco) perdia o `bookingId` e a key, e o turista
podia pagar duas vezes.

**O que mudou:**

- `src/lib/booking-recovery.ts` guarda em `sessionStorage` só
  `bookingId`, `departureId` e `paymentIdempotencyKey`. Sem PII.
- O `BookingSelector` recupera na montagem **só por GET**:

| Resposta do GET | O que a UI mostra |
|---|---|
| `paid` | voucher |
| sem pagamento | confirmação |
| tentativa existente | `PixPayment` com `initialView`, sem POST |

- Erro de rede: "Verificar novamente".
- `BOOKING_NOT_FOUND`: limpa a referência.
- Depois de pago: a referência continua até "Fazer outra reserva" ou o
  fechamento da aba.

**Testes:** 10 de integração (9 deles falham contra o código anterior),
mais 9 do helper.

**Observação de segurança, pré-existente:** quem tem o `bookingId` (UUID)
consegue consultar status e Pix pendente. Não há PII na resposta e nenhum
controle foi relaxado.

**Atualização v2 (Codex `review-murq0mbc-75mrlm`).**

- **Desacoplada do catálogo de venda:** o escopo agora é `tourSlug` mais
  `departsAt` (antes era `departureId`). Com catálogo vazio ou saída
  esgotada, o voucher e o Pix continuam recuperáveis.
- **Reserva sem pagamento, hold vencido ou cancelada:** aparece "Esta
  reserva expirou." com "Fazer outra reserva".
- **Pagamento `pending`:** nunca é tratado como reserva abandonada; a
  reconciliação continua.

