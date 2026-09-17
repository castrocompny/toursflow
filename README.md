# ToursFlow

Marketplace público de passeios náuticos. Projeto **independente** do NauticFlow: repositório próprio, deploy próprio e domínio próprio (`toursflow.com.br`).

- **NauticFlow**: sistema do operador (embarcações, saídas, reservas, manifesto).
- **ToursFlow**: vitrine do turista (descoberta, comparação, escolha do passeio).

O catálogo (passeios, destinos, saídas, disponibilidade e vagas reais — `Departure.availableSpots`) consome a API pública real do NauticFlow em produção, sempre sem cache velho (`listTours`/`getTour`/`listDepartures` são `no-store`). Uma aba já aberta se atualiza sozinha quando um passeio é publicado/despublicado/editado, via `CatalogRefresh` (Supabase Realtime do NauticFlow, só leitura, sem segredo novo — ver [ADR-014](docs/DECISIONS.md#adr-014--atualização-em-tempo-real-do-catálogo-tabela-singleton-de-versão--postgres-changes-não-broadcast)).

O fluxo de reserva (`BookingSelector` → `CustomerForm` → `BookingReview` → `BookingConfirmation`) já está implementado e conectado de verdade a `POST /api/bookings` — mas **atrás da feature flag `BOOKING_CHECKOUT_ENABLED = false`**: enquanto desligada, o botão "Confirmar reserva" não existe na UI e a própria rota recusa qualquer chamada (mesmo manual) antes de tocar no NauticFlow. O checkout Pix (`PixPayment`, `BookingVoucher`, `POST`/`GET /api/bookings/[bookingId]/payment`) também já está implementado e testado de ponta a ponta, atrás de `PAYMENTS_UI_ENABLED = false`, com a mesma trava server-side. Nenhuma das duas flags foi ligada em produção — nenhuma reserva ou cobrança real foi criada pela interface pública até hoje. Ver [docs/PAYMENTS.md](docs/PAYMENTS.md), [docs/RESERVAS-SERVER-TO-SERVER.md](docs/RESERVAS-SERVER-TO-SERVER.md) e ADR-012/ADR-013 em [docs/DECISIONS.md](docs/DECISIONS.md).

Nada neste repositório grava no banco do NauticFlow diretamente; toda escrita passa pela API dele.

## Stack

Next.js 15.5.24 (App Router, Server Components), React 19.2, TypeScript strict, Tailwind CSS, lucide-react, Vitest + `@testing-library/react`. Mesma base do NauticFlow, para reaproveitar conhecimento e facilitar a integração.

## Rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint
npm run test       # vitest run
npm run build
```

Variáveis (`.env.local`, ver [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) para a lista completa):

```
NEXT_PUBLIC_SITE_URL=https://toursflow.com.br
NAUTICFLOW_API_URL=https://nauticflow.com.br
TOURSFLOW_API_SECRET=
```

Sem `NAUTICFLOW_API_URL`, o site usa dados mock locais automaticamente — nenhum setup extra necessário para rodar em dev.

Documentação técnica completa (rotas, camada de dados, tipos, componentes, SEO): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Contrato de price types: [docs/PRICE-TYPES.md](docs/PRICE-TYPES.md).
Segurança: [docs/SECURITY.md](docs/SECURITY.md).
Variáveis de ambiente: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).
Deploy: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Decisões de arquitetura (ADR): [docs/DECISIONS.md](docs/DECISIONS.md).
Auditoria pré-integração com o NauticFlow: [docs/AUDITORIA-PRE-INTEGRACAO.md](docs/AUDITORIA-PRE-INTEGRACAO.md).
Plano de execução da integração com o NauticFlow: [docs/PLANO-INTEGRACAO-NAUTICFLOW.md](docs/PLANO-INTEGRACAO-NAUTICFLOW.md).
Integração de reservas (server-to-server, conectada à interface pública mas atrás de feature flag): [docs/RESERVAS-SERVER-TO-SERVER.md](docs/RESERVAS-SERVER-TO-SERVER.md).
Histórico de tudo o que foi feito no projeto: [docs/changelog/CHANGELOG.md](docs/changelog/CHANGELOG.md).

## Estrutura

Estrutura completa e comentada: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#4-estrutura-de-pastas).

## Fonte de dados: real vs. mock

`src/data/repository.ts` escolhe `nauticflow-source` (real) ou
`mock-source` (fallback) automaticamente pela presença de
`NAUTICFLOW_API_URL` — nenhum componente sabe qual está ativo. Ver
[ADR-001](docs/DECISIONS.md#adr-001--repositório-de-dados-escolhido-por-variável-de-ambiente).

## Regras de conteúdo já aplicadas no código

- Avaliação só aparece quando existe. Passeio sem avaliação não recebe nota inventada nem "0 estrelas".
- Ponto de embarque funciona sem coordenadas: o botão do mapa cai para busca por endereço.
- Destino e categoria filtram de verdade contra a API. Data, quantidade de pessoas e busca por texto livre são aceitos na URL, mas a API pública do NauticFlow ainda não suporta esses filtros — a UI avisa isso ao usuário em vez de fingir que filtrou.
- Vagas disponíveis (`availableSpots`) vêm sempre do NauticFlow — nunca inventadas no cliente; a proteção real contra overbooking continua sendo o `INSUFFICIENT_CAPACITY` do NauticFlow, o teto visual é só conveniência de UI.

## SEO

- URLs: `/passeios`, `/passeios/[destino]/[slug]`, `/destinos/[slug]`.
- `title`, `description`, canonical, Open Graph e Twitter Card por página (`src/lib/seo.ts`).
- JSON-LD `TouristTrip` na página do passeio, com `aggregateRating` apenas quando há avaliações.
- `sitemap.xml` e `robots.txt` gerados a partir da própria camada de dados.
- Páginas com filtro (`/passeios?...`) recebem `noindex, follow` para não competir com as páginas de destino.

## Implementado, mas não liberado ao público (atrás de feature flag)

- **Reserva/hold real** (`BOOKING_CHECKOUT_ENABLED = false`): fluxo completo implementado e testado (313 testes), infraestrutura pronta — falta decisão de negócio para ligar, não trabalho técnico. Nunca houve E2E controlado contra produção (falta mecanismo de cleanup de hold de teste, ver [ADR-009](docs/DECISIONS.md#adr-009--nenhum-e2e-controlado-contra-produção-na-fase-3-sem-mecanismo-de-cleanup)).
- **Checkout Pix** (`PAYMENTS_UI_ENABLED = false`): contrato real confirmado e wiring completo (tipos, rota interna, client server-only e do navegador, UI), testado de forma automatizada — nunca testado com dinheiro real de ponta a ponta.

## Fora do escopo / PLANEJADO — NÃO IMPLEMENTADO

Cartão, split visível ao ToursFlow, webhook de confirmação (recebido só pelo NauticFlow), voucher real, QR Code fora do fluxo Pix já implementado, avaliações, login e área do turista, comissão e repasse financeiro, busca por texto/data/pessoas (depende da API pública do NauticFlow evoluir), rate limit próprio do ToursFlow, Content-Security-Policy, CI de PR.
