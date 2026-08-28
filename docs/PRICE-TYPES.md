# Contrato de price types

Status: confirmado por quem opera o NauticFlow (2026-08-28). Referenciado por
`src/types/index.ts`, `src/data/sources/nauticflow-source.ts`
(`mapPriceType()`), `src/lib/booking-selection.ts`
(`isSellablePriceType()`/`calculateEstimatedTotal()`) e
`src/components/tours/BookingSelector.tsx`.

## Tabela

| NauticFlow (`price_type`) | ToursFlow (`PriceType`) | Vendável? | Total mostrado |
|---|---|---|---|
| `por_pessoa` | `per_person` | Sim | `price × quantity` — confirmado em E2E real contra produção (`teste-e2e-producao-toursflow-78a909`: 15000 × 2 = 30000) |
| `por_grupo` | `per_group` | Sim | `price` fixo — a quantidade **não** multiplica, confirmado contra o contrato real |
| `a_partir_de` | `starting_from` | **Não** | Só preço de catálogo ("a partir de"). O NauticFlow rejeita tentativa de reserva desse tipo com `PRICE_TYPE_NOT_SELLABLE` |
| — (sem equivalente no NauticFlow hoje) | `per_boat` | **Não** | Existe no tipo do ToursFlow só por compatibilidade com dado mock/legado. `mapPriceType()` nunca produz esse valor a partir de dado real |
| qualquer valor desconhecido/novo | — | **Não** | Cai em `starting_from` (ver "Padrão seguro" abaixo) |

## Padrão seguro (fail-safe default)

`mapPriceType()` em `src/data/sources/nauticflow-source.ts` trata qualquer
`price_type` que não reconheça como `starting_from` — o lado "não vendável"
— e registra um `console.warn`. A escolha é deliberada: se o NauticFlow
adicionar um price type novo antes do ToursFlow ser atualizado para
entendê-lo, o efeito é uma saída que aparece bloqueada na UI (pior caso:
usuário não consegue reservar um tipo válido até o mapeamento ser
atualizado), nunca uma saída vendida com semântica de preço errada. Essa
regra existia antes na direção oposta (desconhecido caía em `per_person`,
vendável) e foi corrigida nesta rodada por ser o lado errado para errar.

## Onde a regra é aplicada

- **Backend de reserva:** o NauticFlow é sempre quem decide se um
  `departureId` pode ser reservado — o ToursFlow nunca tenta adivinhar isso
  para além do que mostra na UI. Uma tentativa de reserva de um
  `starting_from` retorna `PRICE_TYPE_NOT_SELLABLE` (ver
  [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md)).
- **UI (`BookingSelector`):** `isSellablePriceType()` desabilita o card da
  saída (`starting_from`/`per_boat`) e mostra a mensagem "Reserva online
  para este tipo de passeio ainda não está disponível." — impossível
  selecionar, impossível chegar a "Continuar reserva", impossível calcular
  um total para um tipo não vendável.
- **Cálculo de total estimado (`calculateEstimatedTotal()`):** só
  multiplica por quantidade quando `priceType === 'per_person'`; para
  qualquer outro tipo (incluindo os não vendáveis, que nunca chegam a essa
  função na prática) retorna o preço como está.

## Histórico

- Antes de 2026-08-28: comportamento de `per_group`/`per_boat` era suposição
  não confirmada (código comentava "NÃO confirmado"); desconhecido caía em
  `per_person` (vendável — lado errado).
- 2026-08-28: contrato confirmado pelo operador do NauticFlow; `per_boat`
  removido do mapeamento (nunca existiu como `price_type` real no
  NauticFlow); desconhecido passou a cair em `starting_from` (não vendável
  — lado seguro); `per_group` confirmado como preço fixo.

## PLANEJADO / NÃO IMPLEMENTADO

- `per_boat` como price type real do NauticFlow (hoje não existe do lado
  do operador; se vier a existir, precisa de confirmação e atualização
  deste documento antes de qualquer mudança de mapeamento).
