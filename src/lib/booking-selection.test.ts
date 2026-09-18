import { describe, expect, it } from 'vitest';
import type { Departure } from '@/types';
import {
  MIN_BOOKING_QUANTITY,
  availabilityLabel,
  calculateEstimatedTotal,
  canContinueBooking,
  clampQuantity,
  countAvailableInGroup,
  findNextDeparture,
  formatAvailableTimesCount,
  groupDeparturesByDate,
  isDepartureBookable,
  isGroupAvailable,
  isSellablePriceType,
  sortDeparturesByDate,
  summarizeNextDeparture,
} from './booking-selection';

const perPerson: Departure = {
  id: 'd1',
  tourId: 't1',
  departsAt: '2026-10-11T17:00:00+00:00',
  price: 150,
  priceType: 'per_person',
  // Alto de propósito nos testes que já existiam (500, 999, 100000) —
  // continuam exercitando "sem teto quando maxAvailable não é informado".
  availableSpots: 999999,
  soldOut: false,
};

const perGroup: Departure = { ...perPerson, id: 'd2', priceType: 'per_group', price: 200 };
const perBoat: Departure = { ...perPerson, id: 'd3', priceType: 'per_boat', price: 1200 };
const startingFrom: Departure = { ...perPerson, id: 'd4', priceType: 'starting_from', price: 100 };
const soldOutDeparture: Departure = { ...perPerson, id: 'd5', soldOut: true, availableSpots: 0 };
const lowAvailability: Departure = { ...perPerson, id: 'd6', availableSpots: 1 };

describe('clampQuantity', () => {
  it('mantém valores válidos dentro do intervalo', () => {
    expect(clampQuantity(3)).toBe(3);
  });

  it('nunca permite 0', () => {
    expect(clampQuantity(0)).toBe(MIN_BOOKING_QUANTITY);
  });

  it('nunca permite negativo', () => {
    expect(clampQuantity(-5)).toBe(MIN_BOOKING_QUANTITY);
  });

  it('nunca permite NaN', () => {
    expect(clampQuantity(NaN)).toBe(MIN_BOOKING_QUANTITY);
  });

  it('nunca permite Infinity', () => {
    expect(clampQuantity(Infinity)).toBe(MIN_BOOKING_QUANTITY);
  });

  it('arredonda valores fracionários', () => {
    expect(clampQuantity(2.7)).toBe(3);
  });

  it('não impõe teto máximo quando maxAvailable não é informado', () => {
    expect(clampQuantity(999)).toBe(999);
    expect(clampQuantity(100000)).toBe(100000);
  });

  it('usa maxAvailable (availableSpots) como teto visual quando informado', () => {
    expect(clampQuantity(5, 8)).toBe(5);
    expect(clampQuantity(20, 8)).toBe(8);
    expect(clampQuantity(1, 8)).toBe(1);
  });

  it('maxAvailable inválido (0, negativo, NaN) não é usado como teto', () => {
    expect(clampQuantity(5, 0)).toBe(5);
    expect(clampQuantity(5, -3)).toBe(5);
    expect(clampQuantity(5, NaN)).toBe(5);
  });

  it('respeita MIN_BOOKING_QUANTITY mesmo com maxAvailable baixo', () => {
    expect(clampQuantity(0, 1)).toBe(MIN_BOOKING_QUANTITY);
  });
});

describe('isSellablePriceType', () => {
  it('per_person é vendável (confirmado)', () => {
    expect(isSellablePriceType('per_person')).toBe(true);
  });

  it('per_group é vendável (confirmado)', () => {
    expect(isSellablePriceType('per_group')).toBe(true);
  });

  it('starting_from (a_partir_de) NÃO é vendável (confirmado — NauticFlow rejeita)', () => {
    expect(isSellablePriceType('starting_from')).toBe(false);
  });

  it('per_boat NÃO é vendável (sem equivalente confirmado no NauticFlow)', () => {
    expect(isSellablePriceType('per_boat')).toBe(false);
  });
});

describe('calculateEstimatedTotal', () => {
  it('per_person: multiplica preço pela quantidade (confirmado em E2E real)', () => {
    expect(calculateEstimatedTotal(perPerson, 2)).toBe(300);
    expect(calculateEstimatedTotal(perPerson, 1)).toBe(150);
  });

  it('per_group: preço fixo, quantidade não multiplica (confirmado no contrato real do NauticFlow)', () => {
    expect(calculateEstimatedTotal(perGroup, 1)).toBe(200);
    expect(calculateEstimatedTotal(perGroup, 5)).toBe(200);
  });

  it('normaliza quantidade inválida antes de calcular (per_person)', () => {
    expect(calculateEstimatedTotal(perPerson, 0)).toBe(150); // clamp para 1
    expect(calculateEstimatedTotal(perPerson, -3)).toBe(150);
  });
});

describe('canContinueBooking', () => {
  it('true com saída per_person válida e quantidade válida', () => {
    expect(canContinueBooking(perPerson, 2)).toBe(true);
  });

  it('true com saída per_group válida e quantidade válida', () => {
    expect(canContinueBooking(perGroup, 3)).toBe(true);
  });

  it('false sem saída selecionada', () => {
    expect(canContinueBooking(null, 2)).toBe(false);
  });

  it('false quando a saída está esgotada', () => {
    expect(canContinueBooking(soldOutDeparture, 1)).toBe(false);
  });

  it('false para starting_from — catálogo, não vendável', () => {
    expect(canContinueBooking(startingFrom, 1)).toBe(false);
  });

  it('false para per_boat — sem equivalente vendável no NauticFlow', () => {
    expect(canContinueBooking(perBoat, 1)).toBe(false);
  });

  it('false com quantidade inválida (zero, negativo, NaN, fracionário)', () => {
    expect(canContinueBooking(perPerson, 0)).toBe(false);
    expect(canContinueBooking(perPerson, -1)).toBe(false);
    expect(canContinueBooking(perPerson, NaN)).toBe(false);
    expect(canContinueBooking(perPerson, 1.5)).toBe(false);
  });

  it('true com quantidade alta — sem teto fictício quando a saída tem muitas vagas', () => {
    expect(canContinueBooking(perPerson, 500)).toBe(true);
  });

  it('false quando a quantidade excede availableSpots (impede overbooking visual)', () => {
    expect(canContinueBooking(lowAvailability, 2)).toBe(false);
  });

  it('true quando a quantidade é exatamente igual a availableSpots', () => {
    expect(canContinueBooking(lowAvailability, 1)).toBe(true);
  });
});

describe('sortDeparturesByDate', () => {
  it('ordena por data crescente sem mutar o array original', () => {
    const later: Departure = { ...perPerson, id: 'later', departsAt: '2026-12-01T00:00:00Z' };
    const earlier: Departure = { ...perPerson, id: 'earlier', departsAt: '2026-09-01T00:00:00Z' };
    const input = [later, earlier];
    const sorted = sortDeparturesByDate(input);
    expect(sorted.map((d) => d.id)).toEqual(['earlier', 'later']);
    expect(input.map((d) => d.id)).toEqual(['later', 'earlier']); // input intocado
  });
});

describe('groupDeparturesByDate', () => {
  // Dois horários no MESMO dia civil em America/Sao_Paulo (09h/15h UTC ->
  // 06h/12h em Brasília, ainda 11/out nos dois casos).
  const morning: Departure = { ...perPerson, id: 'morning', departsAt: '2026-10-11T09:00:00Z' };
  const afternoon: Departure = { ...perPerson, id: 'afternoon', departsAt: '2026-10-11T15:00:00Z' };
  // Depois da meia-noite UTC mas ainda 11/out em Brasília (UTC-3) — prova
  // que o agrupamento usa o fuso certo, não a data UTC crua.
  const lateUtcSameDay: Departure = { ...perPerson, id: 'late-utc', departsAt: '2026-10-12T01:00:00Z' };
  const nextDay: Departure = { ...perPerson, id: 'next-day', departsAt: '2026-10-12T15:00:00Z' };

  it('agrupa saídas do mesmo dia civil (fuso de Brasília) num único grupo', () => {
    const groups = groupDeparturesByDate(sortDeparturesByDate([morning, afternoon, lateUtcSameDay]));
    expect(groups).toHaveLength(1);
    expect(groups[0].departures.map((d) => d.id)).toEqual(['morning', 'afternoon', 'late-utc']);
  });

  it('separa em grupos diferentes quando o dia civil muda', () => {
    const groups = groupDeparturesByDate(sortDeparturesByDate([morning, nextDay]));
    expect(groups).toHaveLength(2);
    expect(groups[0].departures.map((d) => d.id)).toEqual(['morning']);
    expect(groups[1].departures.map((d) => d.id)).toEqual(['next-day']);
  });

  it('preserva a ordem de entrada dos grupos e das saídas dentro do grupo', () => {
    const groups = groupDeparturesByDate(sortDeparturesByDate([nextDay, morning, afternoon]));
    expect(groups.map((g) => g.departures.map((d) => d.id))).toEqual([['morning', 'afternoon'], ['next-day']]);
  });

  it('array vazio -> nenhum grupo', () => {
    expect(groupDeparturesByDate([])).toEqual([]);
  });
});

describe('isGroupAvailable', () => {
  it('true quando pelo menos uma saída do grupo é vendável e não esgotada', () => {
    const group = { dateKey: '2026-10-11', departures: [soldOutDeparture, perPerson] };
    expect(isGroupAvailable(group)).toBe(true);
  });

  it('false quando todas as saídas do grupo estão esgotadas', () => {
    const group = { dateKey: '2026-10-11', departures: [soldOutDeparture, { ...soldOutDeparture, id: 'd7' }] };
    expect(isGroupAvailable(group)).toBe(false);
  });

  it('false quando todas as saídas do grupo são de tipo não vendável (catálogo)', () => {
    const group = { dateKey: '2026-10-11', departures: [startingFrom, perBoat] };
    expect(isGroupAvailable(group)).toBe(false);
  });
});

describe('countAvailableInGroup', () => {
  it('conta só as saídas vendáveis e não esgotadas do grupo', () => {
    const group = { dateKey: '2026-10-11', departures: [perPerson, perGroup, soldOutDeparture, startingFrom] };
    expect(countAvailableInGroup(group)).toBe(2);
  });

  it('zero quando nenhuma saída do grupo está disponível', () => {
    const group = { dateKey: '2026-10-11', departures: [soldOutDeparture, startingFrom] };
    expect(countAvailableInGroup(group)).toBe(0);
  });
});

describe('isDepartureBookable', () => {
  it('true: não esgotada e tipo vendável', () => {
    expect(isDepartureBookable(perPerson)).toBe(true);
  });

  it('false: esgotada', () => {
    expect(isDepartureBookable(soldOutDeparture)).toBe(false);
  });

  it('false: tipo não vendável mesmo com vagas', () => {
    expect(isDepartureBookable(startingFrom)).toBe(false);
  });
});

describe('availabilityLabel', () => {
  it('0 ou menos -> "Esgotado"', () => {
    expect(availabilityLabel(0)).toBe('Esgotado');
    expect(availabilityLabel(-1)).toBe('Esgotado');
  });

  it('1 -> "Última vaga disponível"', () => {
    expect(availabilityLabel(1)).toBe('Última vaga disponível');
  });

  it('2+ -> "N vagas disponíveis"', () => {
    expect(availabilityLabel(2)).toBe('2 vagas disponíveis');
    expect(availabilityLabel(10)).toBe('10 vagas disponíveis');
  });
});

describe('formatAvailableTimesCount', () => {
  it('0 -> "Nenhum horário disponível nesta data"', () => {
    expect(formatAvailableTimesCount(0)).toBe('Nenhum horário disponível nesta data');
  });

  it('1 -> singular', () => {
    expect(formatAvailableTimesCount(1)).toBe('1 horário disponível');
  });

  it('2+ -> plural', () => {
    expect(formatAvailableTimesCount(3)).toBe('3 horários disponíveis');
  });
});

describe('findNextDeparture', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const past: Departure = { ...perPerson, id: 'past', departsAt: '2026-09-01T12:00:00Z' };
  const soonest: Departure = { ...perPerson, id: 'soonest', departsAt: '2026-10-05T12:00:00Z' };
  const later: Departure = { ...perPerson, id: 'later', departsAt: '2026-10-20T12:00:00Z' };
  const soonestButSoldOut: Departure = { ...soonest, id: 'soonest-sold-out', soldOut: true, availableSpots: 0 };
  const soonestButUnsellable: Departure = { ...soonest, id: 'soonest-unsellable', priceType: 'starting_from' };

  it('a saída futura mais próxima, ignorando as passadas', () => {
    expect(findNextDeparture([later, past, soonest], now)?.id).toBe('soonest');
  });

  it('pula saídas futuras esgotadas ou não vendáveis, escolhendo a próxima que já pode ser reservada', () => {
    expect(findNextDeparture([soonestButSoldOut, soonestButUnsellable, later], now)?.id).toBe('later');
  });

  it('null quando não há nenhuma saída futura vendável (array vazio ou só passado/esgotado)', () => {
    expect(findNextDeparture([], now)).toBeNull();
    expect(findNextDeparture([past], now)).toBeNull();
    expect(findNextDeparture([soonestButSoldOut], now)).toBeNull();
  });

  it('não ordena o array recebido (usa sortDeparturesByDate internamente, imutável)', () => {
    const input = [later, soonest];
    findNextDeparture(input, now);
    expect(input.map((d) => d.id)).toEqual(['later', 'soonest']);
  });
});

describe('summarizeNextDeparture', () => {
  const now = new Date('2026-10-01T13:00:00Z'); // 10:00 em Brasília, 01/out
  const soon: Departure = {
    ...perPerson,
    id: 'soon',
    departsAt: '2026-10-01T15:30:00Z', // 12:30 em Brasília, mesmo dia civil que `now`
    availableSpots: 4,
  };

  it('combina saída + rótulo de data/hora + rótulo de vagas', () => {
    const summary = summarizeNextDeparture([soon], now);
    expect(summary?.departure.id).toBe('soon');
    expect(summary?.label).toBe('Hoje às 12:30');
    expect(summary?.spotsLabel).toBe('4 vagas disponíveis');
  });

  it('"Última vaga disponível" quando só resta uma', () => {
    const summary = summarizeNextDeparture([{ ...soon, availableSpots: 1 }], now);
    expect(summary?.spotsLabel).toBe('Última vaga disponível');
  });

  it('null quando não há próxima saída (nunca inventa um valor)', () => {
    expect(summarizeNextDeparture([], now)).toBeNull();
  });
});
