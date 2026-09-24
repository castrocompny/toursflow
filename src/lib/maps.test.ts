import { describe, expect, it } from 'vitest';
import { fullAddress } from './maps';
import type { BoardingPoint } from '@/types';

function makePoint(overrides: Partial<BoardingPoint> = {}): BoardingPoint {
  return {
    name: 'Píer do Centro',
    address: 'Av. Beira-Mar, 100',
    district: 'Centro',
    city: 'Búzios',
    state: 'RJ',
    ...overrides,
  };
}

describe('fullAddress', () => {
  it('junta bairro, cidade/estado e CEP quando tudo está presente', () => {
    expect(fullAddress(makePoint({ zipCode: '28950-000' }))).toBe('Centro — Búzios/RJ, CEP 28950-000');
  });

  it('omite o CEP quando ausente', () => {
    expect(fullAddress(makePoint())).toBe('Centro — Búzios/RJ');
  });

  it('nunca deixa "—" ou "/" soltos quando bairro/cidade/estado vêm vazios (API sem esses campos)', () => {
    expect(fullAddress(makePoint({ district: '', city: '', state: '' }))).toBe('');
  });

  it('com só o CEP disponível, mostra só o CEP', () => {
    expect(fullAddress(makePoint({ district: '', city: '', state: '', zipCode: '28950-000' }))).toBe(
      'CEP 28950-000',
    );
  });

  it('com só a cidade/estado ausentes, mostra só o bairro', () => {
    expect(fullAddress(makePoint({ city: '', state: '' }))).toBe('Centro');
  });
});
