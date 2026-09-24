# Arquitetura e Camada de Dados

## Stack confirmada em código (`package.json`, lido em 24/09/2026)

- Next.js `15.5.24` (App Router), React `19.2.8`, TypeScript estrito,
  Tailwind CSS `^3.4.7`, Vitest `^4.1.11` + `@testing-library/react ^16.3.3`.
- Este é o resultado da Fase 3 da auditoria de segurança de 04/09/2026
  (upgrade a partir do Next 14, ver [[Segurança]]) — confirmado batendo
  com `docs/AUDITORIA-SEGURANCA-FASE1.md`, sem divergência.

## Estrutura de rotas (`src/app`, inventário direto)

```
/                                → src/app/page.tsx
/passeios                        → src/app/passeios/page.tsx (+ loading.tsx)
/passeios/[destino]              → src/app/passeios/[destino]/page.tsx
/passeios/[destino]/[slug]       → src/app/passeios/[destino]/[slug]/page.tsx (+ loading.tsx)
/destinos                        → src/app/destinos/page.tsx
/destinos/[slug]                 → src/app/destinos/[slug]/page.tsx
/api/bookings                    → src/app/api/bookings/route.ts
/api/bookings/[bookingId]/payment → src/app/api/bookings/[bookingId]/payment/route.ts
sitemap.xml, robots.txt          → src/app/sitemap.ts, src/app/robots.ts
```

Sem rota `/operadores/[slug]` — item que a auditoria de 25/08/2026 listou como
🟠 importante mas não obrigatório, e que segue não implementado.
Sem rotas `/termos`/`/privacidade`.

## Camada de dados: mock vs. NauticFlow

`src/data/repository.ts` escolhe entre `sources/nauticflow-source.ts` (real)
e `sources/mock-source.ts` (fallback só de desenvolvimento) unicamente pela
presença da env var `NAUTICFLOW_API_URL` (ADR-001). Nenhum componente
conhece a origem dos dados — todos consomem só os tipos de
`src/types/index.ts`.

## Tipos centrais (`src/types/index.ts`, confirmado em código)

- `PriceType = 'per_person' | 'per_group' | 'per_boat' | 'starting_from'`
  — ver [[Reservas e Pagamentos (Pix)]] para o contrato completo de
  vendabilidade.
- `Operator`: `slug`, `state`, `verified`, `logoUrl`, `description` são
  todos **opcionais de propósito** — comentário no próprio código explica
  que a API pública do NauticFlow ainda não expõe esses campos por
  operador, só nome e cidade (que também pode vir `null`). **Nunca
  inventar esses dados quando a API não manda** — regra explícita no
  código, não só na documentação.
- `BoardingPoint`: `latitude`/`longitude` opcionais — ausentes, o mapa
  (`src/lib/maps.ts`) cai para busca por endereço.

## Estratégia de cache

- `listTours()`, `getTour()`, `listFeaturedTours()`: `cache: 'no-store'`
  (ADR-014, substitui a estratégia original de ISR documentada na
  ADR-002 — ADR-002 está formalmente superada, não é o comportamento
  atual).
- `listDestinations()`, `listCategories()` (taxonomia, muda raramente):
  `next: { revalidate: 300 }`.

## Realtime: `CatalogRefresh`

Componente cliente montado globalmente em `src/app/layout.tsx:52`.
Assina Supabase **Postgres Changes** (não Broadcast) na tabela singleton
`public.marketplace_catalog_state` do NauticFlow (colunas
`id`/`version`/`updated_at` apenas, RLS `for select to anon, authenticated
using (true)`). Ao detectar mudança, chama `router.refresh()` com debounce
de 400ms. Depende de `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL` e
`NEXT_PUBLIC_NAUTICFLOW_SUPABASE_ANON_KEY`; configuração real dessas vars
na Vercel Produção é **NÃO CONFIRMADO** (ver [[Estado Atual do Produto]]).
Ausência delas não quebra o site — só desativa o auto-refresh.

## Testes de infraestrutura de teste (bugs históricos relevantes)

Dois bugs de configuração de teste, documentados em `ARCHITECTURE.md` e
`SECURITY.md`, valem registrar porque já mascararam regressões reais no
passado:

1. `vitest.config.ts` originalmente excluía todos os arquivos `.tsx` de
   teste silenciosamente — testes de componente como
   `BookingSelector.test.tsx` nunca rodavam de fato, apesar de relatórios
   anteriores de "tudo verde". Corrigido para
   `src/**/*.test.{ts,tsx}` + `oxc.jsx.runtime: 'automatic'`.
2. Uma fixture `holdExpiresAt` com data fixa no passado "expirava"
   naturalmente com o tempo real, quebrando 6 testes não relacionados.
   Corrigido para ser calculada em relação a `Date.now()`.

Nenhum dos dois é um problema atual — ambos estão fixados — mas explicam
por que "testes passando" sozinho não bastava como evidência no passado
deste projeto, e por que esta memória prioriza leitura direta do código
sobre confiar cegamente em relatos de "tudo verde".
