# Arquitetura do ToursFlow

Documentação técnica de como o projeto é organizado hoje (atualizado até a
Fase 3 do fluxo de reserva, 2026-08-28). Para visão de produto e passo a
passo de instalação, ver o [README](../README.md). Para o backend de
reservas em detalhe, ver
[RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md); para o
contrato de preço, [PRICE-TYPES.md](PRICE-TYPES.md).

## 1. Visão geral

ToursFlow é a vitrine pública (descoberta, comparação, escolha, seleção de
saída/quantidade, preenchimento e revisão dos dados do comprador e —
a partir da Fase 3 — criação real de reserva/hold) de um marketplace de
passeios náuticos. É a contraparte de turista do **NauticFlow**, sistema
do operador (embarcações, saídas, reservas, manifesto). Os dois são
repositórios, deploys e domínios independentes.

O catálogo (passeios, destinos, categorias, saídas) já consome dados reais
do NauticFlow em produção — o mock só existe como fallback de
desenvolvimento local (ver seção 6). **A partir da Fase 3, o botão
"Confirmar reserva" no step de revisão chama `POST /api/bookings` de
verdade** — o fluxo completo (`BookingSelector`: seleção → `CustomerForm`
→ `BookingReview` → `BookingConfirmation`) cria uma reserva/hold real no
NauticFlow. Este código existe no repositório e passa em todos os testes
(incluindo verificação em browser real até o step de revisão — ver
[RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md)), mas
**ainda não foi commitado/publicado em produção** nesta etapa — decisão
deliberada, porque não existe pagamento ainda (ver seção "NÃO
IMPLEMENTADO" abaixo).

**PLANEJADO / NÃO IMPLEMENTADO ainda:** checkout, pagamento, Asaas, PIX,
cartão, split, webhook de confirmação, voucher, QR Code, avaliações, login
e área do turista, comissão e repasse financeiro. O step de confirmação
(`BookingConfirmation`) deixa isso explícito para o turista ("Pagamento
será disponibilizado na próxima etapa"). **O fluxo Pix tem contrato real confirmado e wiring completo**
(`PixPayment`, `BookingVoucher`, rota interna
`/api/bookings/[bookingId]/payment`, client server-only e do navegador),
mas atrás de uma feature flag travada em `false` — inatingível pela UI
real, zero chamada feita ao NauticFlow. Ver [PAYMENTS.md](PAYMENTS.md).

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14.2.5 (App Router, Server Components) |
| UI | React 18.3, TypeScript strict |
| Estilo | Tailwind CSS 3.4 |
| Ícones | lucide-react |
| Fontes | Bricolage Grotesque (display) + Instrument Sans (corpo), via Google Fonts `<link>` em `layout.tsx` |
| Testes | Vitest (lógica pura, `node`) + `@testing-library/react`/`jsdom` (componentes, por arquivo via `// @vitest-environment jsdom`) |
| Segredo server-only | pacote `server-only` — quebra o build se um módulo marcado for importado por um Client Component |

Sem cliente de banco direto (o NauticFlow é consultado só via HTTP), sem
gerenciador de estado global, sem camada de autenticação de usuário —
páginas de catálogo são Server Components assíncronos; a escrita de
reserva passa por uma única Route Handler server-only.

## 3. Como rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint
npm run test       # vitest run
npm run build
```

Variáveis (`.env.local`, ver `.env.example` e
[ENVIRONMENT.md](ENVIRONMENT.md) para a lista completa):

```
NEXT_PUBLIC_SITE_URL=https://toursflow.com.br
NAUTICFLOW_API_URL=https://nauticflow.com.br
TOURSFLOW_API_SECRET=
```

Sem `NAUTICFLOW_API_URL`, o site usa mock local automaticamente (dev sem
setup extra). Sem `TOURSFLOW_API_SECRET`, `/api/bookings` falha de forma
segura (nunca cria reserva fake).

Para parar um servidor dev em background: `lsof -ti:3000 -sTCP:LISTEN | xargs kill`.

## 4. Estrutura de pastas

```
src/
  app/
    layout.tsx                     fontes, Header, Footer, skip-link, metadata base
    page.tsx                       home
    error.tsx                      boundary de erro (API fora do ar != lista vazia)
    passeios/page.tsx              listagem com filtros e paginação real
    passeios/[destino]/            atalho -> redirect 307 para /destinos/[slug]
    passeios/[destino]/[slug]/     página do passeio (force-dynamic — ver seção 5)
    destinos/, sitemap.ts, robots.ts, not-found.tsx
    api/bookings/route.ts                        cria reserva/hold (server-only)
    api/bookings/[bookingId]/payment/route.ts     cria/consulta pagamento Pix (server-only, inatingível pela UI — PAYMENTS_UI_ENABLED)
  components/
    tours/       TourCard, TourGrid, TourGallery, TourItinerary, TourChecklist,
                  BoardingLocation, BookingSelector, CustomerForm, BookingReview,
                  BookingConfirmation, PixPayment, BookingVoucher (todos 'use client'
                  exceto os de catálogo)
    layout/, search/, destinations/, categories/, ui/, brand/
  data/
    source.ts        contrato ToursDataSource (inclui listDepartures, paginação)
    repository.ts     escolhe nauticflow-source ou mock-source por env var
    sources/
      nauticflow-source.ts   leitura pública real (sem segredo)
      mock-source.ts         fallback só para dev local
    mock/             dados estáticos (usados só pelo mock-source)
    vitrine/          metadados de destino/categoria que o NauticFlow não fornece
                       (tagline, descrição, imagem, ícone) — propriedade do ToursFlow
  lib/
    routes.ts, seo.ts, site.ts, format.ts, maps.ts, feature-flags.ts
    http-guards.ts     Origin/Sec-Fetch-Site, Content-Type, limite real de corpo — compartilhado pelas 2 rotas de escrita
    booking-validation.ts, booking-errors.ts, booking-selection.ts, booking-submission.ts, booking-error-messages.ts
    payment-validation.ts, payment-errors.ts, payment-error-messages.ts, payment-client.ts
    idempotency-key.ts, hold-countdown.ts
    nauticflow-bookings.ts, nauticflow-payments.ts (server-only)   únicos pontos que falam com o NauticFlow para escrever
    client-ip.ts, toursflow-client-key.ts (server-only)   IP confiável + HMAC do rate limit
  types/
    index.ts     contratos de catálogo (Tour, Departure, PriceType, ...)
    booking.ts    contratos de reserva (request/response/erros)
    payment.ts    contrato real de pagamento (request/response/erros) — ver PAYMENTS.md
  test/
    server-only-mock.ts    stub para os testes rodarem fora do bundler do Next
    fake-payment-client.ts  fake em memória de PaymentClient, só para teste/preview
public/
  img/mock/      imagens de exemplo (SVG), só usadas quando o mock está ativo
scripts/
  generate-placeholders.mjs
```

## 5. Rotas (App Router)

| Rota | Tipo | Origem dos dados | Observações |
|---|---|---|---|
| `/` | estática (ISR) | catálogo real (ou mock em dev) | Hero, `SearchBar`, destinos, passeios em destaque, categorias |
| `/passeios` | dinâmica (lê `searchParams`) | `listTours(filters)`, paginado | `destino`/`categoria` filtram de verdade (query param real na API); `data`/`pessoas`/`q` aceitos na URL mas sem suporte na API — avisado ao usuário, nunca escondido |
| `/passeios/[destino]` | redirect | — | 307 para `/destinos/[destino]` |
| `/passeios/[destino]/[slug]` | **dinâmica** (`export const dynamic = 'force-dynamic'`) | `getTour`, `listDepartures` | Sem `generateStaticParams`: a disponibilidade (`listDepartures`, `no-store`) não pode ser pré-renderizada em build — decisão registrada em [DECISIONS.md](DECISIONS.md) |
| `/destinos`, `/destinos/[slug]` | estática (ISR) | `listDestinations`, `listTours` | |
| `/api/bookings` | Route Handler, `POST` only | — | Cria reserva/hold real — chamado por `BookingReview` (`onConfirm`) |
| `/api/bookings/[bookingId]/payment` | Route Handler, `POST`/`GET` | — | Criar/consultar pagamento Pix — server-only; wiring completo mas **inatingível pela UI hoje** (`PAYMENTS_UI_ENABLED === false`, ver [PAYMENTS.md](PAYMENTS.md)) |
| `/sitemap.xml`, `/robots.txt` | gerados | `listDestinations`, `listTourPaths` | |

`src/lib/routes.ts` é a única fonte de verdade para montar URLs de página — nenhum componente concatena string de rota manualmente.

## 6. Camada de dados (catálogo)

### 6.1 Contrato (`src/data/source.ts`)

```ts
interface ToursDataSource {
  readonly name: string;
  listTours(filters?: TourFilters): Promise<TourListResult>; // paginado
  getTour(destinationSlug: string, tourSlug: string): Promise<TourWithRelations | null>;
  listDepartures(tourSlug: string): Promise<Departure[]>;
  listFeaturedTours(limit?: number): Promise<TourWithRelations[]>;
  listDestinations(): Promise<Destination[]>;
  getDestination(slug: string): Promise<Destination | null>;
  listCategories(): Promise<Category[]>;
  listTourPaths(): Promise<Array<{ destino: string; slug: string }>>;
}
```

Erro de infraestrutura (rede, timeout, resposta inválida) é `DataSourceError` — nunca confundido com "não encontrado" (`null`). Ver seção 8.

### 6.2 Repositório (`src/data/repository.ts`)

```ts
const source: ToursDataSource = process.env.NAUTICFLOW_API_URL ? nauticflowSource : mockSource;
```

Escolhido automaticamente pela env var — nenhum componente sabe qual está ativo. Em produção `NAUTICFLOW_API_URL` está sempre configurada; o mock nunca é fallback silencioso ali.

### 6.3 Fonte real (`src/data/sources/nauticflow-source.ts`)

Consome `GET /api/public/tours`, `/tours/[slug]`, `/tours/[slug]/departures`, `/destinations`, `/categories` do NauticFlow (sem autenticação — API pública). Mapeamento defensivo DTO → tipos internos, incluindo `mapPriceType()` (ver [PRICE-TYPES.md](PRICE-TYPES.md)) e enriquecimento de destino/categoria com os metadados de vitrine (`src/data/vitrine/`) que a API não fornece.

**Cache:** conteúdo (tours, destinos, categorias, detalhe) usa `next: { revalidate: 300 }` (ISR, 5 min). Disponibilidade (`listDepartures`) usa `cache: 'no-store'` — sempre fresca. Sem revalidação sob demanda (`revalidateTag`) ainda — publicar/despublicar um passeio no NauticFlow pode levar até 5 min para refletir no catálogo, mas uma tentativa de reserva sempre revalida no NauticFlow (nunca reserva um passeio já suspenso).

### 6.4 Mock (`src/data/sources/mock-source.ts` + `src/data/mock/`)

Só ativo em dev local sem `NAUTICFLOW_API_URL`. Filtra por `status === 'published'`, resolve relações em memória, gera saídas sintéticas para `listDepartures`. Nunca usado em produção.

## 7. Tipos de domínio

- `src/types/index.ts`: `Tour`, `TourWithRelations`, `Departure` (saída real — id, data/hora, preço, `priceType`, `soldOut`), `PriceType` (4 valores, ver [PRICE-TYPES.md](PRICE-TYPES.md)), `Operator`, `Destination`, `Category`, `BoardingPoint`, `TourListResult` (paginação).
- `src/types/booking.ts`: contratos de reserva — `BookingRequestInput`, `NauticFlowBookingResponseData`, `BookingErrorCode` (deliberadamente separado dos tipos de catálogo, ver [DECISIONS.md](DECISIONS.md)).
- `rating?`, `boardingPoint.latitude/longitude?`, `Operator.slug/state/verified?` são opcionais de propósito: a API real não garante esses campos, e a UI nunca inventa valor pra eles.

## 8. Componentes

| Pasta | Componentes | Responsabilidade |
|---|---|---|
| `tours/` | `TourCard`, `TourGrid`, `TourGallery`, `TourItinerary`, `TourChecklist`, `BoardingLocation`, **`BookingSelector`**, **`CustomerForm`**, **`BookingReview`**, **`BookingConfirmation`**, **`PixPayment`**, **`BookingVoucher`** | `BookingSelector` (`'use client'`) orquestra até 6 steps: seleção → `CustomerForm` → `BookingReview` (chama `POST /api/bookings` de verdade) → `BookingConfirmation` (hold, countdown, preço real) → `PixPayment`/`BookingVoucher` (wiring real contra `/api/bookings/[bookingId]/payment`, atrás de `PAYMENTS_UI_ENABLED === false` — inatingíveis pela UI real hoje). Ver [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md) e [PAYMENTS.md](PAYMENTS.md) |
| `layout/`, `search/`, `destinations/`, `categories/`, `ui/`, `brand/` | — | Inalterados desde a fase de catálogo |

9 Client Components no projeto: `SearchBar`, `FilterBar`, `TourGallery`, `BookingSelector`, `CustomerForm`, `BookingReview`, `BookingConfirmation`, `PixPayment`, `BookingVoucher` — todo o resto é Server Component.

## 9. Camada de reservas (server-only) — conectada na Fase 3

Resumo — detalhe completo em [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md):

```
navegador -> POST /api/bookings (ToursFlow) -> POST /api/marketplace/bookings (NauticFlow)
```

`src/lib/nauticflow-bookings.ts` é o único módulo que lê `TOURSFLOW_API_SECRET`; `src/lib/client-ip.ts`/`toursflow-client-key.ts` calculam a identidade pseudônima do rate limit (HMAC do IP, nunca o IP em claro). Todos marcados `import 'server-only'`. Whitelist explícita do payload em `booking-validation.ts` — nunca repassa campo além de `departureId`/`quantity`/`customer.{name,email,phone,cpf}`. Hardening da Fase 2: Content-Type restrito, limite de corpo real (bytes recebidos, não só `Content-Length`), Origin reforçado com `Sec-Fetch-Site` (ver [SECURITY.md](SECURITY.md)).

**Fase 3 — lado do navegador (`src/lib/booking-submission.ts`):** `buildBookingPayload()` monta o payload por whitelist (nunca `price`/`total`/`priceType`/`companyId`/`operatorId`/`status`/`clientKey`) e normaliza `phone`/`cpf` para só dígitos antes de enviar (a máscara visual nunca é o que vai no `fetch`). `submitBooking()` é o único ponto do navegador que chama `/api/bookings` — trata 201, 200 (replay, tratado como sucesso da mesma reserva), todo `BookingErrorCode` conhecido, e falha de rede (`NETWORK_ERROR`, quando o `fetch` rejeita sem resposta — nunca assumido como "reserva não criada", já que o servidor pode ter processado antes da conexão cair).

`src/lib/idempotency-key.ts`: `resolveIdempotencyKey()` decide reaproveitar ou regenerar a key a cada envio do formulário do comprador — mesmo fingerprint (retry/re-render) reaproveita, fingerprint diferente regenera. Depois de um sucesso definitivo, ou de um erro `IDEMPOTENCY_CONFLICT`, `BookingSelector` reseta o estado para forçar key nova na próxima tentativa. `src/lib/booking-error-messages.ts` mapeia cada `BookingErrorCode` (+ `NETWORK_ERROR`, código só do cliente) para uma mensagem segura em português — única fonte usada pela UI.

**Double-submit:** `BookingSelector` usa um `useRef` síncrono (`isSubmittingRef`) além do state `submissionStatus`, e o botão fica desabilitado enquanto `submitting` — clique duplo nunca dispara uma segunda chamada (testado).

**Hold e countdown (`src/lib/hold-countdown.ts` + `BookingConfirmation`):** o timer é sempre derivado de `holdExpiresAt` (timestamp do NauticFlow) menos `Date.now()`, recalculado a cada segundo — nunca uma contagem fixa de 15:00 assumida no cliente. Ao chegar a zero, mostra "O tempo da sua reserva expirou." em vez de fingir que a vaga continua garantida.

**`INSUFFICIENT_CAPACITY`:** além de mostrar a mensagem específica, `BookingSelector` chama `router.refresh()` (`next/navigation`) para que o Server Component da página busque `listDepartures` de novo (`cache: 'no-store'`) — sem precisar de um novo endpoint. O turista decide, ao voltar para a seleção, com dado fresco; nada é auto-selecionado.

## 10. Regras de conteúdo já aplicadas

- **Avaliação só aparece quando existe.**
- **Ponto de embarque funciona sem coordenadas** (cai para busca por endereço).
- **Filtro de data/pessoas/busca é honesto** — aceito na URL, avisa que não filtra em vez de fingir.
- **`/passeios/[destino]` não compete com `/destinos/[slug]`** no índice de busca.
- **Preço nunca vem do cliente como autoridade** — o total mostrado na seleção é só estimativa visual; o NauticFlow recalcula tudo na reserva real.
- **Tipo de preço não vendável nunca chega a "Continuar"** — ver [PRICE-TYPES.md](PRICE-TYPES.md).

## 11. SEO

- `pageMetadata()` (`src/lib/seo.ts`) centraliza title/description/canonical/OG/Twitter.
- JSON-LD `TouristTrip` na página do passeio, `aggregateRating` só quando existe.
- `sitemap.xml`/`robots.txt` gerados da própria camada de dados.
- `/passeios?...` com filtro recebe `noindex, follow`.

## 12. Design tokens (Tailwind)

Inalterado desde a fase de catálogo — `tailwind.config.ts`: cores `ink`/`sea`/`foam`/`sand`/`sun`, `font-display`/`font-sans`, `rounded-card` (20px), `shadow-card`/`shadow-lift`, `max-w-shell` (1240px).

## 13. Imagens e headers HTTP

`next.config.mjs` libera **só** o host específico do Storage do NauticFlow (`gggpihphjjxndpfntnvm.supabase.co`, path `/storage/v1/object/**`) — nunca wildcard. Fallback visual (`ImageOff`) em `TourCard`/`TourGallery` quando não há foto. O mesmo arquivo define `headers()` para todas as rotas com um conjunto de headers de segurança de baixo risco (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`) — detalhe e o que fica de fora (CSP) em [SECURITY.md](SECURITY.md#10-headers-de-segurança-de-resposta-novo-fase-2).

## 14. Testes

Ver seção "Testes" em [SECURITY.md](SECURITY.md#testes-de-segurança-relevantes) para os testes com foco em segurança. Cobertura geral: validação/whitelist/erros do backend de reserva, IP/HMAC, mapeamento de price type, fluxo completo de reserva (componente, via `@testing-library/react`), validação/máscara/checksum de CPF, Idempotency-Key, submissão real (`booking-submission.ts`), countdown de hold, wiring completo do fluxo Pix (rota `/api/bookings/[bookingId]/payment`, `ToursFlowPaymentClient`, `PixPayment`/`BookingVoucher` — ver [PAYMENTS.md](PAYMENTS.md)). `npm test` roda tudo — 273 testes.

**Achado corrigido nesta fase (Fase 3):** `vitest.config.ts` incluía só `src/**/*.test.ts` — nunca `*.test.tsx`. Isso significa que **todo componente React testado com `@testing-library/react`
(`BookingSelector.test.tsx` desde a Fase 1) nunca rodou de fato via `npm test`** em nenhuma fase anterior, apesar de relatórios anteriores terem reportado "todos os testes passando" — o comando saía com sucesso porque simplesmente não encontrava esses arquivos, não porque eles passavam. Corrigido para `src/**/*.test.{ts,tsx}` (mais `oxc: { jsx: { runtime: 'automatic' } }`, necessário para o parser da Vite 8/rolldown reconhecer JSX em teste). Ao rodar de verdade pela primeira vez, 3 bugs reais (e até então invisíveis) apareceram nos próprios testes — nenhum no código de produção — e foram corrigidos: duas queries ambíguas (`getByLabelText`/`getByText` casando mais de um elemento) e uma máscara de e-mail com contagem de asteriscos errada na asserção. Detalhe completo: [SECURITY.md](SECURITY.md#testes-de-segurança-relevantes).

**Segundo achado do mesmo tipo (2026-09-02):** um fixture de teste
(`holdExpiresAt: '2026-09-01T12:15:00Z'`, hardcoded) em
`BookingSelector.test.tsx` "expirou sozinho" quando o relógio real do
sistema avançou além dessa data, fazendo 6 testes falharem por um motivo
sem relação com a mudança sendo feita naquele momento. Corrigido para uma
data sempre calculada a partir de `Date.now()` no momento do teste, nunca
uma data absoluta fixa — lição registrada para não repetir em fixtures
futuros que dependem de "no futuro"/"no passado".
