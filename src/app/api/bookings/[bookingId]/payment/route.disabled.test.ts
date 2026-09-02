import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testa o comportamento REAL de produção — `PAYMENTS_UI_ENABLED` não é
 * mockada aqui (ao contrário de `route.test.ts`), então este arquivo
 * exercita exatamente o valor que está no código-fonte hoje (`false`).
 *
 * A UI já não oferece nenhum caminho até esta rota (`PixPayment` só é
 * renderizado quando a flag está ligada) — mas isso não é uma proteção
 * de segurança. Este arquivo prova que a PRÓPRIA ROTA falha fechada,
 * independente da UI: um `curl`/`fetch` direto, mesmo com todos os
 * headers corretos, não chega ao NauticFlow.
 */

vi.mock('@/lib/nauticflow-payments', () => ({
  createNauticFlowPayment: vi.fn(),
  getNauticFlowBookingStatus: vi.fn(),
}));

const { createNauticFlowPayment, getNauticFlowBookingStatus } = await import('@/lib/nauticflow-payments');
const { PAYMENTS_UI_ENABLED } = await import('@/lib/feature-flags');
const { POST, GET } = await import('./route');

const BOOKING_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const TEST_SECRET = 'segredo-fake-para-teste-de-rota-payment-disabled';
const TEST_IP = '203.0.113.30';

function makeWellFormedPostRequest(headers: Record<string, string> = {}) {
  return new Request(`https://toursflow.com.br/api/bookings/${BOOKING_ID}/payment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'toursflow.com.br',
      'x-forwarded-for': TEST_IP,
      'idempotency-key': IDEMPOTENCY_KEY,
      // Origin correto de propósito — provando que a trava não depende
      // de nenhum OUTRO check falhar antes dela.
      origin: 'https://toursflow.com.br',
      ...headers,
    },
    body: JSON.stringify({ paymentMethod: 'pix' }),
  });
}

function makeWellFormedGetRequest(headers: Record<string, string> = {}) {
  return new Request(`https://toursflow.com.br/api/bookings/${BOOKING_ID}/payment`, {
    method: 'GET',
    headers: {
      host: 'toursflow.com.br',
      'x-forwarded-for': TEST_IP,
      origin: 'https://toursflow.com.br',
      ...headers,
    },
  });
}

describe('trava server-side: PAYMENTS_UI_ENABLED (valor real do código, não mockado)', () => {
  beforeEach(() => {
    vi.mocked(createNauticFlowPayment).mockReset();
    vi.mocked(getNauticFlowBookingStatus).mockReset();
    vi.stubEnv('TOURSFLOW_API_SECRET', TEST_SECRET);
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a flag no código-fonte está false hoje (pré-condição deste teste)', () => {
    expect(PAYMENTS_UI_ENABLED).toBe(false);
  });

  it('POST bem-formado (headers e body corretos) falha fechado, sem chamar o NauticFlow', async () => {
    const res = await POST(makeWellFormedPostRequest(), { params: { bookingId: BOOKING_ID } });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_PROVIDER_NOT_ENABLED');
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
  });

  it('POST não vaza detalhe técnico nem menciona a flag/variável de ambiente na mensagem', async () => {
    const res = await POST(makeWellFormedPostRequest(), { params: { bookingId: BOOKING_ID } });
    const body = await res.json();
    const message = body.error.message.toLowerCase();
    expect(message).not.toContain('payments_ui_enabled');
    expect(message).not.toContain('flag');
    expect(message).not.toContain('env');
  });

  it('GET bem-formado também falha fechado, sem chamar o NauticFlow (decisão documentada: GET não tem uso legítimo com a flag off)', async () => {
    const res = await GET(makeWellFormedGetRequest(), { params: { bookingId: BOOKING_ID } });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_PROVIDER_NOT_ENABLED');
    expect(getNauticFlowBookingStatus).not.toHaveBeenCalled();
  });

  it('a trava é a PRIMEIRA checagem — nem uma origem inválida chega a ser avaliada antes dela (mesmo resultado, mesmo motivo)', async () => {
    const request = makeWellFormedPostRequest({ origin: 'https://site-malicioso.exemplo' });
    const res = await POST(request, { params: { bookingId: BOOKING_ID } });

    // Se a checagem de Origin rodasse primeiro, o erro seria 403
    // INVALID_REQUEST. Continua sendo a trava de pagamento — prova que
    // ela roda antes de qualquer outra validação.
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_PROVIDER_NOT_ENABLED');
  });

  it('nenhum efeito colateral: zero chamada a createNauticFlowPayment/getNauticFlowBookingStatus em nenhum cenário deste arquivo', () => {
    expect(createNauticFlowPayment).not.toHaveBeenCalled();
    expect(getNauticFlowBookingStatus).not.toHaveBeenCalled();
  });

  it('mesmo sem TOURSFLOW_API_SECRET configurado, a trava de pagamento ainda é o motivo da rejeição (fail-closed em profundidade)', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VERCEL', '');
    // Propositalmente sem TOURSFLOW_API_SECRET.
    const res = await POST(makeWellFormedPostRequest(), { params: { bookingId: BOOKING_ID } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_PROVIDER_NOT_ENABLED');
  });
});
