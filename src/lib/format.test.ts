import { describe, expect, it } from 'vitest';
import {
  departureDateKey,
  formatDepartureDateShort,
  formatDepartureEndTime,
  formatDepartureFullDate,
  formatDepartureTimeRange,
  formatNextDepartureLabel,
  formatRelativeDepartureDate,
} from './format';

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

describe('formatNextDepartureLabel', () => {
  const now = '2026-09-17T15:00:00Z'; // 12:00 em Brasília, 17/set

  it('"Hoje às HH:MM" quando a saída é no mesmo dia civil em Brasília', () => {
    expect(formatNextDepartureLabel('2026-09-17T18:00:00Z', now)).toBe('Hoje às 15:00');
  });

  it('"Amanhã às HH:MM" quando a saída é no dia civil seguinte em Brasília', () => {
    expect(formatNextDepartureLabel('2026-09-18T12:00:00Z', now)).toBe('Amanhã às 09:00');
  });

  it('data por extenso + horário pra qualquer outro dia', () => {
    expect(formatNextDepartureLabel('2026-09-25T12:00:00Z', now)).toBe('25 de setembro às 09:00');
  });

  it('"Hoje" continua valendo perto da virada de dia em Brasília (UTC-3)', () => {
    // now = 2026-09-17T23:30 em Brasília (2026-09-18T02:30Z); saída no
    // mesmo instante civil (ainda 17/set em Brasília) -> "Hoje".
    expect(formatNextDepartureLabel('2026-09-18T01:00:00Z', '2026-09-18T02:30:00Z')).toBe('Hoje às 22:00');
  });
});

describe('formatRelativeDepartureDate', () => {
  const now = '2026-09-17T15:00:00Z'; // 12:00 em Brasília, 17/set (quinta-feira)

  it('"Hoje, {dia da semana}" quando é o mesmo dia civil em Brasília', () => {
    expect(formatRelativeDepartureDate('2026-09-17T18:00:00Z', now)).toBe('Hoje, quinta-feira');
  });

  it('"Amanhã, {dia da semana}" quando é o dia civil seguinte', () => {
    expect(formatRelativeDepartureDate('2026-09-18T12:00:00Z', now)).toBe('Amanhã, sexta-feira');
  });

  it('"{Dia da semana}, {dia por extenso}" (primeira letra maiúscula) pra qualquer outro dia', () => {
    // 2026-09-19 é sábado.
    expect(formatRelativeDepartureDate('2026-09-19T12:00:00Z', now)).toBe('Sábado, 19 de setembro');
  });
});

describe('formatDepartureEndTime', () => {
  it('soma durationMinutes ao horário de início (300min = 5h)', () => {
    expect(formatDepartureEndTime('2026-09-17T12:00:00Z', 300)).toBe('14:00');
  });

  it('null quando durationMinutes está ausente', () => {
    expect(formatDepartureEndTime('2026-09-17T12:00:00Z', undefined)).toBeNull();
  });

  it('null quando durationMinutes é inválido (0, negativo, NaN) — nunca inventa horário final', () => {
    expect(formatDepartureEndTime('2026-09-17T12:00:00Z', 0)).toBeNull();
    expect(formatDepartureEndTime('2026-09-17T12:00:00Z', -30)).toBeNull();
    expect(formatDepartureEndTime('2026-09-17T12:00:00Z', NaN)).toBeNull();
  });

  it('atravessa meia-noite corretamente', () => {
    // 2026-09-18T02:30:00Z = 2026-09-17T23:30 em Brasília; +90min cruza pro dia seguinte.
    expect(formatDepartureEndTime('2026-09-18T02:30:00Z', 90)).toBe('01:00');
  });
});

describe('formatDepartureTimeRange', () => {
  it('"início às fim" quando durationMinutes é válido', () => {
    expect(formatDepartureTimeRange('2026-09-17T12:00:00Z', 300)).toBe('09:00 às 14:00');
  });

  it('só o horário de início quando durationMinutes está ausente — nunca inventa o final', () => {
    expect(formatDepartureTimeRange('2026-09-17T12:00:00Z')).toBe('09:00');
  });

  it('só o horário de início quando durationMinutes é inválido', () => {
    expect(formatDepartureTimeRange('2026-09-17T12:00:00Z', 0)).toBe('09:00');
  });
});
