# Reservas: ToursFlow → NauticFlow (server-to-server)

Data: 2026-08-27
Status: **infraestrutura pronta e validada em E2E real (caminho de sucesso, replay e conflito de idempotência confirmados contra produção); rate limit por visitante implementado e testado localmente, aguardando deploy coordenado dos dois lados. Não conectada à interface pública.**

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

## O que ainda NÃO existe

- Nenhum botão da interface pública chama `/api/bookings`. A seleção de saída em `DeparturesList` continua sendo só visual (estado local, sem submit) — confirmado por grep, nenhuma referência a `/api/bookings` fora da própria rota e dos testes.
- Checkout, pagamento, Asaas, Split, voucher, QR Code, login do turista, área do cliente, e-mail transacional, cancelamento/reembolso, formulário completo de passageiros.
- **O rate limit por visitante (`X-ToursFlow-Client-Key`) está implementado e testado localmente, mas o NauticFlow só tem a validação correspondente no ambiente local dele — ainda não foi commitado/pushado/deployado nos dois lados.** Por isso o E2E real desta parte específica ainda não foi refeito (o E2E validado acima é anterior a esta mudança).
- Rate limiting próprio da rota `/api/bookings` no ToursFlow (o NauticFlow já tem o dele; ver "Limitações" abaixo).

## Limitações conhecidas (documentadas, não resolvidas nesta etapa)

- **Proteção de origem é best-effort.** `isTrustedOrigin()` em `route.ts` compara o host do header `Origin` (quando o navegador o envia) com o host da própria requisição. Isso não é autenticação nem proteção CSRF completa — é só uma primeira barreira contra POST cross-site óbvio. Não há sessão de usuário nesta etapa para uma proteção mais forte. É uma camada independente do rate limit por `X-ToursFlow-Client-Key` — uma não substitui a outra.
- **Sem rate limit próprio na rota `/api/bookings`.** O rate limit real agora existe (no NauticFlow, via `X-ToursFlow-Client-Key`), mas antes de conectar um botão público vale reavaliar se o ToursFlow também precisa de uma camada própria — com estado compartilhado entre execuções serverless (ex.: Upstash Redis), nunca um limiter em memória, que não protege nada na Vercel porque cada invocação pode rodar numa instância diferente.
- **CAPTCHA:** não implementado, fora de escopo desta etapa.

## Próximo passo (fora desta etapa)

1. Commitar, revisar e deployar a mudança do `X-ToursFlow-Client-Key` nos dois projetos (NauticFlow e ToursFlow) de forma coordenada.
2. Refazer um E2E controlado específico para o rate limit (confirmar que o NauticFlow de fato aplica o limite global e por `X-ToursFlow-Client-Key`, e que um header forjado pelo navegador é ignorado também do lado dele).
3. Decidir se o ToursFlow precisa de uma camada própria de rate limit antes de expor a rota publicamente.
4. Só depois disso: conectar a interface pública.
