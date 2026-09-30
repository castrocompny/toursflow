# 00 — Índice

Porta de entrada oficial da memória técnica do ToursFlow. Última
consolidação: 24/09/2026 (commit `1b6fab5` na branch
`frontend/mobile-booking-ux`).

Para o método de construção deste cofre (hierarquia de confiança,
convenções de **DIVERGÊNCIA ENCONTRADA** / **NÃO CONFIRMADO**), ver
[[Bem-vindo]].

## Mapa do cofre

| Nota | Assunto |
|---|---|
| [[Visão Geral - ToursFlow vs NauticFlow]] | O que é cada sistema; regra de que o ToursFlow nunca escreve diretamente em tabelas operacionais do NauticFlow. |
| [[Estado Atual do Produto]] | Cada área do produto classificada em Pronto / Atrás de flag / Desativado / Pendente / Não confirmado. |
| [[Arquitetura e Camada de Dados]] | App Router, fonte de dados (mock vs. NauticFlow), estratégia de cache, realtime. |
| [[Feature Flags]] | As duas flags que controlam o fluxo transacional, e por que são constantes literais no código. |
| [[Reservas e Pagamentos (Pix)]] | Fluxo de hold, tipos de preço, idempotência, pagamento Pix, voucher, WhatsApp, cancelamento. |
| [[UX e Responsividade Mobile]] | Investigação de overflow mobile, mudanças no `BookingSelector`/espaçamento, validação em dispositivo físico. |
| [[Segurança]] | Postura de segurança atual, linha do tempo de auditoria, limitações conhecidas e aceitas. |
| [[Decisões Arquiteturais (ADRs)]] | Índice comentado das 17 ADRs em `docs/DECISIONS.md`. |
| [[Integração NauticFlow - Plano e Contratos]] | Plano original de integração e o que já está implementado. |
| [[Deploy e Ambiente]] | Como o deploy acontece, variáveis de ambiente, previews de branch. |
| [[Riscos, Pendências e Roadmap]] | Visão única de tudo que está em aberto — decisões de negócio, itens não confirmados, trabalho técnico pendente. |
| [[Notas da Auditoria Documental]] | Metodologia, lacunas conhecidas e histórico de correções deste cofre. |

## Arquivos importantes (referência rápida)

- `src/lib/feature-flags.ts` — as duas flags do fluxo transacional.
- `src/data/repository.ts` — escolha entre fonte mock e NauticFlow real.
- `src/data/sources/nauticflow-source.ts` — único ponto de leitura HTTP do catálogo NauticFlow.
- `src/lib/nauticflow-bookings.ts` / `src/lib/nauticflow-payments.ts` — únicos pontos de escrita HTTP no NauticFlow.
- `src/components/tours/BookingSelector.tsx` — seleção de data/quantidade, janela responsiva de chips.
- `src/components/realtime/CatalogRefresh` (montado em `src/app/layout.tsx`) — auto-refresh via Supabase Realtime.
- `docs/DECISIONS.md` — texto completo das ADRs (fonte primária de racional).
- `docs/SECURITY.md`, `docs/PAYMENTS.md`, `docs/PRICE-TYPES.md`, `docs/RESERVAS-SERVER-TO-SERVER.md`, `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md` — docs por tópico na raiz de `docs/`.
- `docs/changelog/CHANGELOG.md` — histórico cronológico completo (849+ linhas); este cofre prioriza as notas por tópico acima, não repete o changelog linha a linha.

## Convenção de manutenção

Antes de criar uma nota nova, procurar primeiro se o assunto já está
coberto em alguma nota existente acima e atualizar essa nota em vez de
duplicar. Ver [[Notas da Auditoria Documental]] para o racional completo
dessa regra.
