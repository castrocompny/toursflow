import 'server-only';
import type { NauticFlowBookingPaymentView } from '@/types/payment';
import { PaymentApiError, isKnownPaymentErrorCode } from './payment-errors';

/**
 * Único ponto que fala com o payment endpoint do NauticFlow. Lê
 * `TOURSFLOW_API_SECRET` — por isso `import 'server-only'` no topo,
 * mesmo padrão de `nauticflow-bookings.ts`.
 *
 * Nunca envia `amount`: o NauticFlow sempre recalcula o valor a partir da
 * reserva (`bookingId`) — o ToursFlow não é e nunca foi autoridade de
 * preço. Nunca faz fallback para sucesso simulado.
 */

const TIMEOUT_MS = 8000;

interface NauticFlowPaymentSuccessEnvelope {
  data: NauticFlowBookingPaymentView;
}

interface NauticFlowPaymentErrorEnvelope {
  error?: { code?: string; message?: string };
}

async function callNauticFlow(
  method: 'GET' | 'POST',
  url: string,
  secret: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<NauticFlowBookingPaymentView> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    throw new PaymentApiError(
      503,
      'PAYMENT_SERVICE_UNAVAILABLE',
      'Não foi possível se comunicar com o serviço de pagamento agora.',
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let responseBody: unknown = null;
  if (contentType.includes('application/json')) {
    try {
      responseBody = await response.json();
    } catch (error) {
      throw new PaymentApiError(503, 'PAYMENT_SERVICE_UNAVAILABLE', 'Resposta inválida do serviço de pagamento.', {
        cause: error,
      });
    }
  }

  if (!response.ok) {
    const errorBody = (responseBody ?? {}) as NauticFlowPaymentErrorEnvelope;
    const code = isKnownPaymentErrorCode(errorBody.error?.code) ? errorBody.error!.code! : 'INTERNAL_ERROR';
    const message = errorBody.error?.message || 'Não foi possível processar o pagamento.';
    // Preserva o status e o código do NauticFlow — nunca vira 500 genérico.
    throw new PaymentApiError(response.status, code, message);
  }

  const success = responseBody as NauticFlowPaymentSuccessEnvelope | null;
  if (!success?.data) {
    throw new PaymentApiError(503, 'PAYMENT_SERVICE_UNAVAILABLE', 'Resposta inesperada do serviço de pagamento.');
  }

  return success.data;
}

function requireConfig(): { baseUrl: string; secret: string } {
  const baseUrl = process.env.NAUTICFLOW_API_URL;
  const secret = process.env.TOURSFLOW_API_SECRET;
  if (!baseUrl || !secret) {
    throw new PaymentApiError(500, 'INTERNAL_ERROR', 'Configuração do serviço de pagamento ausente.');
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), secret };
}

/** `POST /api/marketplace/bookings/{bookingId}/payment` — body sempre `{ paymentMethod: "pix" }`, nunca `amount`. */
export async function createNauticFlowPayment(
  bookingId: string,
  idempotencyKey: string,
  clientKey: string,
): Promise<NauticFlowBookingPaymentView> {
  const { baseUrl, secret } = requireConfig();
  const url = `${baseUrl}/api/marketplace/bookings/${bookingId}/payment`;

  return callNauticFlow(
    'POST',
    url,
    secret,
    {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'X-ToursFlow-Client-Key': clientKey,
    },
    { paymentMethod: 'pix' },
  );
}

/** `GET /api/marketplace/bookings/{bookingId}` — somente leitura, sem Idempotency-Key. */
export async function getNauticFlowBookingStatus(
  bookingId: string,
  clientKey: string,
): Promise<NauticFlowBookingPaymentView> {
  const { baseUrl, secret } = requireConfig();
  const url = `${baseUrl}/api/marketplace/bookings/${bookingId}`;

  return callNauticFlow('GET', url, secret, {
    'X-ToursFlow-Client-Key': clientKey,
  });
}
