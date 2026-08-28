# ToursFlow

Marketplace público de passeios náuticos. Projeto **independente** do NauticFlow: repositório próprio, deploy próprio e domínio próprio (`toursflow.com.br`).

- **NauticFlow**: sistema do operador (embarcações, saídas, reservas, manifesto).
- **ToursFlow**: vitrine do turista (descoberta, comparação, escolha do passeio).

O catálogo (passeios, destinos, saídas) já consome a API pública real do NauticFlow em produção. A escrita de reserva (`POST /api/bookings`) também já existe e foi validada em E2E real contra produção — mas ainda não está conectada a nenhum botão da interface pública. Nada neste repositório grava no banco do NauticFlow diretamente; toda escrita passa pela API dele.

## Stack

Next.js 14.2.5 (App Router, Server Components), React 18, TypeScript strict, Tailwind CSS, lucide-react, Vitest + `@testing-library/react`. Mesma base do NauticFlow, para reaproveitar conhecimento e facilitar a integração.

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
Integração de reservas (server-to-server, ainda não conectada à interface pública): [docs/RESERVAS-SERVER-TO-SERVER.md](docs/RESERVAS-SERVER-TO-SERVER.md).
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
- O filtro de data é aceito na URL, mas informa ao usuário que a disponibilidade ainda não está conectada, em vez de fingir que filtrou.

## SEO

- URLs: `/passeios`, `/passeios/[destino]/[slug]`, `/destinos/[slug]`.
- `title`, `description`, canonical, Open Graph e Twitter Card por página (`src/lib/seo.ts`).
- JSON-LD `TouristTrip` na página do passeio, com `aggregateRating` apenas quando há avaliações.
- `sitemap.xml` e `robots.txt` gerados a partir da própria camada de dados.
- Páginas com filtro (`/passeios?...`) recebem `noindex, follow` para não competir com as páginas de destino.

## Fora do escopo / PLANEJADO — NÃO IMPLEMENTADO

Conexão da UI de seleção de reserva (`BookingSelector`) a `/api/bookings`, formulário de dados do comprador, checkout, pagamento, Asaas, split, webhook de confirmação, voucher, QR Code, avaliações, login e área do turista, comissão e repasse financeiro.
