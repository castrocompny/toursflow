import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentApiError } from './payment-errors';
import { getPaymentErrorMessage } from './payment-error-messages';
import { createNauticFlowPayment, getNauticFlowBookingStatus } from './nauticflow-payments';

const BOOKING_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const CLIENT_KEY = 'a'.repeat(64);

function jsonResponse(body: unknown, init: { status: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('nauticflow-payments', () => {
  beforeEach(() => {
    vi.stubEnv('NAUTICFLOW_API_URL', 'https://nauticflow.exemplo.test');
    vi.stubEnv('TOURSFLOW_API_SECRET', 'segredo-de-teste-nao-real');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('createNauticFlowPayment: falha com INTERNAL_ERROR (sem chamar fetch) quando config ausente', async () => {
    vi.stubEnv('TOURSFLOW_API_SECRET', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(createNauticFlowPayment(BOOKING_ID, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('createNauticFlowPayment: monta URL/headers/body corretos e nunca expõe o segredo na resposta', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse(
          { data: { bookingId: BOOKING_ID, bookingStatus: 'pending', holdExpiresAt: '2026-09-01T12:15:00Z', quantity: 1, priceCents: 15000, totalCents: 15000, payment: { status: 'pending', method: 'pix' } } },
          { status: 201 },
        );
      }),
    );

    const result = await createNauticFlowPayment(BOOKING_ID, IDEMPOTENCY_KEY, CLIENT_KEY);

    expect(capturedUrl).toBe(`https://nauticflow.exemplo.test/api/marketplace/bookings/${BOOKING_ID}/payment`);
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer segredo-de-teste-nao-real');
    expect(headers['Idempotency-Key']).toBe(IDEMPOTENCY_KEY);
    expect(headers['X-ToursFlow-Client-Key']).toBe(CLIENT_KEY);
    expect(JSON.parse(String(capturedInit.body))).toEqual({ paymentMethod: 'pix' });
    expect(result.bookingId).toBe(BOOKING_ID);
    expect(JSON.stringify(result)).not.toContain('segredo-de-teste-nao-real');
  });

  it('getNauticFlowBookingStatus: GET sem Idempotency-Key, mesmo client-key', async () => {
    let capturedInit: RequestInit = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedInit = init;
        return jsonResponse({ data: { bookingId: BOOKING_ID, bookingStatus: 'pending', holdExpiresAt: '2026-09-01T12:15:00Z', quantity: 1, priceCents: 15000, totalCents: 15000, payment: { status: 'paid', method: 'pix' } } }, { status: 200 });
      }),
    );

    await getNauticFlowBookingStatus(BOOKING_ID, CLIENT_KEY);

    expect(capturedInit.method).toBe('GET');
    expect((capturedInit.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined();
    expect((capturedInit.headers as Record<string, string>)['X-ToursFlow-Client-Key']).toBe(CLIENT_KEY);
  });

  it('falha de rede (fetch rejeita) vira PAYMENT_SERVICE_UNAVAILABLE, nunca sucesso mockado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }),
    );
    await expect(createNauticFlowPayment(BOOKING_ID, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 503,
      code: 'PAYMENT_SERVICE_UNAVAILABLE',
    });
  });

  it('código de erro desconhecido do upstream cai em INTERNAL_ERROR, não quebra', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'ALGO_NOVO_NUNCA_VISTO' } }, { status: 500 })),
    );
    await expect(createNauticFlowPayment(BOOKING_ID, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });

  it('achado de auditoria corrigido: mensagem arbitrária do upstream (code conhecido) NUNCA chega ao navegador — só a mensagem local curada', async () => {
    const upstreamSecretLookingMessage = 'INTERNAL DATABASE PASSWORD abc123';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'PAYMENT_ALREADY_ACTIVE', message: upstreamSecretLookingMessage } }, { status: 409 }),
      ),
    );
    await expect(createNauticFlowPayment(BOOKING_ID, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 409,
      code: 'PAYMENT_ALREADY_ACTIVE',
      message: getPaymentErrorMessage('PAYMENT_ALREADY_ACTIVE'),
    });
    try {
      await createNauticFlowPayment(BOOKING_ID, IDEMPOTENCY_KEY, CLIENT_KEY);
    } catch (error) {
      expect((error as PaymentApiError).message).not.toContain(upstreamSecretLookingMessage);
      expect((error as PaymentApiError).message).not.toContain('PASSWORD');
    }
  });

  it('achado de auditoria corrigido: código desconhecido + mensagem arbitrária do upstream vira INTERNAL_ERROR com mensagem genérica segura, nunca o texto arbitrário', async () => {
    const upstreamSecretLookingMessage = 'INTERNAL DATABASE PASSWORD abc123';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'ALGO_NUNCA_VISTO', message: upstreamSecretLookingMessage } }, { status: 500 }),
      ),
    );
    await expect(getNauticFlowBookingStatus(BOOKING_ID, CLIENT_KEY)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: getPaymentErrorMessage('INTERNAL_ERROR'),
    });
    try {
      await getNauticFlowBookingStatus(BOOKING_ID, CLIENT_KEY);
    } catch (error) {
      expect((error as PaymentApiError).message).not.toContain(upstreamSecretLookingMessage);
    }
  });
});
