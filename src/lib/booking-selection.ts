import type { Departure, PriceType } from '@/types';

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
 * Sem teto máximo de propósito: o contrato real do NauticFlow
 * (`booking-validation.ts`, `docs/RESERVAS-SERVER-TO-SERVER.md`) não define
 * nenhum limite oficial de quantity — quem decide se uma quantidade é
 * aceitável é o NauticFlow (capacidade real da saída). Um teto aqui seria
 * uma regra de negócio inventada pelo ToursFlow. Sempre um inteiro
 * >= MIN_BOOKING_QUANTITY — nunca 0, negativo, fracionário, NaN ou Infinity.
 */
export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return MIN_BOOKING_QUANTITY;
  const rounded = Math.round(value);
  return Math.max(MIN_BOOKING_QUANTITY, rounded);
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
  return Number.isInteger(quantity) && quantity >= MIN_BOOKING_QUANTITY;
}

export function sortDeparturesByDate(departures: Departure[]): Departure[] {
  return [...departures].sort((a, b) => new Date(a.departsAt).getTime() - new Date(b.departsAt).getTime());
}
