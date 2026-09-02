import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testa o comportamento REAL de produção — `BOOKING_CHECKOUT_ENABLED` não
 * é mockada aqui (ao contrário de `route.test.ts`), então este arquivo
 * exercita exatamente o valor que está no código-fonte hoje (`false`).
 *
 * `BookingReview` já não oferece nenhum caminho até esta rota
 * (`onConfirm` só é passado quando a flag está ligada) — mas isso não é
 * uma proteção de segurança. Este arquivo prova que a PRÓPRIA ROTA falha
 * fechada, independente da UI: um `curl`/`fetch` direto, mesmo com todos
 * os headers/body corretos, não chega ao NauticFlow, não cria hold.
 */

vi.mock('@/lib/nauticflow-bookings', () => ({
  createNauticFlowBooking: vi.fn(),
}));

const { createNauticFlowBooking } = await import('@/lib/nauticflow-bookings');
const { BOOKING_CHECKOUT_ENABLED } = await import('@/lib/feature-flags');
const { POST } = await import('./route');

const VALID_UUID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const IDEMPOTENCY_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const TEST_SECRET = 'segredo-fake-para-teste-de-rota-disabled';
const TEST_IP = '203.0.113.40';

const validPayload = {
  departureId: VALID_UUID,
  quantity: 2,
  customer: { name: 'Turista Teste', email: 'turista@example.com', phone: '+55 22 99999-0000' },
};

function makeWellFormedRequest(headers: Record<string, string> = {}) {
  return new Request('https://toursflow.com.br/api/bookings', {
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
    body: JSON.stringify(validPayload),
  });
}

describe('trava server-side: BOOKING_CHECKOUT_ENABLED (valor real do código, não mockado)', () => {
  beforeEach(() => {
    vi.mocked(createNauticFlowBooking).mockReset();
    vi.stubEnv('TOURSFLOW_API_SECRET', TEST_SECRET);
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a flag no código-fonte está false hoje (pré-condição deste teste)', () => {
    expect(BOOKING_CHECKOUT_ENABLED).toBe(false);
  });

  it('POST bem-formado (headers e body corretos) falha fechado, sem chamar o NauticFlow, sem criar hold', async () => {
    const res = await POST(makeWellFormedRequest());

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('BOOKING_CHECKOUT_NOT_ENABLED');
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('não vaza detalhe técnico nem menciona a flag/variável de ambiente na mensagem', async () => {
    const res = await POST(makeWellFormedRequest());
    const body = await res.json();
    const message = body.error.message.toLowerCase();
    expect(message).not.toContain('booking_checkout_enabled');
    expect(message).not.toContain('flag');
    expect(message).not.toContain('env');
  });

  it('a trava é a PRIMEIRA checagem — nem uma origem inválida chega a ser avaliada antes dela (mesmo resultado, mesmo motivo)', async () => {
    const res = await POST(makeWellFormedRequest({ origin: 'https://site-malicioso.exemplo' }));

    // Se a checagem de Origin rodasse primeiro, o erro seria 403
    // INVALID_REQUEST. Continua sendo a trava de checkout — prova que ela
    // roda antes de qualquer outra validação.
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('BOOKING_CHECKOUT_NOT_ENABLED');
  });

  it('nenhum efeito colateral: zero chamada a createNauticFlowBooking em nenhum cenário deste arquivo', () => {
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });

  it('mesmo sem TOURSFLOW_API_SECRET configurado, a trava de checkout ainda é o motivo da rejeição (fail-closed em profundidade)', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VERCEL', '');
    // Propositalmente sem TOURSFLOW_API_SECRET.
    const res = await POST(makeWellFormedRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('BOOKING_CHECKOUT_NOT_ENABLED');
  });

  it('mesmo sem IP confiável, a trava de checkout ainda é o motivo da rejeição (roda antes do cálculo de IP/HMAC)', async () => {
    const request = new Request('https://toursflow.com.br/api/bookings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'toursflow.com.br',
        'idempotency-key': IDEMPOTENCY_KEY,
        origin: 'https://toursflow.com.br',
        // propositalmente sem x-forwarded-for
      },
      body: JSON.stringify(validPayload),
    });
    const res = await POST(request);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('BOOKING_CHECKOUT_NOT_ENABLED');
    expect(createNauticFlowBooking).not.toHaveBeenCalled();
  });
});
