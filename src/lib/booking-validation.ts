import type { BookingRequestInput } from '@/types/booking';
import { BookingApiError } from './booking-errors';

/**
 * Validação local antes de gastar uma chamada ao NauticFlow — que continua
 * sendo a fonte de verdade final. Nada aqui deve ser mais restritivo do
 * que o necessário para rejeitar lixo óbvio.
 *
 * A extração via whitelist explícita (nunca `...rest`, nunca repassar o
 * objeto bruto) é o que garante que campos como `company_id`, `tour_id`,
 * `price`, `total`, `status` ou `source` — mesmo que venham no JSON —
 * nunca cheguem ao NauticFlow.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: BookingApiError };

export function validateIdempotencyKey(raw: string | null): ValidationResult<string> {
  if (!raw || !raw.trim()) {
    return {
      ok: false,
      error: new BookingApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Cabeçalho Idempotency-Key é obrigatório.'),
    };
  }

  const key = raw.trim();
  if (key.length > 200 || !UUID_RE.test(key)) {
    return {
      ok: false,
      error: new BookingApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key inválida — precisa ser um UUID.'),
    };
  }

  return { ok: true, data: key };
}

export function validateBookingInput(raw: unknown): ValidationResult<BookingRequestInput> {
  const fail = (message: string): ValidationResult<BookingRequestInput> => ({
    ok: false,
    error: new BookingApiError(400, 'INVALID_REQUEST', message),
  });

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('Corpo da requisição inválido.');
  }
  const body = raw as Record<string, unknown>;

  const departureId = body.departureId;
  if (typeof departureId !== 'string' || !UUID_RE.test(departureId)) {
    return fail('departureId precisa ser um UUID válido.');
  }

  const quantity = body.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return fail('quantity precisa ser um inteiro entre 1 e 50.');
  }

  if (typeof body.customer !== 'object' || body.customer === null || Array.isArray(body.customer)) {
    return fail('customer é obrigatório.');
  }
  const customerRaw = body.customer as Record<string, unknown>;

  const name = typeof customerRaw.name === 'string' ? customerRaw.name.trim() : '';
  if (!name || name.length > 200) {
    return fail('customer.name é obrigatório.');
  }

  const email = typeof customerRaw.email === 'string' ? customerRaw.email.trim() : '';
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
    return fail('customer.email é obrigatório e precisa ser válido.');
  }

  const phone = typeof customerRaw.phone === 'string' ? customerRaw.phone.trim() : '';
  if (!phone || phone.length > 40) {
    return fail('customer.phone é obrigatório.');
  }

  const cpfRaw = typeof customerRaw.cpf === 'string' ? customerRaw.cpf.trim() : '';
  if (cpfRaw.length > 20) {
    return fail('customer.cpf inválido.');
  }

  // Whitelist explícita — só estes campos, nunca o objeto bruto recebido.
  return {
    ok: true,
    data: {
      departureId,
      quantity,
      customer: {
        name,
        email,
        phone,
        ...(cpfRaw ? { cpf: cpfRaw } : {}),
      },
    },
  };
}
