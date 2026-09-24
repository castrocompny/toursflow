# Decisões Arquiteturais (ADRs)

Índice comentado das 17 ADRs em `docs/DECISIONS.md` (968 linhas) — a
fonte primária de racional de decisão deste projeto, por instrução da
hierarquia de confiança desta memória. Não repete o texto completo das
ADRs; para o detalhe exato, ler `docs/DECISIONS.md` diretamente.

| ADR | Tema | Estado hoje |
|---|---|---|
| ADR-001 | Fonte de dados: mock vs. NauticFlow por presença de `NAUTICFLOW_API_URL` | Vigente |
| ADR-002 | Estratégia de cache original (ISR) | **Superada** por ADR-014 |
| ADR-004 | Identidade de rate limit por HMAC | Vigente, validada em produção em 01/09/2026 |
| ADR-005 | Whitelist de payload de reserva | Vigente |
| ADR-010/011/012 | `PAYMENTS_UI_ENABLED` e fail-closed da rota de pagamento | Vigente, ver [[Feature Flags]] |
| ADR-013 | `BOOKING_CHECKOUT_ENABLED` e fail-closed da rota de reserva | Vigente, ver [[Feature Flags]] |
| ADR-014 | Cache `no-store` para tours + `CatalogRefresh` via Supabase Realtime | Vigente, ver [[Arquitetura e Camada de Dados]] |
| ADR-015 | Destinos dirigidos por dados, sem lista hardcoded | Vigente |
| ADR-016 | Política de cancelamento centralizada no marketplace | Vigente, regras financeiras pendentes |
| ADR-017 | Voucher + compartilhamento manual via WhatsApp | Vigente |

Também existem dois blocos "PLANEJADO / NÃO IMPLEMENTADO" no documento
original (um depois da ADR-013, outro mais adiante) — conferir
diretamente em `docs/DECISIONS.md` antes de assumir que algo ali já foi
feito, já que blocos de planejamento por definição descrevem trabalho
futuro no momento em que foram escritos.

## Como usar este índice

Esta tabela é um mapa, não um substituto. Quando uma nota deste cofre
cita uma ADR (ex.: "ver ADR-005"), o texto completo e a data exata da
decisão estão em `docs/DECISIONS.md` — esta memória aponta para lá em
vez de duplicar o conteúdo, para evitar que as duas fontes divirjam
silenciosamente com o tempo.
