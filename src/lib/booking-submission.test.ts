import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBookingPayload, submitBooking } from './booking-submission';
import type { CustomerFormValues } from './customer-form';

const DEPARTURE_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';

describe('buildBookingPayload', () => {
  const values: CustomerFormValues = {
    name: '  Turista Teste  ',
    email: '  Turista@Example.com  ',
    phone: '(11) 91234-5678',
    cpf: '111.444.777-35',
  };

  it('monta só os campos do contrato (whitelist), nunca price/total/priceType/companyId/status/etc.', () => {
    const payload = buildBookingPayload(DEPARTURE_ID, 2, values);
    expect(Object.keys(payload)).toEqual(['departureId', 'quantity', 'customer']);
    expect(Object.keys(payload.customer)).toEqual(['name', 'email', 'phone', 'cpf']);
  });

  it('normaliza name/email com trim', () => {
    const payload = buildBookingPayload(DEPARTURE_ID, 2, values);
    expect(payload.customer.name).toBe('Turista Teste');
    expect(payload.customer.email).toBe('Turista@Example.com');
  });

  it('normaliza telefone para só dígitos, nunca a máscara visual', () => {
    const payload = buildBookingPayload(DEPARTURE_ID, 2, values);
    expect(payload.customer.phone).toBe('11912345678');
  });

  it('normaliza CPF para só dígitos, nunca a máscara visual', () => {
    const payload = buildBookingPayload(DEPARTURE_ID, 2, values);
    expect(payload.customer.cpf).toBe('11144477735');
  });

  it('CPF ausente/vazio: a chave nem aparece no payload (campo opcional)', () => {
    const payload = buildBookingPayload(DEPARTURE_ID, 2, { ...values, cpf: '' });
    expect(payload.customer).not.toHaveProperty('cpf');
  });

  it('departureId e quantity vêm exatamente dos argumentos, nunca inventados', () => {
    const payload = buildBookingPayload(DEPARTURE_ID, 3, values);
    expect(payload.departureId).toBe(DEPARTURE_ID);
    expect(payload.quantity).toBe(3);
  });
});

describe('submitBooking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const validPayload = buildBookingPayload(DEPARTURE_ID, 2, {
    name: 'Turista Teste',
    email: 'turista@example.com',
    phone: '11912345678',
    cpf: '',
  });
  const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';

  function mockFetchOnce(response: { ok: boolean; status: number; body: unknown; headers?: Record<string, string> }) {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
      headers: { get: (key: string) => response.headers?.[key.toLowerCase()] ?? null },
    });
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  }

  it('chama POST /api/bookings com Content-Type e Idempotency-Key corretos', async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      status: 201,
      body: {
        data: {
          bookingId: 'b1',
          status: 'pendente',
          holdExpiresAt: '2026-09-01T12:15:00Z',
          tour: { slug: 't', name: 'T' },
          departure: { id: DEPARTURE_ID, departsAt: '2026-09-01T12:00:00Z' },
          quantity: 2,
          priceType: 'per_person',
          priceCents: 15000,
          totalCents: 30000,
          currency: 'BRL',
        },
      },
    });

    await submitBooking(validPayload, IDEMPOTENCY_KEY);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/bookings');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Idempotency-Key']).toBe(IDEMPOTENCY_KEY);
    expect(JSON.parse(init.body)).toEqual(validPayload);
  });

  it('201 -> ok:true, replayed:false', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      body: {
        data: {
          bookingId: 'b1',
          status: 'pendente',
          holdExpiresAt: '2026-09-01T12:15:00Z',
          tour: { slug: 't', name: 'T' },
          departure: { id: DEPARTURE_ID, departsAt: '2026-09-01T12:00:00Z' },
          quantity: 2,
          priceType: 'per_person',
          priceCents: 15000,
          totalCents: 30000,
          currency: 'BRL',
        },
      },
    });

    const result = await submitBooking(validPayload, IDEMPOTENCY_KEY);
    expect(result).toEqual({
      ok: true,
      replayed: false,
      data: expect.objectContaining({ bookingId: 'b1' }),
    });
  });

  it('200 + Idempotency-Replayed: true -> ok:true, replayed:true (tratado como sucesso, não erro)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      headers: { 'idempotency-replayed': 'true' },
      body: {
        data: {
          bookingId: 'b1',
          status: 'pendente',
          holdExpiresAt: '2026-09-01T12:15:00Z',
          tour: { slug: 't', name: 'T' },
          departure: { id: DEPARTURE_ID, departsAt: '2026-09-01T12:00:00Z' },
          quantity: 2,
          priceType: 'per_person',
          priceCents: 15000,
          totalCents: 30000,
          currency: 'BRL',
        },
      },
    });

    const result = await submitBooking(validPayload, IDEMPOTENCY_KEY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.replayed).toBe(true);
  });

  const errorCases: Array<{ status: number; code: string }> = [
    { status: 409, code: 'IDEMPOTENCY_CONFLICT' },
    { status: 409, code: 'INSUFFICIENT_CAPACITY' },
    { status: 422, code: 'PRICE_TYPE_NOT_SELLABLE' },
    { status: 429, code: 'RATE_LIMITED' },
    { status: 503, code: 'BOOKING_SERVICE_UNAVAILABLE' },
    { status: 503, code: 'CLIENT_IP_UNAVAILABLE' },
  ];

  it.each(errorCases)('$status $code -> ok:false com o code e mensagem seguros', async ({ status, code }) => {
    mockFetchOnce({ ok: false, status, body: { error: { code, message: 'mensagem bruta do backend' } } });

    const result = await submitBooking(validPayload, IDEMPOTENCY_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
      // Mensagem exibida vem do catálogo curado, nunca o texto bruto do backend.
      expect(result.message).not.toBe('mensagem bruta do backend');
    }
  });

  it('código de erro desconhecido/malformado cai em INTERNAL_ERROR, nunca lança', async () => {
    mockFetchOnce({ ok: false, status: 500, body: { error: { code: 'ALGO_NUNCA_VISTO' } } });
    const result = await submitBooking(validPayload, IDEMPOTENCY_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INTERNAL_ERROR');
  });

  it('fetch rejeita (rede/timeout) -> NETWORK_ERROR, nunca assume falha silenciosa nem lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const result = await submitBooking(validPayload, IDEMPOTENCY_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.message.toLowerCase()).not.toContain('undefined');
    }
  });

  it('resposta 201 mas corpo não é JSON válido -> INTERNAL_ERROR seguro, sem lançar', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => {
        throw new SyntaxError('corpo inválido');
      },
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await submitBooking(validPayload, IDEMPOTENCY_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INTERNAL_ERROR');
  });
});
