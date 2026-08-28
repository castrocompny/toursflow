import { describe, expect, it } from 'vitest';
import type { BookingErrorCode } from '@/types/booking';
import { BOOKING_ERROR_MESSAGES, getBookingErrorMessage } from './booking-error-messages';

const ALL_CODES: BookingErrorCode[] = [
  'INVALID_REQUEST',
  'INVALID_IDEMPOTENCY_KEY',
  'UNAUTHORIZED',
  'DEPARTURE_NOT_FOUND',
  'DEPARTURE_IN_PAST',
  'DEPARTURE_NOT_SELLABLE',
  'PRICE_NOT_CONFIGURED',
  'PRICE_TYPE_NOT_SELLABLE',
  'INSUFFICIENT_CAPACITY',
  'RATE_LIMITED',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL_ERROR',
  'BOOKING_SERVICE_UNAVAILABLE',
  'CLIENT_IP_UNAVAILABLE',
];

describe('BOOKING_ERROR_MESSAGES', () => {
  it('tem uma mensagem não vazia para todos os 14 códigos conhecidos', () => {
    for (const code of ALL_CODES) {
      expect(BOOKING_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });

  it('nenhuma mensagem vaza detalhe técnico', () => {
    for (const code of ALL_CODES) {
      const message = BOOKING_ERROR_MESSAGES[code].toLowerCase();
      expect(message).not.toMatch(/stack|undefined|nauticflow|supabase|environment variable|secret/);
    }
  });
});

describe('getBookingErrorMessage', () => {
  it('devolve a mensagem certa para um código conhecido', () => {
    expect(getBookingErrorMessage('RATE_LIMITED')).toBe(BOOKING_ERROR_MESSAGES.RATE_LIMITED);
  });

  it('cai na mensagem genérica para código desconhecido/ausente, sem lançar', () => {
    expect(getBookingErrorMessage('CODIGO_INVENTADO')).toBe(BOOKING_ERROR_MESSAGES.INTERNAL_ERROR);
    expect(getBookingErrorMessage(undefined)).toBe(BOOKING_ERROR_MESSAGES.INTERNAL_ERROR);
    expect(getBookingErrorMessage(null)).toBe(BOOKING_ERROR_MESSAGES.INTERNAL_ERROR);
    expect(getBookingErrorMessage(123)).toBe(BOOKING_ERROR_MESSAGES.INTERNAL_ERROR);
  });
});
