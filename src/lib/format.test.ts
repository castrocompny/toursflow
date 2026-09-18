import { describe, expect, it } from 'vitest';
import { departureDateKey, formatDepartureDateShort, formatDepartureFullDate } from './format';

describe('departureDateKey', () => {
  it('devolve YYYY-MM-DD no fuso de Brasília', () => {
    expect(departureDateKey('2026-09-17T12:00:00Z')).toBe('2026-09-17');
  });

  it('vira o dia seguinte em Brasília antes da meia-noite UTC (UTC-3)', () => {
    // 2026-09-18T02:00:00Z = 2026-09-17T23:00:00 em Brasília -> ainda dia 17.
    expect(departureDateKey('2026-09-18T02:00:00Z')).toBe('2026-09-17');
    // 2026-09-18T03:00:00Z = 2026-09-18T00:00:00 em Brasília -> já dia 18.
    expect(departureDateKey('2026-09-18T03:00:00Z')).toBe('2026-09-18');
  });
});

describe('formatDepartureDateShort', () => {
  it('formato compacto "Dia DD" (2026-09-17 é quinta-feira em Brasília)', () => {
    expect(formatDepartureDateShort('2026-09-17T12:00:00Z')).toBe('Qui 17');
  });

  it('sem vírgula nem ponto (o Intl devolve "qui., 17" — precisa ser limpo)', () => {
    expect(formatDepartureDateShort('2026-09-17T12:00:00Z')).not.toMatch(/[,.]/);
  });
});

describe('formatDepartureFullDate', () => {
  it('dia por extenso sem ano', () => {
    expect(formatDepartureFullDate('2026-09-17T12:00:00Z')).toBe('17 de setembro');
  });
});
