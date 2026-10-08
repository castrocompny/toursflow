import { describe, expect, it } from 'vitest';
import { isBookingPayable } from './booking-payability';

const NOW = new Date('2026-10-07T12:00:00Z').getTime();
const FUTURE = '2026-10-07T12:10:00Z';
const PAST = '2026-10-07T11:50:00Z';

describe('isBookingPayable', () => {
  it('pendente com hold no futuro: pagável', () => {
    expect(isBookingPayable({ bookingStatus: 'pendente', holdExpiresAt: FUTURE }, NOW)).toBe(true);
  });

  it('hold vencido: não pagável (HOLD_EXPIRED no NauticFlow)', () => {
    expect(isBookingPayable({ bookingStatus: 'pendente', holdExpiresAt: PAST }, NOW)).toBe(false);
  });

  it('cancelada ou confirmada: não pagável (BOOKING_NOT_PENDING), mesmo com hold no futuro', () => {
    expect(isBookingPayable({ bookingStatus: 'cancelada', holdExpiresAt: FUTURE }, NOW)).toBe(false);
    expect(isBookingPayable({ bookingStatus: 'confirmada', holdExpiresAt: FUTURE }, NOW)).toBe(false);
  });

  it('sem hold: não pagável', () => {
    expect(isBookingPayable({ bookingStatus: 'pendente', holdExpiresAt: null }, NOW)).toBe(false);
  });
});
