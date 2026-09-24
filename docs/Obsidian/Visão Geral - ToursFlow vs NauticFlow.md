# ToursFlow vs. NauticFlow

## Papel de cada sistema

**ToursFlow** é a camada de **marketplace público** — a experiência do
turista: descoberta de passeios, destinos, categorias, disponibilidade,
e (ainda atrás de flag, ver [[Feature Flags]]) o fluxo transacional de
reserva e pagamento. É um repositório, deploy e domínio próprios
(`toursflow.com.br`), publicado na Vercel.

**NauticFlow** é o **sistema operacional/core** do operador — onde as
saídas, embarcações, preços e reservas realmente existem e são
gerenciadas. O ToursFlow não é dono de nenhum desses dados: ele os lê (e,
quando o fluxo estiver ligado, escreve reservas) sempre através da API
pública do NauticFlow, nunca diretamente no banco.

Fonte: `docs/DECISIONS.md` (ADR-001, ADR-005, ADR-013), `docs/PLANO-INTEGRACAO-NAUTICFLOW.md`,
`docs/RESERVAS-SERVER-TO-SERVER.md`. Confirmado em código: `src/data/sources/nauticflow-source.ts`
consome apenas endpoints HTTP do NauticFlow; não há nenhuma conexão direta a banco de dados do
NauticFlow em `src/`.

## Regra central: ToursFlow nunca escreve diretamente em tabelas operacionais do NauticFlow

Esta é uma regra de design deliberada e repetida em várias ADRs, não uma
observação isolada:

- **Leitura de catálogo**: `listTours()`, `getTour()`, `listDestinations()`,
  `listCategories()` chamam a API pública do NauticFlow (`nauticflow-source.ts`).
  Nunca há acesso a uma tabela do NauticFlow por SQL/ORM direto.
- **Escrita de reserva**: quando `BOOKING_CHECKOUT_ENABLED` estiver `true`
  (hoje `false`), `POST /api/bookings` do ToursFlow chama
  `POST /api/marketplace/bookings` do NauticFlow — uma rota pública
  dedicada a esse propósito, autenticada com
  `Authorization: Bearer <TOURSFLOW_API_SECRET>` — e não grava nada em
  banco próprio do NauticFlow.
- **Escrita de pagamento**: mesma lógica, via
  `POST/GET /api/marketplace/bookings/{bookingId}/payment`.
- **A única exceção de acesso "direto"** é de **leitura**, e a uma única
  tabela minúscula e não-operacional: `public.marketplace_catalog_state`
  no Supabase do NauticFlow (id/version/updated_at, RLS
  `for select to anon, authenticated using (true)`), usada só para saber
  *quando* o catálogo mudou e disparar `router.refresh()` — nunca para ler
  ou escrever dado de negócio. Ver [[Arquitetura e Camada de Dados]]
  (seção Realtime).

## Por que essa separação importa

Documentado em ADR-005 (`docs/DECISIONS.md`): o ToursFlow monta o payload
de reserva a partir de uma **whitelist** de campos
(`departureId`, `quantity`, `customer.{name,email,phone,cpf}`) — nunca
repassa campos arbitrários do cliente (preço, total, `companyId`, status,
origem etc.) para o NauticFlow. O preço e o total são sempre recalculados
pelo NauticFlow a partir do `departureId`; o ToursFlow nunca é a fonte da
verdade de preço nem de disponibilidade — só o exibe.

## O que isso implica para "current state"

Qualquer funcionalidade que pareça exigir que o ToursFlow "grave direto" em
algo do NauticFlow (ex.: confirmar uma reserva sem passar pela API pública,
ou marcar pagamento como pago localmente) é, por definição de arquitetura,
fora do escopo do ToursFlow — se aparecer no código, é uma
**DIVERGÊNCIA** a ser investigada, não uma feature a documentar como
normal. Nenhuma ocorrência desse tipo foi encontrada nesta rodada de
análise (24/09/2026) — `src/lib/nauticflow-bookings.ts` e
`src/lib/nauticflow-payments.ts` são os únicos pontos de saída para o
NauticFlow e ambos usam HTTP contra a API pública documentada.

Ver também [[Integração NauticFlow - Plano e Contratos]] para o histórico
do plano de integração e [[Decisões Arquiteturais (ADRs)]] para o
racional completo de cada decisão citada aqui.
