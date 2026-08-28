import type { BookingRequestInput, NauticFlowBookingResponseData } from '@/types/booking';
import { isKnownBookingErrorCode } from '@/lib/booking-errors';
import type { CustomerFormValues } from '@/lib/customer-form';
import { normalizeCpf, normalizeEmail, normalizePhone } from '@/lib/customer-form';
import { NETWORK_ERROR_CODE, type ClientBookingErrorCode, getClientBookingErrorMessage } from '@/lib/booking-error-messages';

/**
 * Único ponto do navegador que chama `POST /api/bookings` (Fase 3). Monta
 * o payload por whitelist explícita — nunca `price`/`total`/`priceType`/
 * `companyId`/`operatorId`/`status`/`paymentStatus`/`discount`/
 * `commission`/`clientKey`, mesmo que algum dia apareçam em algum estado
 * do formulário — e normaliza os dados antes de enviar:
 *
 * - `name`/`email`: trim (`normalizeEmail` também baixa a caixa do
 *   domínio implicitamente ao comparar, mas não altera o valor salvo).
 * - `phone`/`cpf`: só dígitos (`normalizePhone`/`normalizeCpf`) — nunca a
 *   máscara visual (`(11) 91234-5678`) usada só para digitação/exibição.
 * - `cpf` ausente/vazio: a chave nem aparece no payload (campo opcional
 *   no contrato — `BookingCustomerInput.cpf?`).
 */
export function buildBookingPayload(
  departureId: string,
  quantity: number,
  customer: CustomerFormValues,
): BookingRequestInput {
  const cpfDigits = normalizeCpf(customer.cpf);
  return {
    departureId,
    quantity,
    customer: {
      name: customer.name.trim(),
      email: normalizeEmail(customer.email),
      phone: normalizePhone(customer.phone),
      ...(cpfDigits ? { cpf: cpfDigits } : {}),
    },
  };
}

export type BookingSubmissionResult =
  | { ok: true; data: NauticFlowBookingResponseData; replayed: boolean }
  | { ok: false; code: ClientBookingErrorCode; message: string };

interface NauticFlowBookingSuccessEnvelope {
  data: NauticFlowBookingResponseData;
}

interface BookingApiErrorEnvelope {
  error?: { code?: string };
}

/**
 * Chama `POST /api/bookings`. Nunca assume falha da reserva quando o
 * `fetch` rejeita sem resposta (timeout, rede caída) — pode ser que o
 * servidor já tenha criado a reserva antes da conexão cair; por isso essa
 * falha vira `NETWORK_ERROR`, não `INTERNAL_ERROR`, e o chamador deve
 * permitir retry com a MESMA Idempotency-Key (nunca gerar uma nova aqui).
 */
export async function submitBooking(
  input: BookingRequestInput,
  idempotencyKey: string,
): Promise<BookingSubmissionResult> {
  let response: Response;
  try {
    response = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, code: NETWORK_ERROR_CODE, message: getClientBookingErrorMessage(NETWORK_ERROR_CODE) };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: getClientBookingErrorMessage('INTERNAL_ERROR') };
  }

  if (!response.ok) {
    const rawCode = (body as BookingApiErrorEnvelope).error?.code;
    const code: ClientBookingErrorCode = isKnownBookingErrorCode(rawCode) ? rawCode : 'INTERNAL_ERROR';
    return { ok: false, code, message: getClientBookingErrorMessage(code) };
  }

  const success = body as NauticFlowBookingSuccessEnvelope;
  return {
    ok: true,
    data: success.data,
    replayed: response.headers.get('idempotency-replayed') === 'true',
  };
}
