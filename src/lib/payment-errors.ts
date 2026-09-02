import type { PaymentErrorCode } from '@/types/payment';

const KNOWN_PAYMENT_ERROR_CODES: ReadonlySet<PaymentErrorCode> = new Set([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'INVALID_CLIENT_KEY',
  'INVALID_IDEMPOTENCY_KEY',
  'BOOKING_NOT_FOUND',
  'BOOKING_NOT_PENDING',
  'HOLD_EXPIRED',
  'PAYMENT_METHOD_NOT_SUPPORTED',
  'PAYMENT_IDEMPOTENCY_CONFLICT',
  'PAYMENT_ALREADY_ACTIVE',
  'PAYMENT_PROVIDER_NOT_ENABLED',
  'CUSTOMER_DOCUMENT_REQUIRED',
  'PAYMENT_PROVIDER_ERROR',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'PAYMENT_SERVICE_UNAVAILABLE',
  'CLIENT_IP_UNAVAILABLE',
]);

export function isKnownPaymentErrorCode(value: unknown): value is PaymentErrorCode {
  return typeof value === 'string' && KNOWN_PAYMENT_ERROR_CODES.has(value as PaymentErrorCode);
}

/** Mesmo padrão de `BookingApiError` — status HTTP + code + mensagem segura, nunca stack/detalhe interno. */
export class PaymentApiError extends Error {
  readonly status: number;
  readonly code: PaymentErrorCode;

  constructor(status: number, code: PaymentErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PaymentApiError';
    this.status = status;
    this.code = code;
  }

  toResponseBody(): { error: { code: PaymentErrorCode; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}
