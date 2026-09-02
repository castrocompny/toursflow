import type { NauticFlowBookingPaymentView } from '@/types/payment';
import {
  PAYMENT_NETWORK_ERROR_CODE,
  type ClientPaymentErrorCode,
  getClientPaymentErrorMessage,
} from '@/lib/payment-error-messages';
import { isKnownPaymentErrorCode } from '@/lib/payment-errors';

/**
 * Abstração do lado do navegador para o fluxo de pagamento — usada por
 * `PixPayment`/`BookingSelector`. `ToursFlowPaymentClient` (abaixo) é a
 * implementação real: chama SÓ as rotas do próprio ToursFlow
 * (`/api/bookings/[bookingId]/payment`), nunca o NauticFlow/Asaas
 * diretamente — o segredo e o cálculo de `X-ToursFlow-Client-Key`
 * continuam exclusivos do servidor (`src/lib/nauticflow-payments.ts`,
 * `import 'server-only'`).
 */
export interface PaymentClient {
  createPixPayment(bookingId: string, idempotencyKey: string): Promise<NauticFlowBookingPaymentView>;
  getBookingPaymentStatus(bookingId: string): Promise<NauticFlowBookingPaymentView>;
}

export class PaymentClientError extends Error {
  readonly code: ClientPaymentErrorCode;

  constructor(code: ClientPaymentErrorCode, message: string) {
    super(message);
    this.name = 'PaymentClientError';
    this.code = code;
  }
}

export class PaymentNotAvailableError extends Error {
  constructor() {
    super('Pagamento Pix ainda não está disponível.');
    this.name = 'PaymentNotAvailableError';
  }
}

/**
 * Client "não implementado" — nunca chama rede, falha explícito. Mantido
 * por compatibilidade/uso em contextos que precisem de um `PaymentClient`
 * garantidamente inerte (ex.: um teste que queira provar ausência de
 * chamada). `BookingSelector` usa `ToursFlowPaymentClient` (abaixo) desde
 * que o contrato real foi confirmado — a proteção contra uso real em
 * produção é `PAYMENTS_UI_ENABLED`, não mais este client.
 */
export class NotImplementedPaymentClient implements PaymentClient {
  async createPixPayment(_bookingId: string, _idempotencyKey: string): Promise<NauticFlowBookingPaymentView> {
    throw new PaymentNotAvailableError();
  }

  async getBookingPaymentStatus(_bookingId: string): Promise<NauticFlowBookingPaymentView> {
    throw new PaymentNotAvailableError();
  }
}

interface PaymentSuccessEnvelope {
  data: NauticFlowBookingPaymentView;
}

interface PaymentErrorEnvelope {
  error?: { code?: string };
}

async function parseResponse(response: Response): Promise<NauticFlowBookingPaymentView> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PaymentClientError('INTERNAL_ERROR', getClientPaymentErrorMessage('INTERNAL_ERROR'));
  }

  if (!response.ok) {
    const rawCode = (body as PaymentErrorEnvelope).error?.code;
    const code: ClientPaymentErrorCode = isKnownPaymentErrorCode(rawCode) ? rawCode : 'INTERNAL_ERROR';
    throw new PaymentClientError(code, getClientPaymentErrorMessage(code));
  }

  return (body as PaymentSuccessEnvelope).data;
}

/**
 * Implementação real de `PaymentClient` — chama só
 * `/api/bookings/{bookingId}/payment` (POST para criar, GET para
 * consultar status/polling), sempre same-origin. Nunca envia `amount`;
 * nunca lê/conhece `TOURSFLOW_API_SECRET`.
 */
export class ToursFlowPaymentClient implements PaymentClient {
  async createPixPayment(bookingId: string, idempotencyKey: string): Promise<NauticFlowBookingPaymentView> {
    let response: Response;
    try {
      response = await fetch(`/api/bookings/${bookingId}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ paymentMethod: 'pix' }),
      });
    } catch {
      throw new PaymentClientError(PAYMENT_NETWORK_ERROR_CODE, getClientPaymentErrorMessage(PAYMENT_NETWORK_ERROR_CODE));
    }
    return parseResponse(response);
  }

  async getBookingPaymentStatus(bookingId: string): Promise<NauticFlowBookingPaymentView> {
    let response: Response;
    try {
      response = await fetch(`/api/bookings/${bookingId}/payment`, { method: 'GET' });
    } catch {
      throw new PaymentClientError(PAYMENT_NETWORK_ERROR_CODE, getClientPaymentErrorMessage(PAYMENT_NETWORK_ERROR_CODE));
    }
    return parseResponse(response);
  }
}
