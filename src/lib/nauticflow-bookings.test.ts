import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingRequestInput } from '@/types/booking';
import { BookingApiError } from './booking-errors';
import { createNauticFlowBooking } from './nauticflow-bookings';

const input: BookingRequestInput = {
  departureId: '9c858901-8a57-4791-81fe-4c455b099bc9',
  quantity: 2,
  customer: { name: 'Turista Teste', email: 'turista@example.com', phone: '+55 22 99999-0000' },
};

const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const CLIENT_KEY = 'a'.repeat(64);

function jsonResponse(body: unknown, init: { status: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('createNauticFlowBooking', () => {
  beforeEach(() => {
    vi.stubEnv('NAUTICFLOW_API_URL', 'https://nauticflow.exemplo.test');
    vi.stubEnv('TOURSFLOW_API_SECRET', 'segredo-de-teste-nao-real');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falha com INTERNAL_ERROR (sem chamar fetch) quando TOURSFLOW_API_SECRET está ausente', async () => {
    vi.stubEnv('TOURSFLOW_API_SECRET', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falha com INTERNAL_ERROR quando NAUTICFLOW_API_URL está ausente', async () => {
    vi.stubEnv('NAUTICFLOW_API_URL', '');
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });

  it('monta a URL correta, envia o whitelist e nunca expõe o segredo na resposta', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse(
          {
            data: {
              bookingId: 'booking-1',
              status: 'pendente',
              holdExpiresAt: '2026-09-01T12:15:00Z',
              tour: { slug: 'teste', name: 'Teste' },
              departure: { id: input.departureId, departsAt: '2026-09-01T12:00:00Z' },
              quantity: 2,
              priceType: 'por_pessoa',
              priceCents: 15000,
              totalCents: 30000,
              currency: 'BRL',
            },
          },
          { status: 201 },
        );
      }),
    );

    const result = await createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY);

    expect(capturedUrl).toBe('https://nauticflow.exemplo.test/api/marketplace/bookings');
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer segredo-de-teste-nao-real');
    expect(headers['Idempotency-Key']).toBe(IDEMPOTENCY_KEY);
    expect(headers['X-ToursFlow-Client-Key']).toBe(CLIENT_KEY);
    const sentBody = JSON.parse(String(capturedInit.body));
    expect(sentBody).toEqual({
      departureId: input.departureId,
      quantity: 2,
      customer: input.customer,
    });

    expect(result.status).toBe(201);
    expect(result.replayed).toBe(false);
    expect(result.data.bookingId).toBe('booking-1');
    // A resposta nunca deve conter o segredo em nenhum campo.
    expect(JSON.stringify(result)).not.toContain('segredo-de-teste-nao-real');
  });

  it('trata URL com barra final sem duplicar a barra', async () => {
    vi.stubEnv('NAUTICFLOW_API_URL', 'https://nauticflow.exemplo.test/');
    let capturedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrl = String(url);
        return jsonResponse({ data: { bookingId: 'x' } }, { status: 201 });
      }),
    );
    await createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY).catch(() => {});
    expect(capturedUrl).toBe('https://nauticflow.exemplo.test/api/marketplace/bookings');
  });

  it('replay: status 200 + Idempotency-Replayed: true é preservado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { data: { bookingId: 'booking-1', status: 'pendente' } },
          { status: 200, headers: { 'idempotency-replayed': 'true' } },
        ),
      ),
    );
    const result = await createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY);
    expect(result.status).toBe(200);
    expect(result.replayed).toBe(true);
  });

  it('preserva status 409 + code INSUFFICIENT_CAPACITY', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'INSUFFICIENT_CAPACITY', message: 'Sem vagas suficientes.' } }, { status: 409 }),
      ),
    );
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_CAPACITY',
    });
  });

  it('preserva status 409 + code IDEMPOTENCY_CONFLICT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Conflito de idempotência.' } }, { status: 409 }),
      ),
    );
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('preserva status 422 + code PRICE_TYPE_NOT_SELLABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: { code: 'PRICE_TYPE_NOT_SELLABLE', message: 'Tipo de preço não vendável.' } },
          { status: 422 },
        ),
      ),
    );
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 422,
      code: 'PRICE_TYPE_NOT_SELLABLE',
    });
  });

  it('falha de rede (fetch rejeita) vira BOOKING_SERVICE_UNAVAILABLE, nunca sucesso mockado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }),
    );
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 503,
      code: 'BOOKING_SERVICE_UNAVAILABLE',
    });
  });

  it('timeout (AbortError) vira BOOKING_SERVICE_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      }),
    );
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toBeInstanceOf(BookingApiError);
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 503,
      code: 'BOOKING_SERVICE_UNAVAILABLE',
    });
  });

  it('preserva status 429 + code RATE_LIMITED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'RATE_LIMITED', message: 'Muitas tentativas, tente novamente mais tarde.' } }, { status: 429 }),
      ),
    );
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('código de erro desconhecido do upstream cai em INTERNAL_ERROR, não quebra', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'ALGO_NOVO_NUNCA_VISTO' } }, { status: 500 })),
    );
    await expect(createNauticFlowBooking(input, IDEMPOTENCY_KEY, CLIENT_KEY)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});
