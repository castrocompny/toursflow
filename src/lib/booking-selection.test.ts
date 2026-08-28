import { describe, expect, it } from 'vitest';
import type { Departure } from '@/types';
import {
  MIN_BOOKING_QUANTITY,
  calculateEstimatedTotal,
  canContinueBooking,
  clampQuantity,
  isSellablePriceType,
  sortDeparturesByDate,
} from './booking-selection';

const perPerson: Departure = {
  id: 'd1',
  tourId: 't1',
  departsAt: '2026-10-11T17:00:00+00:00',
  price: 150,
  priceType: 'per_person',
  soldOut: false,
};

const perGroup: Departure = { ...perPerson, id: 'd2', priceType: 'per_group', price: 200 };
const perBoat: Departure = { ...perPerson, id: 'd3', priceType: 'per_boat', price: 1200 };
const startingFrom: Departure = { ...perPerson, id: 'd4', priceType: 'starting_from', price: 100 };
const soldOutDeparture: Departure = { ...perPerson, id: 'd5', soldOut: true };

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

  it('não impõe teto máximo — não existe limite oficial no contrato do NauticFlow', () => {
    expect(clampQuantity(999)).toBe(999);
    expect(clampQuantity(100000)).toBe(100000);
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

  it('true com quantidade alta — sem teto fictício', () => {
    expect(canContinueBooking(perPerson, 500)).toBe(true);
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
