# Reservas: ToursFlow → NauticFlow (server-to-server)

Data: 2026-08-27 (última atualização: 2026-08-28, Fase 3)
Status: **conectada à interface pública — o botão "Confirmar reserva" no step de revisão chama `POST /api/bookings` de verdade (`src/lib/booking-submission.ts`), cria hold real no NauticFlow.** Infraestrutura validada em E2E real anterior (caminho de sucesso, replay e conflito de idempotência confirmados contra produção, antes desta fase); rate limit por visitante implementado e testado localmente, aguardando deploy coordenado dos dois lados; rota reforçada (Content-Type, limite de corpo real, Origin/Sec-Fetch-Site). **Este código ainda NÃO foi commitado/publicado em produção nesta etapa** — decisão deliberada, sem pagamento implementado ainda. Nenhum E2E controlado do fluxo completo pela UI foi executado contra produção (sem mecanismo de cleanup — ver [DECISIONS.md](DECISIONS.md), ADR-009); validação desta fase é 209 testes automatizados + verificação em browser real até o step de revisão.

Este documento descreve a integração de escrita (criação de reserva) entre o ToursFlow e o NauticFlow, complementar a [PLANO-INTEGRACAO-NAUTICFLOW.md](PLANO-INTEGRACAO-NAUTICFLOW.md) (que cobre só leitura de catálogo).

## Fluxo

```
navegador
   │  POST /api/bookings          (mesma origem, sem segredo no payload)
   ▼
ToursFlow (Route Handler, server-side)
   │  IP confiável do visitante (Vercel: x-vercel-forwarded-for)
   │  ↓ HMAC-SHA256 server-side (mesmo TOURSFLOW_API_SECRET)
   │  ↓ X-ToursFlow-Client-Key: <64 hex>
   │
   │  POST /api/marketplace/bookings
   │  Authorization: Bearer <TOURSFLOW_API_SECRET>
   │  Idempotency-Key: <mesma key recebida do navegador>
   │  X-ToursFlow-Client-Key: <hash, nunca o IP em claro>
   ▼
NauticFlow (fonte de verdade — preço, capacidade, hold, reserva,
            rate limit global + por visitante)
```

O navegador **nunca** chama o NauticFlow diretamente, **nunca** vê `TOURSFLOW_API_SECRET`, e **nunca** controla a própria identidade de rate limit. O segredo só existe em `src/lib/nauticflow-bookings.ts` e `src/lib/toursflow-client-key.ts`, marcados com `import 'server-only'` — importar qualquer um desses arquivos de um Client Component quebra o build em vez de vazar o segredo.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/types/booking.ts` | Contratos (request, response, códigos de erro) |
| `src/lib/booking-errors.ts` | `BookingApiError` (status + code + message) |
| `src/lib/booking-validation.ts` | Validação local + whitelist explícita do payload |
| `src/lib/client-ip.ts` | IP confiável do visitante (Vercel vs. fallback local). `server-only`. |
| `src/lib/toursflow-client-key.ts` | HMAC-SHA256 do IP → identidade pseudônima. `server-only`. |
| `src/lib/nauticflow-bookings.ts` | Único ponto que fala com o NauticFlow. `server-only`. |
| `src/app/api/bookings/route.ts` | Rota que o navegador chamará no futuro |

## Rate limit por visitante (identidade pseudônima)

O NauticFlow faz rate limit global e por visitante no `POST /api/marketplace/bookings`, usando `X-ToursFlow-Client-Key` — um HMAC-SHA256 do IP do visitante, calculado **só no ToursFlow**, com o mesmo `TOURSFLOW_API_SECRET` que já autentica a chamada:

```
X-ToursFlow-Client-Key = HMAC-SHA256(TOURSFLOW_API_SECRET, "rate-limit:v1:" + ip_normalizado)
```

- **O NauticFlow nunca recebe o IP em claro** — só o hash de 64 caracteres hex. `rate-limit:v1:` é domain separation: garante que este HMAC nunca pode ser confundido com o uso do mesmo segredo em outro contexto (o Bearer de autenticação, por exemplo).
- **Fonte do IP em produção (Vercel):** `x-vercel-forwarded-for` — header que a própria Vercel garante no edge, o cliente não consegue forjar. Nenhum header customizado do navegador (`X-Client-IP` e afins) é aceito como fonte.
- **Fora da Vercel (dev local, testes):** fallback controlado para `x-forwarded-for`, ativado só quando `process.env.VERCEL !== '1'`.
- **Falha fechada em produção:** se `x-vercel-forwarded-for` não estiver disponível ou for inválido, a rota responde `503 CLIENT_IP_UNAVAILABLE` — nunca gera uma identidade compartilhada tipo `"unknown"`/`"anonymous"`/`"0.0.0.0"` para todo mundo.
- **O navegador não controla a própria identidade.** Se o cliente enviar um header `X-ToursFlow-Client-Key`, a rota simplesmente nunca o lê — o valor é sempre recalculado a partir do IP confiável da requisição atual.
- **Nada disso é persistido no ToursFlow.** Nem IP, nem HMAC, nem nenhum dado de contato usado para identificar o visitante — o ToursFlow calcula o hash em memória, por requisição, e o esquece.
- **Nada de rate limit em memória no ToursFlow.** O limite de verdade mora no Postgres do NauticFlow; o ToursFlow só produz a identidade pseudônima do visitante.

## Idempotency-Key — ponta a ponta

A rota `/api/bookings` **exige** o header `Idempotency-Key` (formato UUID) e o repassa **sem alteração** ao NauticFlow. O ToursFlow nunca gera uma key nova em nome do cliente nem a substitui num retry.

**Regra para quando a interface pública existir:** o cliente (navegador) gera a key com `crypto.randomUUID()` no início de uma tentativa de reserva, e a reutiliza em qualquer retry **enquanto os dados semanticamente relevantes não mudarem** (`departureId`, `quantity`, `name`, `email`, `phone`, `cpf`). Se qualquer um desses mudar, gera uma key nova. Isso é o que permite ao NauticFlow tratar um duplo-clique ou um retry de timeout como a mesma operação, sem criar duas reservas.

## Whitelist do payload

`validateBookingInput()` extrai **só** `departureId`, `quantity`, `customer.{name,email,phone,cpf}` — mesmo que o JSON recebido contenha `companyId`, `tourId`, `price`, `total`, `status`, `source` ou qualquer outro campo, eles nunca chegam ao objeto validado nem são repassados ao NauticFlow. Preço e operador são sempre resolvidos pelo NauticFlow a partir do `departureId`.

## Contrato de price types (confirmado)

Tabela completa, padrão de segurança e histórico em
[PRICE-TYPES.md](PRICE-TYPES.md). Resumo: `per_person`/`per_group` são
vendáveis; `starting_from`/`per_boat` não são e ficam desabilitados no
`BookingSelector` (`isSellablePriceType()` em `src/lib/booking-selection.ts`)
antes de qualquer chamada ao backend.

## Erros

Os 12 códigos do NauticFlow (`INVALID_REQUEST`, `INVALID_IDEMPOTENCY_KEY`, `UNAUTHORIZED`, `DEPARTURE_NOT_FOUND`, `DEPARTURE_IN_PAST`, `DEPARTURE_NOT_SELLABLE`, `PRICE_NOT_CONFIGURED`, `PRICE_TYPE_NOT_SELLABLE`, `INSUFFICIENT_CAPACITY`, `RATE_LIMITED`, `IDEMPOTENCY_CONFLICT`, `INTERNAL_ERROR`) são preservados como estão — mesmo `status` HTTP, mesmo `code`. Falha de comunicação (timeout, rede, resposta inválida) vira `BOOKING_SERVICE_UNAVAILABLE` (503); impossibilidade de determinar um IP confiável vira `CLIENT_IP_UNAVAILABLE` (503, mensagem genérica ao navegador, sem mencionar IP/Vercel/header) — ambos códigos próprios do ToursFlow, para nunca serem confundidos com um erro de negócio do NauticFlow. Nenhuma resposta de erro inclui stack trace, detalhe interno, nome de variável de ambiente ou o segredo.

## Nenhum fallback mock

Diferente do catálogo (que cai para mock em dev local sem `NAUTICFLOW_API_URL`), a escrita de reserva **nunca** simula sucesso. Se `NAUTICFLOW_API_URL` ou `TOURSFLOW_API_SECRET` estiverem ausentes, ou se o NauticFlow estiver fora do ar, a rota falha com um erro real (`INTERNAL_ERROR` ou `BOOKING_SERVICE_UNAVAILABLE`) — nunca cria uma reserva fake nem responde 201 sem ter chamado o NauticFlow de verdade.

## O que já foi validado (E2E real, contra produção, com dados de teste isolados)

- Criação real de reserva (`201`), com preço/total calculados pelo NauticFlow (nunca pelo ToursFlow).
- Replay idempotente (`200` + `Idempotency-Replayed: true`, mesmo `bookingId`).
- Conflito de idempotência (`409 IDEMPOTENCY_CONFLICT`) quando a mesma key é reusada com dado semanticamente diferente.
- `soldOut` refletido corretamente no catálogo público após o hold.
- Autenticação real (Bearer) contra produção, sem o segredo aparecer em nenhum log ou resposta.

Tudo isso foi validado **antes** da Fase 3 (via chamada direta à rota, não pela UI). A Fase 3 conecta a UI ao mesmo caminho, mas **não repetiu esse E2E pela UI** — ver "Limitações" abaixo (ADR-009).

## Validação real contra produção (2026-09-01)

Depois de configurar o mesmo `TOURSFLOW_API_SECRET` nos dois projetos
Vercel (ToursFlow e NauticFlow, ambos redeployados), rodadas 3 chamadas
HTTP reais e não-destrutivas direto a
`https://nauticflow.com.br/api/marketplace/bookings` (nunca através da UI
do ToursFlow), todas com `departureId` inexistente (UUID gerado
aleatoriamente) para garantir que nenhuma reserva pudesse ser criada
independentemente do resultado da autenticação:

| Chamada | Authorization | Resultado |
|---|---|---|
| Sem header | — | `401 UNAUTHORIZED` |
| Bearer inválido | `Bearer valor-claramente-invalido` | `401 UNAUTHORIZED` |
| Bearer correto (mesmo valor do `.env.local`, presumivelmente == produção) | `Bearer <TOURSFLOW_API_SECRET>` | `400 INVALID_CLIENT_KEY: "Cabeçalho X-ToursFlow-Client-Key ausente ou inválido."` |

**Conclusões:**
- A autenticação Bearer funciona de verdade contra produção — a resposta
  muda de `401` para uma validação de camada seguinte assim que o
  segredo correto é enviado, prova direta de que o segredo configurado
  autentica com sucesso.
- **Achado que corrige a documentação anterior:** o NauticFlow em
  produção **já exige `X-ToursFlow-Client-Key`** neste endpoint — a
  suposição de que essa validação só existia no ambiente local dele
  (registrada em 2026-08-27/28) estava desatualizada. Como a chamada foi
  feita direto ao NauticFlow (sem passar pela rota `/api/bookings` do
  ToursFlow, que é quem calcula esse header), o teste não enviou o header
  — por isso a resposta parou nessa validação, não avançou até a checagem
  de `departureId`.
- **Não testado:** se o NauticFlow rejeita um `X-ToursFlow-Client-Key`
  presente mas com HMAC incorreto (forjado). Isso exigiria calcular o
  HMAC esperado a partir do IP que o NauticFlow enxerga desta chamada —
  não tentado nesta rodada para não escalar o escopo de um teste que já
  tinha objetivo cumprido (provar a autenticação Bearer).
- Nenhum registro foi criado em nenhuma das 3 chamadas — nem por falha de
  autenticação, nem por `departureId` inexistente (que teria sido a
  próxima barreira mesmo se a autenticação e o `X-ToursFlow-Client-Key`
  tivessem passado).
- Nenhum valor de segredo foi impresso em nenhum momento.

## O que já existe mas ainda NÃO foi publicado

- **A UI chama `/api/bookings` de verdade.** `BookingSelector` (seleção → `CustomerForm` → `BookingReview` → `BookingConfirmation`) cria uma reserva/hold real ao clicar "Confirmar reserva" — payload whitelisted e normalizado (`src/lib/booking-submission.ts`), `Idempotency-Key` enviada com ciclo de vida completo (`resolveIdempotencyKey()`), todos os `BookingErrorCode` tratados com mensagem segura, double-submit impedido, countdown do hold baseado em `holdExpiresAt` do servidor. Validado por 209 testes automatizados (`fetch` mockado) e verificação em browser real até o step de revisão (sem confirmar de verdade). **Não commitado/publicado em produção nesta etapa** — decisão deliberada, sem pagamento implementado.
- **Checkout/pagamento Pix também já existe, mais adiante na mesma branch local.** Contrato real do NauticFlow confirmado e integrado ponta a ponta (rota `/api/bookings/[bookingId]/payment`, `ToursFlowPaymentClient`, `PixPayment`/`BookingVoucher`) — ver [PAYMENTS.md](PAYMENTS.md), [DECISIONS.md](DECISIONS.md) ADR-011/ADR-012. Continua atrás de `PAYMENTS_UI_ENABLED = false`, não publicado.

## O que ainda NÃO existe

- Asaas/Split visível ao ToursFlow, cartão, webhook (recebido só pelo NauticFlow), voucher real, login do turista, área do cliente, e-mail transacional, cancelamento/reembolso, formulário completo de passageiros.
- **`X-ToursFlow-Client-Key`: o lado ToursFlow está implementado e comprovado por teste automatizado real (HMAC calculado de verdade, header forjado do navegador provadamente ignorado). O lado NauticFlow agora comprovadamente EXIGE este header em produção (ver "Validação real contra produção" acima) — isso fecha parte da lacuna antes registrada como "só validado localmente".** O que ainda não foi comprovado é se o NauticFlow valida o HMAC corretamente (rejeita um header forjado/incorreto) — só a presença/formato foram testados.
- Rate limiting próprio da rota `/api/bookings` no ToursFlow — **classificado como hardening/defesa em profundidade, não bloqueador**, em [ADR-007](DECISIONS.md#adr-007--rate-limit-próprio-do-toursflow-classificado-como-hardening-não-bloqueador) (ver "Limitações" abaixo).
- **E2E controlado do fluxo completo pela UI contra produção** (reserva e pagamento) — não executado por falta de mecanismo de cleanup/cancelamento de reserva acessível neste repositório (ver [ADR-009](DECISIONS.md#adr-009--nenhum-e2e-controlado-contra-produção-na-fase-3-sem-mecanismo-de-cleanup)). Não há confirmação real, em produção, de que clicar "Confirmar reserva"/"Pagar com Pix" cria o hold/pagamento corretamente ponta a ponta — só a garantia forte que os testes automatizados com `fetch` mockado + verificação em browser real conseguem dar.

## Limitações conhecidas (documentadas, não resolvidas nesta etapa)

- **Proteção de origem é best-effort, reforçada e testada explicitamente na Fase 2.** `isTrustedOrigin()` em `route.ts` agora usa `Sec-Fetch-Site` (rejeita sempre que `cross-site`) e, na ausência desse sinal, o host do `Origin` vs. `Host`/allowlist de hosts oficiais (`toursflow.com.br`, `toursflow.vercel.app`) — testado contra host oficial, host "parecido" (`toursflow.com.br.attacker.example`, rejeitado por comparação exata) e `localhost` em produção (rejeitado). Isso não é autenticação nem proteção CSRF completa — é só uma barreira contra POST cross-site óbvio, mais forte que antes mas ainda não sessão-based. Não há sessão de usuário nesta etapa para uma proteção mais forte. É uma camada independente do rate limit por `X-ToursFlow-Client-Key` — uma não substitui a outra. Detalhe: [SECURITY.md](SECURITY.md#5-proteção-de-origem-best-effort-documentada-como-tal--reforçada-na-fase-2).
- **Sem rate limit próprio na rota `/api/bookings` — hardening, não bloqueador.** O NauticFlow já tem hold de capacidade e idempotência **comprovados em E2E real** (protegem o risco mais grave: overbooking/duplicidade), mais rate limit global e por visitante como contrato documentado. Implementar uma camada própria no ToursFlow exigiria estado compartilhado serverless (Upstash Redis ou equivalente) — dependência SaaS nova, fora de escopo sem autorização — para reforçar uma proteção que já existe a jusante. Decisão e análise completa em [ADR-007](DECISIONS.md#adr-007--rate-limit-próprio-do-toursflow-classificado-como-hardening-não-bloqueador). Não bloqueia a Fase 3.
- **CAPTCHA:** não implementado, fora de escopo desta etapa.
- **Content-Type e tamanho real do corpo (Fase 2):** rota rejeita Content-Type ≠ `application/json` (415) e corpo acima de 10KB (413) — a proteção de tamanho conta os bytes REALMENTE recebidos em streaming (`readBodyWithLimit()`), não confia só em `Content-Length` (que só serve como rejeição antecipada quando ele mesmo já admite ser grande demais). Cobre corpo grande com ou sem `Content-Length`, e `Content-Length` mentiroso/menor que o corpo real.

## Próximo passo (fora desta etapa)

1. ~~Commitar, revisar e deployar a mudança do `X-ToursFlow-Client-Key` nos dois projetos de forma coordenada.~~ **Feito** — confirmado em produção em 2026-09-01 (ver "Validação real contra produção" acima): o NauticFlow já exige o header.
2. Fechar a parte que falta do E2E cross-serviço do rate limit: confirmar que o NauticFlow rejeita um `X-ToursFlow-Client-Key` com HMAC incorreto/forjado, não só ausente — item de acompanhamento, não bloqueador.
3. Antes de publicar o fluxo de reserva/pagamento em produção: definir um mecanismo de cleanup/cancelamento de reserva (ver [ADR-009](DECISIONS.md#adr-009--nenhum-e2e-controlado-contra-produção-na-fase-3-sem-mecanismo-de-cleanup)) e então rodar o E2E controlado do fluxo completo pela UI.
4. **Checkout/pagamento (Pix) já está implementado ponta a ponta em `feature/booking-checkout`** (contrato real confirmado, wiring completo, testado — ver [PAYMENTS.md](PAYMENTS.md), ADR-011/ADR-012 em [DECISIONS.md](DECISIONS.md)), mas continua atrás de `PAYMENTS_UI_ENABLED = false` e não publicado. Ligar a flag exige `MARKETPLACE_PAYMENTS_ENABLED` em produção no NauticFlow **e** revisão explícita autorizando a mudança — as duas condições, não uma ou outra.
