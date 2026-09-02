import type { BookingErrorCode } from '@/types/booking';

const KNOWN_BOOKING_ERROR_CODES: ReadonlySet<BookingErrorCode> = new Set([
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
  'BOOKING_CHECKOUT_NOT_ENABLED',
]);

export function isKnownBookingErrorCode(value: unknown): value is BookingErrorCode {
  return typeof value === 'string' && KNOWN_BOOKING_ERROR_CODES.has(value as BookingErrorCode);
}

/**
 * Erro estável da camada de reservas: `status` (HTTP a devolver ao
 * navegador), `code` (um dos `BookingErrorCode`) e `message` (texto seguro
 * para exibir — nunca stack trace, nunca detalhe interno, nunca segredo).
 */
export class BookingApiError extends Error {
  readonly status: number;
  readonly code: BookingErrorCode;

  constructor(status: number, code: BookingErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BookingApiError';
    this.status = status;
    this.code = code;
  }

  toResponseBody(): { error: { code: BookingErrorCode; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}
