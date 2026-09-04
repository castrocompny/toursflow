import 'server-only';
import type { BookingRequestInput, NauticFlowBookingResponseData } from '@/types/booking';
import { BookingApiError, isKnownBookingErrorCode } from './booking-errors';
import { getBookingErrorMessage } from './booking-error-messages';

/**
 * Único ponto que fala com `POST /api/marketplace/bookings` do NauticFlow.
 * Lê `TOURSFLOW_API_SECRET` — por isso `import 'server-only'` no topo:
 * qualquer tentativa de importar este arquivo de um componente client
 * quebra o build, em vez de vazar o segredo silenciosamente.
 *
 * Deliberadamente não reaproveita `data/sources/nauticflow-source.ts`
 * (leitura pública de catálogo, sem segredo) — são responsabilidades e
 * superfícies de risco diferentes, mesmo consumindo a mesma API.
 *
 * Nunca faz fallback para sucesso simulado. Se a configuração estiver
 * ausente ou o NauticFlow estiver fora do ar, lança `BookingApiError` —
 * nunca retorna uma reserva fake.
 *
 * `clientKey` (ver `toursflow-client-key.ts`) é sempre calculada pelo
 * chamador a partir do IP confiável da requisição — nunca aceita do
 * navegador. Este módulo só a repassa no header, não a calcula.
 */

const TIMEOUT_MS = 8000;

interface NauticFlowBookingSuccessEnvelope {
  data: NauticFlowBookingResponseData;
}

interface NauticFlowBookingErrorEnvelope {
  error?: { code?: string };
}

export interface NauticFlowBookingResult {
  data: NauticFlowBookingResponseData;
  status: number;
  /** Espelha o header `Idempotency-Replayed: true` do NauticFlow, quando presente. */
  replayed: boolean;
}

export async function createNauticFlowBooking(
  input: BookingRequestInput,
  idempotencyKey: string,
  clientKey: string,
): Promise<NauticFlowBookingResult> {
  const baseUrl = process.env.NAUTICFLOW_API_URL;
  const secret = process.env.TOURSFLOW_API_SECRET;

  if (!baseUrl || !secret) {
    // Nunca cair para um segredo fake nem simular sucesso — falha segura.
    throw new BookingApiError(500, 'INTERNAL_ERROR', 'Configuração do serviço de reservas ausente.');
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/marketplace/bookings`;

  const payload = {
    departureId: input.departureId,
    quantity: input.quantity,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      phone: input.customer.phone,
      ...(input.customer.cpf ? { cpf: input.customer.cpf } : {}),
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'Idempotency-Key': idempotencyKey,
        'X-ToursFlow-Client-Key': clientKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    throw new BookingApiError(
      503,
      'BOOKING_SERVICE_UNAVAILABLE',
      'Não foi possível se comunicar com o serviço de reservas agora.',
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let body: unknown = null;
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch (error) {
      throw new BookingApiError(503, 'BOOKING_SERVICE_UNAVAILABLE', 'Resposta inválida do serviço de reservas.', {
        cause: error,
      });
    }
  }

  if (!response.ok) {
    const errorBody = (body ?? {}) as NauticFlowBookingErrorEnvelope;
    const code = isKnownBookingErrorCode(errorBody.error?.code) ? errorBody.error!.code! : 'INTERNAL_ERROR';
    // Preserva o status e o código do NauticFlow (nunca vira 500 genérico),
    // mas NUNCA o `message` bruto do upstream — só o catálogo local seguro,
    // pelo mesmo `code` já saneado por whitelist. O NauticFlow é um sistema
    // externo: uma mensagem verbosa/de debug dele (stack, SQL, hostname
    // interno) nunca deve alcançar o navegador.
    throw new BookingApiError(response.status, code, getBookingErrorMessage(code));
  }

  const success = body as NauticFlowBookingSuccessEnvelope | null;
  if (!success?.data) {
    throw new BookingApiError(503, 'BOOKING_SERVICE_UNAVAILABLE', 'Resposta inesperada do serviço de reservas.');
  }

  return {
    data: success.data,
    status: response.status,
    replayed: response.headers.get('idempotency-replayed') === 'true',
  };
}
