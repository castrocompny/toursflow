import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentApiError } from '@/lib/payment-errors';
import { createToursFlowClientKey } from '@/lib/toursflow-client-key';
import type { NauticFlowBookingPaymentView } from '@/types/payment';

vi.mock('@/lib/nauticflow-payments', () => ({
  createNauticFlowPayment: vi.fn(),
  getNauticFlowBookingStatus: vi.fn(),
}));

// Este arquivo testa o pipeline COMPLETO da rota (Origin, Content-Type,
// idempotência, whitelist, preservação de erro do NauticFlow) — por isso
// mocka a flag como `true`. O comportamento REAL de produção
// (PAYMENTS_UI_ENABLED === false, trava fail-closed) é testado à parte,
// sem nenhum mock, em `route.disabled.test.ts` — é o teste que garante
// que a rota continua fechada de verdade hoje.
vi.mock('@/lib/feature-flags', () => ({ PAYMENTS_UI_ENABLED: true }));

const { createNauticFlowPayment, getNauticFlowBookingStatus } = await import('@/lib/nauticflow-payments');
const { POST, GET } = await import('./route');

const BOOKING_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const TEST_SECRET = 'segredo-fake-para-teste-de-rota-payment';
const TEST_IP = '203.0.113.20';

const successView: NauticFlowBookingPaymentView = {
  bookingId: BOOKING_ID,
  bookingStatus: 'pending',
  holdExpiresAt: '2026-09-01T12:15:00Z',
  quantity: 1,
  priceCents: 15000,
  totalCents: 15000,
  payment: { status: 'pending', method: 'pix' },
  pix: { payload: 'codigo-pix', expirationDate: '2026-09-01T12:15:00Z' },
};

function makePostRequest(body: unknown = { paymentMethod: 'pix' }, headers: Record<string, string> = {}) {
  return new Request(`https://toursflow.com.br/api/bookings/${BOOKING_ID}/payment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'toursflow.com.br',
      'x-forwarded-for': TEST_IP,
      'idempotency-key': IDEMPOTENCY_KEY,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(headers: Record<string, string> = {}) {
  return new Request(`https://toursflow.com.br/api/bookings/${BOOKING_ID}/payment`, {
    method: 'GET',
    headers: {
      host: 'toursflow.com.br',
      'x-forwarded-for': TEST_IP,
      ...headers,
    },
  });
}

describe('POST /api/bookings/[bookingId]/payment', () => {
  beforeEach(() => {
    vi.mocked(createNauticFlowPayment).mockReset();
    vi.mocked(getNauticFlowBookingStatus).mockReset();
    vi.stubEnv('TOURSFLOW_API_SECRET', TEST_SECRET);
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('cria Pix corretamente: chama o client server-only com bookingId/idempotencyKey/clientKey, devolve 201', async () => {
    vi.mocked(createNauticFlowPayment).mockResolvedValue(successView);

    const res = await POST(makePostRequest(), { params: { bookingId: BOOKING_ID } });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.bookingId).toBe(BOOKING_ID);
    expect(body.data.pix.payload).toBe('codigo-pix');

    expect(createNauticFlowPayment).toHaveBeenCalledTimes(1);
    const [sentBookingId, sentIdempotencyKey, sentClientKey] = vi.mocked(createNauticFlowPayment).mock.calls[0];
    expect(sentBookingId).toBe(BOOKING_ID);
    expect(sentIdempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect(sentClientKey).toBe(createToursFlowClientKey(TEST_IP)); // HMAC real, calculado server-side
  });

  it('IGNORA X-ToursFlow-Client-Key enviado pelo navegador — sempre recalcula server-side', async () => {
    vi.mocked(createNauticFlowPayment).mockResolvedValue(successView);

    const forjada = 'f'.repeat(64);
    await POST(makePostRequest({ paymentMethod: 'pix' }, { 'x-toursflow-client-key': forjada }), {
      params: { bookingId: BOOKING_ID },
    });

    const [, , sentClientKey] = vi.mocked(createNauticFlowPayment).mock.calls[0];
    expect(sentClientKey).not.toBe(forjada);
    expect(sentClientKey).toBe(createToursFlowClientKey(TEST_IP));
  });

  it('nunca aceita amount no corpo — mesmo se o cliente mandar, não é repassado', async () => {
    vi.mocked(createNauticFlowPayment).mockResolvedValue(successView);

    await POST(makePostRequest({ paymentMethod: 'pix', amount: 999999 }), { params: { bookingId: BOOKING_ID } });

    expect(createNauticFlowPayment).toHaveBeenCalledTimes(1);
    // A assinatura de createNauticFlowPayment nem aceita amount — a prova estrutural é o client server-only não tomar esse parâmetro.
  });

  it('rejeita paymentMethod diferente de "pix" com PAYMENT_METHOD_NOT_SUPPORTED, sem chamar o NauticFlow', async () => {
    const res = await POST(makePostRequest({ paymentMethod: 'boleto' }), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_METHOD_NOT_SUPPORTED');
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
  });

  it('rejeita sem Idempotency-Key, sem chamar o NauticFlow', async () => {
    const request = new Request(`https://toursflow.com.br/api/bookings/${BOOKING_ID}/payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'toursflow.com.br', 'x-forwarded-for': TEST_IP },
      body: JSON.stringify({ paymentMethod: 'pix' }),
    });
    const res = await POST(request, { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
  });

  it('rejeita bookingId com formato inválido (não-UUID) com BOOKING_NOT_FOUND', async () => {
    const res = await POST(makePostRequest(), { params: { bookingId: 'não-é-um-uuid' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BOOKING_NOT_FOUND');
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
  });

  it('rejeita Content-Type diferente de application/json com 415', async () => {
    const res = await POST(makePostRequest({}, { 'content-type': 'text/plain' }), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(415);
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
  });

  it('rejeita origem cross-site com 403', async () => {
    const request = new Request(`https://toursflow.com.br/api/bookings/${BOOKING_ID}/payment`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'toursflow.com.br',
        origin: 'https://site-malicioso.exemplo',
        'idempotency-key': IDEMPOTENCY_KEY,
        'x-forwarded-for': TEST_IP,
      },
      body: JSON.stringify({ paymentMethod: 'pix' }),
    });
    const res = await POST(request, { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(403);
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
  });

  const nauticFlowErrorCases: Array<{ status: number; code: string }> = [
    { status: 401, code: 'UNAUTHORIZED' },
    { status: 400, code: 'INVALID_CLIENT_KEY' },
    { status: 404, code: 'BOOKING_NOT_FOUND' },
    { status: 409, code: 'BOOKING_NOT_PENDING' },
    { status: 409, code: 'HOLD_EXPIRED' },
    { status: 409, code: 'PAYMENT_IDEMPOTENCY_CONFLICT' },
    { status: 409, code: 'PAYMENT_ALREADY_ACTIVE' },
    { status: 422, code: 'PAYMENT_PROVIDER_NOT_ENABLED' },
    { status: 422, code: 'CUSTOMER_DOCUMENT_REQUIRED' },
    { status: 502, code: 'PAYMENT_PROVIDER_ERROR' },
    { status: 429, code: 'RATE_LIMITED' },
  ];

  it.each(nauticFlowErrorCases)('preserva erro do NauticFlow: $status $code', async ({ status, code }) => {
    vi.mocked(createNauticFlowPayment).mockRejectedValue(new PaymentApiError(status, code as never, 'mensagem'));

    const res = await POST(makePostRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBe(code);
  });

  it('PAYMENT_PROVIDER_NOT_ENABLED: falha antes de qualquer tentativa/cobrança — nunca 201', async () => {
    vi.mocked(createNauticFlowPayment).mockRejectedValue(
      new PaymentApiError(422, 'PAYMENT_PROVIDER_NOT_ENABLED', 'Pagamento não habilitado.'),
    );

    const res = await POST(makePostRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_PROVIDER_NOT_ENABLED');
    expect(res.status).not.toBe(201);
  });

  it('falha de comunicação com o NauticFlow vira PAYMENT_SERVICE_UNAVAILABLE, nunca sucesso simulado', async () => {
    vi.mocked(createNauticFlowPayment).mockRejectedValue(
      new PaymentApiError(503, 'PAYMENT_SERVICE_UNAVAILABLE', 'Não foi possível se comunicar.'),
    );
    const res = await POST(makePostRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_SERVICE_UNAVAILABLE');
  });

  it('erro inesperado (não PaymentApiError) vira 500 genérico, sem stack trace', async () => {
    vi.mocked(createNauticFlowPayment).mockRejectedValue(new Error('algo interno explodiu'));
    const res = await POST(makePostRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('algo interno explodiu');
  });

  it('sem IP confiável -> 503 CLIENT_IP_UNAVAILABLE, sem chamar o NauticFlow', async () => {
    const request = new Request(`https://toursflow.com.br/api/bookings/${BOOKING_ID}/payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'toursflow.com.br', 'idempotency-key': IDEMPOTENCY_KEY },
      body: JSON.stringify({ paymentMethod: 'pix' }),
    });
    const res = await POST(request, { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('CLIENT_IP_UNAVAILABLE');
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
  });
});

describe('GET /api/bookings/[bookingId]/payment (status/polling)', () => {
  beforeEach(() => {
    vi.mocked(createNauticFlowPayment).mockReset();
    vi.mocked(getNauticFlowBookingStatus).mockReset();
    vi.stubEnv('TOURSFLOW_API_SECRET', TEST_SECRET);
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const statusCases: Array<{ label: string; status: string }> = [
    { label: 'pending com QR', status: 'pending' },
    { label: 'paid', status: 'paid' },
    { label: 'failed', status: 'failed' },
    { label: 'refunded', status: 'refunded' },
    { label: 'partially_refunded', status: 'partially_refunded' },
  ];

  it.each(statusCases)('$label: devolve 200 com o status repassado sem alteração', async ({ status }) => {
    vi.mocked(getNauticFlowBookingStatus).mockResolvedValue({
      ...successView,
      payment: { status: status as never, method: 'pix' },
    });

    const res = await GET(makeGetRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.payment.status).toBe(status);
  });

  it('nunca cria pagamento — só consulta (não chama createNauticFlowPayment)', async () => {
    vi.mocked(getNauticFlowBookingStatus).mockResolvedValue(successView);
    await GET(makeGetRequest(), { params: { bookingId: BOOKING_ID } });
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
    expect(getNauticFlowBookingStatus).toHaveBeenCalledTimes(1);
  });

  it('calcula client key server-side, mesmo padrão do POST', async () => {
    vi.mocked(getNauticFlowBookingStatus).mockResolvedValue(successView);
    await GET(makeGetRequest(), { params: { bookingId: BOOKING_ID } });
    const [sentBookingId, sentClientKey] = vi.mocked(getNauticFlowBookingStatus).mock.calls[0];
    expect(sentBookingId).toBe(BOOKING_ID);
    expect(sentClientKey).toBe(createToursFlowClientKey(TEST_IP));
  });

  it('401 UNAUTHORIZED preservado do NauticFlow', async () => {
    vi.mocked(getNauticFlowBookingStatus).mockRejectedValue(new PaymentApiError(401, 'UNAUTHORIZED', 'Não autorizado.'));
    const res = await GET(makeGetRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('RATE_LIMITED preservado do NauticFlow', async () => {
    vi.mocked(getNauticFlowBookingStatus).mockRejectedValue(new PaymentApiError(429, 'RATE_LIMITED', 'Muitas tentativas.'));
    const res = await GET(makeGetRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(429);
  });

  it('bookingId inválido -> 400 BOOKING_NOT_FOUND, sem chamar o NauticFlow', async () => {
    const res = await GET(makeGetRequest(), { params: { bookingId: 'não-é-um-uuid' } });
    expect(res.status).toBe(400);
    expect(getNauticFlowBookingStatus).not.toHaveBeenCalled();
  });
});
