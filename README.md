# ToursFlow

Marketplace público de passeios náuticos. Projeto **independente** do NauticFlow: repositório próprio, deploy próprio e domínio próprio (`toursflow.com.br`).

- **NauticFlow**: sistema do operador (embarcações, saídas, reservas, manifesto).
- **ToursFlow**: vitrine do turista (descoberta, comparação, escolha do passeio).

A integração entre os dois acontece depois, pela camada de dados descrita abaixo. Nada neste repositório grava no banco do NauticFlow.

## Stack

Next.js 14 (App Router, Server Components), React 18, TypeScript strict, Tailwind CSS, lucide-react. Mesma base do NauticFlow, para reaproveitar conhecimento e facilitar a integração.

## Rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint
npm run build
```

Variável opcional (`.env.local`):

```
NEXT_PUBLIC_SITE_URL=https://toursflow.com.br
```

Sem ela, o site usa `https://toursflow.com.br` como base de canonical, sitemap e Open Graph.

Documentação técnica completa (rotas, camada de dados, tipos, componentes, SEO): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Auditoria pré-integração com o NauticFlow: [docs/AUDITORIA-PRE-INTEGRACAO.md](docs/AUDITORIA-PRE-INTEGRACAO.md).
Plano de execução da integração com o NauticFlow: [docs/PLANO-INTEGRACAO-NAUTICFLOW.md](docs/PLANO-INTEGRACAO-NAUTICFLOW.md).
Histórico de tudo o que foi feito no projeto: [docs/changelog/CHANGELOG.md](docs/changelog/CHANGELOG.md).

## Estrutura

```
src/
  app/                          rotas (App Router)
    page.tsx                    home
    passeios/page.tsx           listagem com filtros
    passeios/[destino]/         atalho -> redirect para /destinos/[slug]
    passeios/[destino]/[slug]/  página do passeio
    destinos/                   índice e página de destino
    sitemap.ts, robots.ts
  components/
    layout/    Header, Footer
    search/    SearchBar, FilterBar
    tours/     TourCard, TourGrid, TourGallery, TourItinerary, TourChecklist, BoardingLocation
    destinations/ DestinationCard
    categories/   CategoryCard
    ui/        Rating, Price, Section, EmptyState, Breadcrumbs
  data/
    source.ts        contrato ToursDataSource
    repository.ts    ponto único de troca da origem dos dados
    sources/         implementações (hoje só mock)
    mock/            dados temporários (ver README da pasta)
  lib/         format, routes, maps, seo, site
  types/       contratos de domínio
public/img/mock/  imagens de exemplo geradas por script
```

## Trocar MOCK por dados reais

1. Criar `src/data/sources/nauticflow-source.ts` implementando `ToursDataSource` (`src/data/source.ts`) sobre o Supabase do NauticFlow, lendo apenas passeios com status publicado.
2. Em `src/data/repository.ts`, trocar a constante `source`.
3. Apagar `src/data/mock/` e `public/img/mock/`.

Nenhum componente importa mock diretamente, e todas as funções do repositório já são assíncronas: a troca não muda assinatura nem exige refatorar a UI.

Campos que hoje são simulados e dependem do NauticFlow: `rating` (não existe avaliação no sistema ainda), `boardingPoint.latitude/longitude`, `maxPeople`, `priceFrom` e disponibilidade por data.

## Regras de conteúdo já aplicadas no código

- Avaliação só aparece quando existe. Passeio sem avaliação não recebe nota inventada nem "0 estrelas".
- Ponto de embarque funciona sem coordenadas: o botão do mapa cai para busca por endereço.
- O filtro de data é aceito na URL, mas informa ao usuário que a disponibilidade ainda não está conectada, em vez de fingir que filtrou.

## SEO

- URLs: `/passeios`, `/passeios/[destino]/[slug]`, `/destinos/[slug]`.
- `title`, `description`, canonical, Open Graph e Twitter Card por página (`src/lib/seo.ts`).
- JSON-LD `TouristTrip` na página do passeio, com `aggregateRating` apenas quando há avaliações.
- `sitemap.xml` e `robots.txt` gerados a partir da própria camada de dados.
- Páginas com filtro (`/passeios?...`) recebem `noindex, follow` para não competir com as páginas de destino.

## Fora do escopo desta etapa

Pagamento, Asaas, split, checkout, reserva, voucher, QR Code, avaliações, login e área do turista, comissão e repasse financeiro.
