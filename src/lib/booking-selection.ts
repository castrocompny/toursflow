import type { Departure, PriceType } from '@/types';
import { departureDateKey, formatNextDepartureLabel } from '@/lib/format';

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

/** Quantos horários de um grupo já podem ser escolhidos agora (não esgotados, tipo vendável) — usado no resumo compacto "17 de setembro · 3 horários disponíveis". */
export function countAvailableInGroup(group: DepartureGroup): number {
  return group.departures.filter((departure) => !departure.soldOut && isSellablePriceType(departure.priceType)).length;
}

/** Uma saída pode ser reservada agora: não esgotada, tipo vendável. Não considera data/hora (uma saída de hoje mais cedo, por exemplo, ainda pode ter `soldOut: false` — quem decide isso é o NauticFlow, nunca o relógio do cliente). */
export function isDepartureBookable(departure: Departure): boolean {
  return !departure.soldOut && isSellablePriceType(departure.priceType);
}

/** 0 -> esgotado; 1 -> "última vaga"; 2+ -> "N vagas disponíveis". Nunca mostra valor negativo. */
export function availabilityLabel(spots: number): string {
  if (spots <= 0) return 'Esgotado';
  if (spots === 1) return 'Última vaga disponível';
  return `${spots} vagas disponíveis`;
}

/** Resumo compacto acima da lista de horários de uma data ("3 horários disponíveis"). */
export function formatAvailableTimesCount(count: number): string {
  if (count <= 0) return 'Nenhum horário disponível nesta data';
  if (count === 1) return '1 horário disponível';
  return `${count} horários disponíveis`;
}

/**
 * Próxima saída vendável a partir de `now` — só entre as saídas já
 * recebidas (nenhuma request nova). `now` é injetável pra teste; em
 * produção é sempre o instante real do servidor (rota já é
 * `force-dynamic`/`no-store`, não há cache pra invalidar). Ordena
 * internamente — não depende do chamador já ter ordenado.
 */
export function findNextDeparture(departures: Departure[], now: Date = new Date()): Departure | null {
  const nowMs = now.getTime();
  return (
    sortDeparturesByDate(departures).find(
      (departure) => isDepartureBookable(departure) && new Date(departure.departsAt).getTime() > nowMs,
    ) ?? null
  );
}

export interface NextDepartureSummary {
  departure: Departure;
  /** "Hoje às 15:30" / "Amanhã às 09:00" / "17 de setembro às 15:30". */
  label: string;
  /** "4 vagas disponíveis" / "Última vaga disponível" — nunca "Esgotado" (findNextDeparture já filtra saídas esgotadas). */
  spotsLabel: string;
}

/** Combina `findNextDeparture` + os formatadores de texto — usado direto na página do passeio, sem request novo. */
export function summarizeNextDeparture(departures: Departure[], now: Date = new Date()): NextDepartureSummary | null {
  const departure = findNextDeparture(departures, now);
  if (!departure) return null;
  return {
    departure,
    label: formatNextDepartureLabel(departure.departsAt, now.toISOString()),
    spotsLabel: availabilityLabel(departure.availableSpots),
  };
}
