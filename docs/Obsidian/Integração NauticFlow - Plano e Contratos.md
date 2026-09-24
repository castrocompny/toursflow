# Integração NauticFlow — Plano e Contratos

## Status do documento de origem

`docs/PLANO-INTEGRACAO-NAUTICFLOW.md` (383 linhas, datado de 26/08/2026) é
um **documento de planejamento**, não um retrato do estado atual. Ele
descreve 19 seções e um plano faseado (Fase 0 a Fase 10) com um checklist
final. Boa parte dele já foi implementada desde então — confirmado
cruzando com as ADRs correspondentes ([[Decisões Arquiteturais (ADRs)]])
e com o código atual — mas o documento em si nunca foi marcado como
"concluído" internamente. Tratar como contexto histórico/fundacional, não
como fonte de verdade sobre o que existe hoje.

## O que o plano previa, e o que se confirma implementado hoje

- Camada de dados plugável (mock vs. real) → confirmado, ADR-001,
  `src/data/repository.ts`.
- Contrato de tipos de preço → confirmado, `docs/PRICE-TYPES.md`,
  `src/types/index.ts`.
- Reserva server-to-server com whitelist de payload → confirmado,
  ADR-005, `docs/RESERVAS-SERVER-TO-SERVER.md`.
- Pagamento Pix com contrato real → confirmado, `docs/PAYMENTS.md`,
  validado 02/09/2026.
- Realtime de catálogo → confirmado, ADR-014, `CatalogRefresh`.
- Destinos multi-cidade dirigidos por dados → confirmado, ADR-015.

Este cruzamento foi feito no nível de "a peça existe e está descrita em
uma ADR/doc própria com data de validação real", não campo a campo contra
o texto original do plano de 26/08/2026 — uma verificação campo a campo
completa não foi feita nesta rodada. Ver
[[Notas da Auditoria Documental]] para o que ficou fora do escopo.

## O que ainda não existe / é pendente formal

- Página `/operadores/[slug]` — nunca implementada (confirmado ausente
  no inventário atual de rotas, ver [[Arquitetura e Camada de Dados]]).
  Era classificada como importante mas não obrigatória.
- Regras financeiras de cancelamento (prazos, percentuais) — ADR-016,
  decisão de negócio ainda não tomada.
- Ativação real do fluxo transacional — depende das duas feature flags,
  ver [[Feature Flags]].

## Contratos confirmados com o operador real do NauticFlow

- Tipos de preço confirmados em 28/08/2026 (`docs/PRICE-TYPES.md`).
- Header de identidade de rate limit exigido em produção, confirmado em
  01/09/2026 (ADR-004).
- Contrato de pagamento real confirmado em 02/09/2026 (`docs/PAYMENTS.md`).

Ver [[Visão Geral - ToursFlow vs NauticFlow]] para a separação de
responsabilidades entre os dois sistemas.
