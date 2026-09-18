import type { Departure, PriceType } from '@/types';
import { departureDateKey } from '@/lib/format';

/**
 * Lógica pura da seleção de reserva — separada do componente React para
 * ser testável sem DOM. Nada aqui chama rede nem persiste nada.
 *
 * IMPORTANTE: `calculateEstimatedTotal` é só para UX (mostrar um número
 * ao turista antes de continuar). O preço final nunca é confiado ao
 * cliente — o NauticFlow recalcula tudo a partir do `departureId` no
 * momento real da reserva (ver docs/RESERVAS-SERVER-TO-SERVER.md).
 */

export const MIN_BOOKING_QUANTITY = 1;

/**
 * Não existe teto "de contrato" fixo — mas desde que a API pública passou a
 * expor `availableSpots` (vagas reais, calculadas no NauticFlow a partir de
 * `departures.capacity` menos ocupação), a UI usa esse número como teto
 * VISUAL de conveniência: evita o turista tentar reservar mais do que
 * existe. `maxAvailable` é opcional (omitido = sem teto, comportamento
 * antigo) porque nem todo chamador conhece uma saída específica com dado
 * fresco. Isso NUNCA substitui a validação real — o NauticFlow segue sendo
 * quem decide de fato, recusando com `INSUFFICIENT_CAPACITY` se a
 * quantidade exceder a capacidade real no momento exato da reserva (a UI só
 * evita o turista chegar até lá sabendo que vai falhar). Sempre um inteiro
 * >= MIN_BOOKING_QUANTITY — nunca 0, negativo, fracionário, NaN ou Infinity.
 */
export function clampQuantity(value: number, maxAvailable?: number): number {
  if (!Number.isFinite(value)) return MIN_BOOKING_QUANTITY;
  const rounded = Math.round(value);
  const floored = Math.max(MIN_BOOKING_QUANTITY, rounded);
  if (typeof maxAvailable === 'number' && Number.isFinite(maxAvailable) && maxAvailable >= MIN_BOOKING_QUANTITY) {
    return Math.min(floored, maxAvailable);
  }
  return floored;
}

/**
 * Contrato de preço confirmado (ver docs/RESERVAS-SERVER-TO-SERVER.md):
 * - `per_person`: vendável. Confirmado em E2E real contra produção —
 *   `totalCents` do NauticFlow veio exatamente `priceCents × quantity`
 *   (15000 × 2 = 30000, passeio `teste-e2e-producao-toursflow-78a909`).
 * - `per_group`: vendável, mas preço **fixo** — `quantity` não multiplica
 *   o total (confirmado no contrato real do NauticFlow).
 * - `starting_from` (NauticFlow `a_partir_de`): só catálogo, nunca vendável
 *   — o NauticFlow rejeita com `PRICE_TYPE_NOT_SELLABLE`.
 * - `per_boat`: sem equivalente confirmado no NauticFlow hoje — tratado
 *   como não vendável por segurança, nunca por suposição de preço.
 */
export function isSellablePriceType(type: PriceType): boolean {
  return type === 'per_person' || type === 'per_group';
}

/**
 * Só chamar para saídas vendáveis — o total nunca é enviado ao backend
 * nem cobrado, é só uma estimativa visual (sempre com o aviso "valor
 * estimado, confirmado pelo operador" na tela).
 */
export function calculateEstimatedTotal(departure: Departure, quantity: number): number {
  if (departure.priceType === 'per_person') {
    return departure.price * clampQuantity(quantity);
  }
  return departure.price;
}

export function canContinueBooking(departure: Departure | null, quantity: number): boolean {
  if (!departure || departure.soldOut) return false;
  if (!isSellablePriceType(departure.priceType)) return false;
  if (!Number.isInteger(quantity) || quantity < MIN_BOOKING_QUANTITY) return false;
  // Impede continuar se a quantidade já escolhida ficou maior que a
  // disponibilidade real (ex.: dado se atualizou depois de um
  // INSUFFICIENT_CAPACITY e a vaga que o turista via não existe mais) —
  // "impedir de forma segura" em vez de silenciosamente deixar passar; o
  // NauticFlow recusaria de qualquer forma, isto só evita a tentativa.
  if (quantity > departure.availableSpots) return false;
  return true;
}

export function sortDeparturesByDate(departures: Departure[]): Departure[] {
  return [...departures].sort((a, b) => new Date(a.departsAt).getTime() - new Date(b.departsAt).getTime());
}

export interface DepartureGroup {
  dateKey: string;
  departures: Departure[];
}

/**
 * Agrupa saídas do mesmo dia civil (fuso de Brasília) — pensado pra UI
 * compacta (faixa de datas + horários do dia escolhido abaixo), em vez de
 * um card gigante por saída. Espera `departures` já ordenada
 * (`sortDeparturesByDate`); a ordem dos grupos e das saídas dentro de cada
 * grupo segue a ordem de entrada.
 */
export function groupDeparturesByDate(sortedDepartures: Departure[]): DepartureGroup[] {
  const groups: DepartureGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const departure of sortedDepartures) {
    const key = departureDateKey(departure.departsAt);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ dateKey: key, departures: [departure] });
    } else {
      groups[existingIndex].departures.push(departure);
    }
  }
  return groups;
}

/** Uma data só conta como "disponível" se tiver pelo menos um horário vendável e não esgotado — usado pra escolher a data inicial e pra marcar "Esgotado" na faixa de datas. Nunca inventa disponibilidade: só lê `soldOut`/`priceType`, os mesmos campos que já vêm do NauticFlow. */
export function isGroupAvailable(group: DepartureGroup): boolean {
  return group.departures.some((departure) => !departure.soldOut && isSellablePriceType(departure.priceType));
}
