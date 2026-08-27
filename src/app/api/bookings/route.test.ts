import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingApiError } from '@/lib/booking-errors';
import { createToursFlowClientKey } from '@/lib/toursflow-client-key';

vi.mock('@/lib/nauticflow-bookings', () => ({
  createNauticFlowBooking: vi.fn(),
}));

const { createNauticFlowBooking } = await import('@/lib/nauticflow-bookings');
const { POST } = await import('./route');

const VALID_UUID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const TEST_SECRET = 'segredo-fake-para-teste-de-rota';
const TEST_IP = '203.0.113.10';

const validPayload = {
  departureId: VALID_UUID,
  quantity: 2,
  customer: { name: 'Turista Teste', email: 'turista@example.com', phone: '+55 22 99999-0000' },
};

// `client-ip.ts`/`toursflow-client-key.ts` NÃO são mockados aqui de
// propósito: são funções puras e determinísticas (sem rede), então rodar
// o cálculo real do HMAC prova de verdade que a rota encadeia
// IP -> normalização -> HMAC -> header de saída, em vez de só confiar em
// um mock ecoando o que eu configurei.
function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://toursflow.com.br/api/bookings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'toursflow.com.br',
      'x-forwarded-for': TEST_IP, // fora da Vercel nos testes -> fallback local
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/bookings', () => {
  beforeEach(() => {
    vi.mocked(createNauticFlowBooking).mockReset();
    vi.stubEnv('TOURSFLOW_API_SECRET', TEST_SECRET);
    vi.stubEnv('VERCEL', ''); // garante o caminho de fallback local nos testes
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejeita sem Idempotency-Key com 400, sem chamar o NauticFlow', async () => {
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('rejeita payload inválido com 400, sem chamar o NauticFlow', async () => {
    const res = await POST(makeRequest({ quantity: 2 }, { 'idempotency-key': IDEMPOTENCY_KEY }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('rejeita origem cross-site (Origin diferente do Host) com 403', async () => {
    const request = new Request('https://toursflow.com.br/api/bookings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'toursflow.com.br',
        origin: 'https://site-malicioso.exemplo',
        'idempotency-key': IDEMPOTENCY_KEY,
      },
      body: JSON.stringify(validPayload),
    });
    const res = await POST(request);
    expect(res.status).toBe(403);
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('nunca repassa campos extras/maliciosos ao client do NauticFlow', async () => {
    vi.mocked(createNauticFlowBooking).mockResolvedValue({
      status: 201,
      replayed: false,
      data: {
        bookingId: 'b1',
        status: 'pendente',
        holdExpiresAt: '2026-09-01T12:15:00Z',
        tour: { slug: 't', name: 'T' },
        departure: { id: VALID_UUID, departsAt: '2026-09-01T12:00:00Z' },
        quantity: 2,
        priceType: 'por_pessoa',
        priceCents: 15000,
        totalCents: 30000,
        currency: 'BRL',
      },
    });

    const maliciousPayload = { ...validPayload, companyId: 'outro', price: 1, source: 'admin' };
    await POST(makeRequest(maliciousPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(createNauticFlowBooking).toHaveBeenCalledTimes(1);
    const [sentInput] = vi.mocked(createNauticFlowBooking).mock.calls[0];
    expect(Object.keys(sentInput)).toEqual(['departureId', 'quantity', 'customer']);
  });

  it('NauticFlow 201 -> ToursFlow 201', async () => {
    vi.mocked(createNauticFlowBooking).mockResolvedValue({
      status: 201,
      replayed: false,
      data: {
        bookingId: 'b1',
        status: 'pendente',
        holdExpiresAt: '2026-09-01T12:15:00Z',
        tour: { slug: 't', name: 'T' },
        departure: { id: VALID_UUID, departsAt: '2026-09-01T12:00:00Z' },
        quantity: 2,
        priceType: 'por_pessoa',
        priceCents: 15000,
        totalCents: 30000,
        currency: 'BRL',
      },
    });
    const res = await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.bookingId).toBe('b1');
  });

  it('NauticFlow 200 replay -> ToursFlow 200 + header Idempotency-Replayed', async () => {
    vi.mocked(createNauticFlowBooking).mockResolvedValue({
      status: 200,
      replayed: true,
      data: {
        bookingId: 'b1',
        status: 'pendente',
        holdExpiresAt: '2026-09-01T12:15:00Z',
        tour: { slug: 't', name: 'T' },
        departure: { id: VALID_UUID, departsAt: '2026-09-01T12:00:00Z' },
        quantity: 2,
        priceType: 'por_pessoa',
        priceCents: 15000,
        totalCents: 30000,
        currency: 'BRL',
      },
    });
    const res = await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Idempotency-Replayed')).toBe('true');
  });

  it('erro do NauticFlow (INSUFFICIENT_CAPACITY, 409) é preservado', async () => {
    vi.mocked(createNauticFlowBooking).mockRejectedValue(
      new BookingApiError(409, 'INSUFFICIENT_CAPACITY', 'Sem vagas suficientes.'),
    );
    const res = await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('INSUFFICIENT_CAPACITY');
  });

  it('falha de comunicação com o NauticFlow (timeout/offline) nunca vira sucesso mockado', async () => {
    vi.mocked(createNauticFlowBooking).mockRejectedValue(
      new BookingApiError(503, 'BOOKING_SERVICE_UNAVAILABLE', 'Não foi possível se comunicar com o serviço de reservas agora.'),
    );
    const res = await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('BOOKING_SERVICE_UNAVAILABLE');
  });

  it('erro inesperado (não BookingApiError) vira 500 genérico, sem stack trace no corpo', async () => {
    vi.mocked(createNauticFlowBooking).mockRejectedValue(new Error('algo interno explodiu'));
    const res = await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('algo interno explodiu');
  });

  it('envia X-ToursFlow-Client-Key (64 hex) calculada server-side ao NauticFlow', async () => {
    vi.mocked(createNauticFlowBooking).mockResolvedValue({
      status: 201,
      replayed: false,
      data: {
        bookingId: 'b1',
        status: 'pendente',
        holdExpiresAt: '2026-09-01T12:15:00Z',
        tour: { slug: 't', name: 'T' },
        departure: { id: VALID_UUID, departsAt: '2026-09-01T12:00:00Z' },
        quantity: 2,
        priceType: 'por_pessoa',
        priceCents: 15000,
        totalCents: 30000,
        currency: 'BRL',
      },
    });

    await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(createNauticFlowBooking).toHaveBeenCalledTimes(1);
    const [, sentIdempotencyKey, sentClientKey] = vi.mocked(createNauticFlowBooking).mock.calls[0];
    expect(sentIdempotencyKey).toBe(IDEMPOTENCY_KEY); // Idempotency-Key segue intacta
    expect(sentClientKey).toMatch(/^[a-f0-9]{64}$/);
    // Precisa ser exatamente o HMAC real do IP de teste com o secret de teste —
    // não um valor arbitrário qualquer que só pareça um hash.
    expect(sentClientKey).toBe(createToursFlowClientKey(TEST_IP));
  });

  it('IGNORA X-ToursFlow-Client-Key enviado pelo navegador — sempre recalcula server-side', async () => {
    vi.mocked(createNauticFlowBooking).mockResolvedValue({
      status: 201,
      replayed: false,
      data: {
        bookingId: 'b1',
        status: 'pendente',
        holdExpiresAt: '2026-09-01T12:15:00Z',
        tour: { slug: 't', name: 'T' },
        departure: { id: VALID_UUID, departsAt: '2026-09-01T12:00:00Z' },
        quantity: 2,
        priceType: 'por_pessoa',
        priceCents: 15000,
        totalCents: 30000,
        currency: 'BRL',
      },
    });

    const forjada = 'f'.repeat(64);
    await POST(
      makeRequest(validPayload, {
        'idempotency-key': IDEMPOTENCY_KEY,
        'x-toursflow-client-key': forjada,
      }),
    );

    const [, , sentClientKey] = vi.mocked(createNauticFlowBooking).mock.calls[0];
    expect(sentClientKey).not.toBe(forjada);
    expect(sentClientKey).toBe(createToursFlowClientKey(TEST_IP));
  });

  it('sem IP confiável disponível -> 503 CLIENT_IP_UNAVAILABLE, sem chamar o NauticFlow, sem mencionar IP/Vercel/header', async () => {
    const request = new Request('https://toursflow.com.br/api/bookings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'toursflow.com.br',
        'idempotency-key': IDEMPOTENCY_KEY,
        // propositalmente sem x-forwarded-for
      },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(request);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('CLIENT_IP_UNAVAILABLE');
    expect(body.error.message.toLowerCase()).not.toContain('ip');
    expect(body.error.message.toLowerCase()).not.toContain('vercel');
    expect(body.error.message.toLowerCase()).not.toContain('header');
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('IP do visitante nunca aparece na resposta ao navegador', async () => {
    vi.mocked(createNauticFlowBooking).mockResolvedValue({
      status: 201,
      replayed: false,
      data: {
        bookingId: 'b1',
        status: 'pendente',
        holdExpiresAt: '2026-09-01T12:15:00Z',
        tour: { slug: 't', name: 'T' },
        departure: { id: VALID_UUID, departsAt: '2026-09-01T12:00:00Z' },
        quantity: 2,
        priceType: 'por_pessoa',
        priceCents: 15000,
        totalCents: 30000,
        currency: 'BRL',
      },
    });
    const res = await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));
    const rawBody = await res.text();
    expect(rawBody).not.toContain(TEST_IP);
    expect(JSON.stringify([...res.headers.entries()])).not.toContain(TEST_IP);
  });

  it('erro do NauticFlow (RATE_LIMITED, 429) é preservado', async () => {
    vi.mocked(createNauticFlowBooking).mockRejectedValue(
      new BookingApiError(429, 'RATE_LIMITED', 'Muitas tentativas, tente novamente mais tarde.'),
    );
    const res = await POST(makeRequest(validPayload, { 'idempotency-key': IDEMPOTENCY_KEY }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});
