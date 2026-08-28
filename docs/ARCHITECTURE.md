# Arquitetura do ToursFlow

Documentação técnica de como o projeto é organizado hoje (atualizado até a
Fase 2 do fluxo de reserva, 2026-08-28). Para visão de produto e passo a
passo de instalação, ver o [README](../README.md). Para o backend de
reservas em detalhe, ver
[RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md); para o
contrato de preço, [PRICE-TYPES.md](PRICE-TYPES.md).

## 1. Visão geral

ToursFlow é a vitrine pública (descoberta, comparação, escolha, seleção de
saída/quantidade e — a partir da Fase 2 — preenchimento e revisão dos
dados do comprador) de um marketplace de passeios náuticos. É a
contraparte de turista do **NauticFlow**, sistema do operador
(embarcações, saídas, reservas, manifesto). Os dois são repositórios,
deploys e domínios independentes.

O catálogo (passeios, destinos, categorias, saídas) já consome dados reais
do NauticFlow em produção — o mock só existe como fallback de
desenvolvimento local (ver seção 6). Existe também um backend de criação
de reserva (`POST /api/bookings` → NauticFlow), testado e validado em E2E
real, mas **ainda não conectado a nenhum botão da interface pública** — o
fluxo em `BookingSelector` (seleção → `CustomerForm` → `BookingReview`)
termina numa tela de revisão, não numa reserva de verdade. Nenhum `fetch`
acontece em nenhum step.

**PLANEJADO / NÃO IMPLEMENTADO ainda:** conexão do formulário à
`POST /api/bookings`, checkout, pagamento, Asaas, split, webhook de
confirmação, voucher, QR Code, avaliações, login e área do turista,
comissão e repasse financeiro.

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
    api/bookings/route.ts          único endpoint de escrita (server-only)
  components/
    tours/       TourCard, TourGrid, TourGallery, TourItinerary, TourChecklist,
                  BoardingLocation, BookingSelector (seleção de reserva, 'use client')
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
    routes.ts, seo.ts, site.ts, format.ts, maps.ts
    booking-validation.ts, booking-errors.ts, booking-selection.ts
    nauticflow-bookings.ts (server-only)   único ponto que fala com o NauticFlow para escrever
    client-ip.ts, toursflow-client-key.ts (server-only)   IP confiável + HMAC do rate limit
  types/
    index.ts     contratos de catálogo (Tour, Departure, PriceType, ...)
    booking.ts    contratos de reserva (request/response/erros)
  test/
    server-only-mock.ts   stub para os testes rodarem fora do bundler do Next
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
| `/api/bookings` | Route Handler, `POST` only | — | Único endpoint de escrita; server-only; **não chamado por nenhuma UI ainda** |
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
| `tours/` | `TourCard`, `TourGrid`, `TourGallery`, `TourItinerary`, `TourChecklist`, `BoardingLocation`, **`BookingSelector`**, **`CustomerForm`**, **`BookingReview`** | `BookingSelector` (`'use client'`) orquestra 3 steps: seleção (saída → quantidade → total estimado) → `CustomerForm` (dados do comprador, validado por `src/lib/customer-form.ts`) → `BookingReview` (resumo com e-mail/telefone/CPF mascarados). Nenhum dos 3 steps chama `/api/bookings` ainda — ver [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md) |
| `layout/`, `search/`, `destinations/`, `categories/`, `ui/`, `brand/` | — | Inalterados desde a fase de catálogo |

6 Client Components no projeto: `SearchBar`, `FilterBar`, `TourGallery`, `BookingSelector`, `CustomerForm`, `BookingReview` — todo o resto é Server Component.

## 9. Camada de reservas (server-only)

Resumo — detalhe completo em [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md):

```
navegador -> POST /api/bookings (ToursFlow) -> POST /api/marketplace/bookings (NauticFlow)
```

`src/lib/nauticflow-bookings.ts` é o único módulo que lê `TOURSFLOW_API_SECRET`; `src/lib/client-ip.ts`/`toursflow-client-key.ts` calculam a identidade pseudônima do rate limit (HMAC do IP, nunca o IP em claro). Todos marcados `import 'server-only'`. Whitelist explícita do payload em `booking-validation.ts` — nunca repassa campo além de `departureId`/`quantity`/`customer.{name,email,phone,cpf}`. Hardening da Fase 2: Content-Type restrito, limite de corpo, Origin reforçado com `Sec-Fetch-Site` (ver [SECURITY.md](SECURITY.md)).

Do lado do navegador, `src/lib/idempotency-key.ts` gera e mantém uma `Idempotency-Key` (`crypto.randomUUID()`) por tentativa lógica de reserva — regenerada só quando `departureId`/`quantity`/dados do comprador mudam — mas **nunca a envia**: nenhum `fetch` acontece antes da Fase 3. `src/lib/booking-error-messages.ts` já mapeia cada `BookingErrorCode` para uma mensagem segura em português, pronta para a Fase 3, também não usada ainda.

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

Ver seção "Testes" em [SECURITY.md](SECURITY.md#testes-de-segurança-relevantes) para os testes com foco em segurança. Cobertura geral: validação/whitelist/erros do backend de reserva, IP/HMAC, mapeamento de price type, seleção de reserva e formulário do comprador (componente, via `@testing-library/react`), validação/máscara/checksum de CPF, Idempotency-Key. `npm test` roda tudo — 145 testes.
