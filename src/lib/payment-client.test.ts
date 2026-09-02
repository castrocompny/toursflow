import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotImplementedPaymentClient, PaymentClientError, PaymentNotAvailableError, ToursFlowPaymentClient } from './payment-client';

describe('NotImplementedPaymentClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createPixPayment sempre rejeita com PaymentNotAvailableError, nunca chama rede', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = new NotImplementedPaymentClient();
    await expect(client.createPixPayment('booking-1', 'idem-1')).rejects.toBeInstanceOf(PaymentNotAvailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getBookingPaymentStatus sempre rejeita com PaymentNotAvailableError, nunca chama rede', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = new NotImplementedPaymentClient();
    await expect(client.getBookingPaymentStatus('booking-1')).rejects.toBeInstanceOf(PaymentNotAvailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ToursFlowPaymentClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const successView = {
    bookingId: 'bk-1',
    bookingStatus: 'pending',
    holdExpiresAt: '2026-09-01T12:15:00Z',
    quantity: 1,
    priceCents: 15000,
    totalCents: 15000,
    payment: { status: 'pending', method: 'pix' },
    pix: { payload: 'codigo', expirationDate: '2026-09-01T12:15:00Z' },
  };

  function mockFetch(response: { ok: boolean; status: number; body: unknown }) {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: response.ok, status: response.status, json: async () => response.body });
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  }

  it('createPixPayment chama POST /api/bookings/{id}/payment com Idempotency-Key e paymentMethod:pix, nunca amount', async () => {
    const fetchSpy = mockFetch({ ok: true, status: 201, body: { data: successView } });
    const client = new ToursFlowPaymentClient();

    const result = await client.createPixPayment('bk-1', 'idem-1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/bookings/bk-1/payment');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('idem-1');
    const sentBody = JSON.parse(init.body);
    expect(sentBody).toEqual({ paymentMethod: 'pix' });
    expect(sentBody).not.toHaveProperty('amount');
    expect(result.bookingId).toBe('bk-1');
  });

  it('getBookingPaymentStatus chama GET /api/bookings/{id}/payment', async () => {
    const fetchSpy = mockFetch({ ok: true, status: 200, body: { data: successView } });
    const client = new ToursFlowPaymentClient();

    await client.getBookingPaymentStatus('bk-1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/bookings/bk-1/payment');
    expect(init.method).toBe('GET');
  });

  it('erro do servidor vira PaymentClientError com o code preservado e mensagem segura', async () => {
    mockFetch({ ok: false, status: 409, body: { error: { code: 'PAYMENT_ALREADY_ACTIVE', message: 'raw interno' } } });
    const client = new ToursFlowPaymentClient();

    await expect(client.createPixPayment('bk-1', 'idem-1')).rejects.toMatchObject({
      name: 'PaymentClientError',
      code: 'PAYMENT_ALREADY_ACTIVE',
    });
  });

  it('código de erro desconhecido cai em INTERNAL_ERROR, nunca lança erro não tratado', async () => {
    mockFetch({ ok: false, status: 500, body: { error: { code: 'ALGO_NUNCA_VISTO' } } });
    const client = new ToursFlowPaymentClient();

    await expect(client.createPixPayment('bk-1', 'idem-1')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('fetch rejeita (rede) -> PaymentClientError NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const client = new ToursFlowPaymentClient();

    await expect(client.getBookingPaymentStatus('bk-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
