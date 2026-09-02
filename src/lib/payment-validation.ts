import { PaymentApiError } from './payment-errors';

/**
 * Validação local antes de gastar uma chamada ao NauticFlow — que
 * continua sendo a fonte de verdade final (capacidade, hold, valor).
 * Mesmo padrão de `booking-validation.ts`: whitelist explícita, nunca
 * repassa o corpo bruto recebido.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: PaymentApiError };

export function validateBookingId(raw: string): ValidationResult<string> {
  if (!UUID_RE.test(raw)) {
    return { ok: false, error: new PaymentApiError(400, 'BOOKING_NOT_FOUND', 'Reserva inválida.') };
  }
  return { ok: true, data: raw };
}

export function validatePaymentIdempotencyKey(raw: string | null): ValidationResult<string> {
  if (!raw || !raw.trim()) {
    return {
      ok: false,
      error: new PaymentApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Cabeçalho Idempotency-Key é obrigatório.'),
    };
  }
  const key = raw.trim();
  if (key.length > 200 || !UUID_RE.test(key)) {
    return {
      ok: false,
      error: new PaymentApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key inválida — precisa ser um UUID.'),
    };
  }
  return { ok: true, data: key };
}

/**
 * Whitelist explícita: só aceita `{ paymentMethod: "pix" }` — qualquer
 * outro valor (ou campo extra, ignorado por não ser lido) é rejeitado
 * com `PAYMENT_METHOD_NOT_SUPPORTED`, nunca repassado ao NauticFlow.
 * Nunca aceita `amount` do corpo, mesmo que venha — o NauticFlow sempre
 * recalcula o valor a partir da reserva.
 */
export function validatePaymentMethod(raw: unknown): ValidationResult<'pix'> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: new PaymentApiError(400, 'INVALID_REQUEST', 'Corpo da requisição inválido.') };
  }
  const body = raw as Record<string, unknown>;
  if (body.paymentMethod !== 'pix') {
    return {
      ok: false,
      error: new PaymentApiError(400, 'PAYMENT_METHOD_NOT_SUPPORTED', 'Forma de pagamento não suportada.'),
    };
  }
  return { ok: true, data: 'pix' };
}
