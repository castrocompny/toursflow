# Arquitetura do ToursFlow

Documentação técnica de como o projeto é organizado hoje. Para visão de
produto e passo a passo de instalação, ver o [README](../README.md).

## 1. Visão geral

ToursFlow é a vitrine pública (descoberta, comparação, escolha) de um
marketplace de passeios náuticos. É a contraparte de turista do
**NauticFlow**, sistema do operador (embarcações, saídas, reservas,
manifesto). Os dois são repositórios, deploys e domínios independentes.

Hoje o projeto roda inteiramente sobre dados mockados em memória. Nenhuma
página, componente ou rota conhece essa origem: tudo passa por um contrato
de dados único (`src/data/source.ts`), o que torna a troca por dados reais
do NauticFlow uma mudança de um arquivo, sem tocar em UI. Ver seção 7.

Fora do escopo atual: pagamento, Asaas, split, checkout, reserva, voucher,
QR Code, avaliações, login e área do turista, comissão e repasse
financeiro.

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14.2.5 (App Router, Server Components) |
| UI | React 18.3, TypeScript strict |
| Estilo | Tailwind CSS 3.4 |
| Ícones | lucide-react |
| Fontes | Bricolage Grotesque (display) + Instrument Sans (corpo), via Google Fonts `<link>` em `layout.tsx` |

Sem cliente de banco, sem gerenciador de estado global, sem camada de
autenticação — todas as páginas são Server Components assíncronos que
buscam dados diretamente do repositório de dados no servidor.

## 3. Como rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint
npm run build
```

Variável opcional (`.env.local`, ver `.env.example`):

```
NEXT_PUBLIC_SITE_URL=https://toursflow.com.br
```

Sem ela, `src/lib/site.ts` usa `https://toursflow.com.br` como base de
canonical, sitemap e Open Graph.

Para parar um servidor dev em background: `lsof -ti:3000 -sTCP:LISTEN | xargs kill`.

## 4. Estrutura de pastas

```
src/
  app/                          rotas (App Router)
    layout.tsx                  layout raiz: fontes, Header, Footer, skip-link, metadata base
    page.tsx                    home
    passeios/page.tsx           listagem com filtros (?destino, ?categoria, ?data, ?pessoas, ?q)
    passeios/[destino]/         atalho -> redirect 307 para /destinos/[slug]
    passeios/[destino]/[slug]/  página do passeio (rota canônica do produto)
    destinos/page.tsx           índice de destinos
    destinos/[slug]/page.tsx    página de destino (hero + lista de passeios)
    sitemap.ts, robots.ts       gerados a partir da camada de dados
    not-found.tsx
    icon.svg
  components/
    layout/       Header, Footer
    search/       SearchBar (hero/destino), FilterBar (listagem, usa useSearchParams)
    tours/        TourCard, TourGrid, TourGallery, TourItinerary, TourChecklist, BoardingLocation
    destinations/ DestinationCard
    categories/   CategoryCard
    ui/           Rating, Price, Section, EmptyState, Breadcrumbs
    brand/        Logo
  data/
    source.ts         contrato ToursDataSource (interface)
    repository.ts      ponto único de seleção da implementação ativa
    sources/           implementações do contrato (hoje só mock-source.ts)
    mock/               dados estáticos em memória (tours, operators, destinations, categories)
  lib/
    routes.ts    fonte única das URLs públicas
    seo.ts       pageMetadata(): canonical + Open Graph + Twitter Card padronizados
    site.ts      nome, domínio, URL base, tagline, description
    format.ts    formatação (duração, preço, etc.)
    maps.ts      geração de link de mapa (coordenadas ou busca por endereço)
  types/
    index.ts     contratos de domínio (Tour, Operator, Destination, Category, ...)
public/
  img/mock/      imagens de exemplo (SVG) geradas por scripts/generate-placeholders.mjs
  brand/         logo em SVG (mark, lockup, mono, light)
scripts/
  generate-placeholders.mjs   gera os SVGs de mock em public/img/mock/
```

## 5. Rotas (App Router)

| Rota | Tipo | Origem dos dados | Observações |
|---|---|---|---|
| `/` | estática (SSG no build) | `listDestinations`, `listCategories`, `listFeaturedTours(6)`, `listTours` | Hero com `SearchBar`, destinos, passeios em destaque, categorias, CTA para operadores |
| `/passeios` | dinâmica (lê `searchParams`) | `listTours(filters)` | Filtros via querystring: `destino`, `categoria`, `data`, `pessoas`, `q`. Com qualquer filtro ativo, `generateMetadata` retorna `robots: { index: false, follow: true }` para não competir com `/destinos/[slug]` no índice de busca. `data` é aceito na URL mas ainda não filtra — a página avisa o usuário em vez de fingir que filtrou |
| `/passeios/[destino]` | redirect | — | 307 para `/destinos/[destino]`. Existe só para não quebrar links antigos/externos; não é a rota canônica |
| `/passeios/[destino]/[slug]` | estática (`generateStaticParams` via `listTourPaths`) | `getTour(destino, slug)` | Página de produto: galeria, roteiro, checklist, local de embarque, política de cancelamento, JSON-LD `TouristTrip`, passeios relacionados do mesmo destino |
| `/destinos` | estática | `listDestinations`, `listTours` | Grid de destinos com contagem de passeios |
| `/destinos/[slug]` | estática (`generateStaticParams`) | `getDestination(slug)`, `listTours({ destination })` | Hero com imagem do destino + `SearchBar` pré-preenchida + grid de passeios; `notFound()` se o slug não existe |
| `/sitemap.xml` | gerado (`app/sitemap.ts`) | `listDestinations`, `listTourPaths` | Inclui home, `/passeios`, `/destinos`, cada destino e cada passeio |
| `/robots.txt` | gerado (`app/robots.ts`) | — | |

`src/lib/routes.ts` é a única fonte de verdade para montar essas URLs — nenhum componente concatena string de rota manualmente.

## 6. Camada de dados

### 6.1 Contrato (`src/data/source.ts`)

```ts
interface ToursDataSource {
  readonly name: string;
  listTours(filters?: TourFilters): Promise<TourWithRelations[]>;
  getTour(destinationSlug: string, tourSlug: string): Promise<TourWithRelations | null>;
  listFeaturedTours(limit?: number): Promise<TourWithRelations[]>;
  listDestinations(): Promise<Destination[]>;
  getDestination(slug: string): Promise<Destination | null>;
  listCategories(): Promise<Category[]>;
  listTourPaths(): Promise<Array<{ destino: string; slug: string }>>;
}
```

Todas as funções são assíncronas mesmo sendo mock — é isso que garante que
trocar por chamadas de rede reais não muda a assinatura nem exige
refatorar componentes.

### 6.2 Repositório (`src/data/repository.ts`)

Único ponto que escolhe qual implementação está ativa:

```ts
const source: ToursDataSource = mockSource;
```

Todas as páginas importam funções daqui (`listTours`, `getTour`, etc.),
nunca de `sources/mock-source.ts` diretamente.

### 6.3 Mock (`src/data/sources/mock-source.ts` + `src/data/mock/`)

- Filtra sempre por `status === 'published'` antes de expor qualquer passeio.
- Resolve relações em memória: junta `Tour` com `Operator`, `Destination` e
  `Category[]` para produzir `TourWithRelations`.
- `listFeaturedTours` ordena por `rating.count` desc (passeios sem
  avaliação ficam no fim).
- `matches()` implementa os filtros de `listTours`: destino, categoria,
  capacidade mínima (`people` vs `maxPeople`) e busca textual em
  nome/resumo/destino/operador. **O filtro de `date` é intencionalmente
  ignorado aqui** — não existe conceito de saída/agenda no mock.

### 6.4 Campos simulados que dependem do NauticFlow

`rating`, `boardingPoint.latitude/longitude`, `maxPeople`, `priceFrom` e
disponibilidade por data. Ao integrar, esses campos passam a vir do
Supabase do NauticFlow em vez de serem fixos no mock.

## 7. Trocar mock por dados reais

1. Criar `src/data/sources/nauticflow-source.ts` implementando
   `ToursDataSource` sobre o Supabase do NauticFlow, lendo apenas passeios
   com status publicado.
2. Em `src/data/repository.ts`, trocar a constante `source` (por exemplo,
   selecionando por `process.env.DATA_SOURCE`).
3. Apagar `src/data/mock/` e `public/img/mock/`.

Nenhum componente importa mock diretamente e todas as funções do
repositório já são assíncronas — a troca não exige refatorar a UI.

## 8. Tipos de domínio (`src/types/index.ts`)

- `Tour` — entidade crua (referencia `destinationSlug`, `operatorId`,
  `categorySlugs` por slug/id, não por objeto).
- `TourWithRelations` — `Tour` + `operator`, `destination`, `categories`
  já resolvidos; é o formato que toda a UI consome.
- `Operator`, `Destination`, `Category`, `BoardingPoint`, `TourRating`,
  `ItineraryStop`, `TourImage`, `TourFilters`.
- `rating?: TourRating` é opcional de propósito: passeio sem avaliação não
  recebe nota inventada nem "0 estrelas" (ver seção 10).
- `BoardingPoint.latitude/longitude` são opcionais: sem coordenadas, o
  botão de mapa (`src/lib/maps.ts`) cai para busca por endereço.

## 9. Componentes

| Pasta | Componentes | Responsabilidade |
|---|---|---|
| `layout/` | `Header`, `Footer` | Navegação global; `Footer` recebe a lista de destinos para montar os links "Passeios em X" |
| `search/` | `SearchBar`, `FilterBar` | `SearchBar`: destino + data + pessoas, usado na home e no hero de destino. `FilterBar`: filtros da listagem `/passeios`, lê/escreve `useSearchParams` |
| `tours/` | `TourCard`, `TourGrid`, `TourGallery`, `TourItinerary`, `TourChecklist`, `BoardingLocation` | Card e grid de passeio; galeria de imagens; timeline do roteiro; lista "incluído/não incluído"; bloco de local de embarque com CTA de mapa |
| `destinations/` | `DestinationCard` | Card de destino com contagem de passeios (`tourCount` opcional) |
| `categories/` | `CategoryCard` | Card de categoria (ícone + nome + descrição) |
| `ui/` | `Rating`, `Price`, `Section`, `EmptyState`, `Breadcrumbs` | Primitivas reutilizadas: nota (só renderiza se `rating` existir), preço formatado por `PriceType`, wrapper de seção com eyebrow/título/CTA, estado vazio, breadcrumb |
| `brand/` | `Logo` | Logo em SVG inline (mark/lockup) |

## 10. Regras de conteúdo já aplicadas

- **Avaliação só aparece quando existe.** `Rating` não renderiza nada
  (nem "sem avaliações") quando `tour.rating` é `undefined` — nunca inventa
  nota.
- **Ponto de embarque funciona sem coordenadas.** Quando
  `latitude`/`longitude` estão ausentes, o CTA de mapa (`src/lib/maps.ts`)
  cai para busca por endereço em vez de quebrar ou esconder o botão.
- **Filtro de data é honesto.** `/passeios?data=...` é aceito e refletido
  na UI, mas como o mock não modela agenda/saídas, a página exibe um aviso
  explícito de que a disponibilidade por data ainda não está conectada —
  em vez de aplicar um filtro que pareceria funcionar e não funciona.
- **`/passeios/[destino]` não compete com `/destinos/[slug]`.** É um
  redirect puro; a página indexável e canônica para "passeios em X" é
  `/destinos/[slug]`.

## 11. SEO

- `pageMetadata()` (`src/lib/seo.ts`) centraliza `title`, `description`,
  `alternates.canonical`, Open Graph e Twitter Card — toda página chama
  essa função em vez de montar `Metadata` na mão.
- JSON-LD `TouristTrip` injetado na página do passeio
  (`src/app/passeios/[destino]/[slug]/page.tsx`), com `aggregateRating`
  presente apenas quando `tour.rating` existe.
- `sitemap.xml` e `robots.txt` são gerados a partir da própria camada de
  dados (`listDestinations`, `listTourPaths`), não de uma lista mantida à
  mão.
- Páginas de listagem com filtro (`/passeios?...`) recebem
  `robots: { index: false, follow: true }` para não diluir a autoridade
  das páginas de destino no índice de busca.

## 12. Design tokens (Tailwind)

Definidos em `tailwind.config.ts`, sem plugins externos:

- Cores: `ink` (texto/fundo escuro), `sea` (marca, com `dark`/`light`),
  `foam`, `sand`, `sun` (destaque/CTA, com `dark`).
- Fontes: `font-display` (Bricolage Grotesque) e `font-sans` (Instrument
  Sans), carregadas via CSS variables setadas no `<link>` de Google Fonts
  em `layout.tsx`.
- `rounded-card` (20px), `shadow-card` / `shadow-lift`, `max-w-shell`
  (1240px, usado pela classe utilitária `.shell`).

## 13. Imagens

`next.config.mjs` não libera nenhum host remoto (`remotePatterns: []`) —
hoje todas as imagens (`public/img/mock/`) são SVGs locais gerados por
`scripts/generate-placeholders.mjs`. Ao integrar o Storage do
NauticFlow/Supabase, o host correspondente precisa ser adicionado em
`remotePatterns` antes de qualquer `<Image src>` remoto funcionar.
