import { describe, expect, it } from 'vitest';
import { formatCountdown, isHoldExpired, msUntilExpiry } from './hold-countdown';

describe('msUntilExpiry', () => {
  it('calcula a diferença entre holdExpiresAt e agora', () => {
    const now = new Date('2026-09-01T12:00:00Z').getTime();
    const holdExpiresAt = '2026-09-01T12:15:00Z';
    expect(msUntilExpiry(holdExpiresAt, now)).toBe(15 * 60 * 1000);
  });

  it('nunca fica negativo — hold já expirado vira 0', () => {
    const now = new Date('2026-09-01T12:20:00Z').getTime();
    const holdExpiresAt = '2026-09-01T12:15:00Z';
    expect(msUntilExpiry(holdExpiresAt, now)).toBe(0);
  });
});

describe('isHoldExpired', () => {
  it('false quando ainda há tempo', () => {
    const now = new Date('2026-09-01T12:00:00Z').getTime();
    expect(isHoldExpired('2026-09-01T12:15:00Z', now)).toBe(false);
  });

  it('true exatamente no instante de expiração', () => {
    const now = new Date('2026-09-01T12:15:00Z').getTime();
    expect(isHoldExpired('2026-09-01T12:15:00Z', now)).toBe(true);
  });

  it('true bem depois de expirado', () => {
    const now = new Date('2026-09-01T13:00:00Z').getTime();
    expect(isHoldExpired('2026-09-01T12:15:00Z', now)).toBe(true);
  });
});

describe('formatCountdown', () => {
  it('formata minutos:segundos com 2 dígitos nos segundos', () => {
    expect(formatCountdown(15 * 60 * 1000)).toBe('15:00');
    expect(formatCountdown(7 * 1000)).toBe('0:07');
    expect(formatCountdown(65 * 1000)).toBe('1:05');
  });

  it('0ms formata como 0:00', () => {
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('arredonda para cima (nunca mostra 0:00 com tempo ainda restante)', () => {
    expect(formatCountdown(500)).toBe('0:01');
  });
});
