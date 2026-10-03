import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/nauticflow-bookings', () => ({
  createNauticFlowBooking: vi.fn(),
}));

// Checkout com Pix ligado: o NauticFlow exige CPF válido para gerar o Pix
// (`CUSTOMER_DOCUMENT_REQUIRED`), então a rota recusa criar a reserva sem
// ele. Arquivo separado porque `vi.mock` vale para o arquivo inteiro (ver
// `route.test.ts`, com `PAYMENTS_UI_ENABLED: false`).
vi.mock('@/lib/feature-flags', () => ({ BOOKING_CHECKOUT_ENABLED: true, PAYMENTS_UI_ENABLED: true }));

const { createNauticFlowBooking } = await import('@/lib/nauticflow-bookings');
const { POST } = await import('./route');

const VALID_UUID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
// CPF de teste público com checksum válido — não pertence a ninguém real.
const TEST_CPF = '11144477735';

const basePayload = {
  departureId: VALID_UUID,
  quantity: 1,
  customer: { name: 'Turista Teste', email: 'turista@example.com', phone: '22999990000' },
};

function makeRequest(body: unknown) {
  return new Request('https://toursflow.com.br/api/bookings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'toursflow.com.br',
      'x-forwarded-for': '203.0.113.10',
      'idempotency-key': IDEMPOTENCY_KEY,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/bookings — CPF obrigatório com PAYMENTS_UI_ENABLED', () => {
  beforeEach(() => {
    vi.mocked(createNauticFlowBooking).mockReset();
    vi.stubEnv('TOURSFLOW_API_SECRET', 'segredo-fake-para-teste-de-rota');
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sem CPF: 400 INVALID_REQUEST e nenhuma reserva criada no NauticFlow', async () => {
    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_REQUEST');
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('CPF inválido (checksum): 400 e nenhuma reserva criada', async () => {
    const res = await POST(makeRequest({ ...basePayload, customer: { ...basePayload.customer, cpf: '12345678900' } }));
    expect(res.status).toBe(400);
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('CPF válido: segue para o NauticFlow com o mesmo CPF (só dígitos, sem perda)', async () => {
    vi.mocked(createNauticFlowBooking).mockResolvedValue({
      status: 201,
      replayed: false,
      data: {
        bookingId: 'b1',
        status: 'pendente',
        holdExpiresAt: '2026-09-01T12:15:00Z',
        tour: { slug: 't', name: 'T' },
        departure: { id: VALID_UUID, departsAt: '2026-09-01T12:00:00Z' },
        quantity: 1,
        priceType: 'por_pessoa',
        priceCents: 15000,
        totalCents: 15000,
        currency: 'BRL',
      },
    } as never);

    const res = await POST(makeRequest({ ...basePayload, customer: { ...basePayload.customer, cpf: TEST_CPF } }));

    expect(res.status).toBe(201);
    expect(createNauticFlowBooking).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createNauticFlowBooking).mock.calls[0][0].customer.cpf).toBe(TEST_CPF);
  });
});
