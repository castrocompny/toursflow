// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Departure } from '@/types';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

/**
 * Complementar a `BookingSelector.test.tsx` (que exercita o valor REAL de
 * `PAYMENTS_UI_ENABLED`, `false`, e prova que "Pagar com Pix" não
 * aparece). Este arquivo mocka a flag como `true` para testar o glue real
 * do fluxo de pagamento — mesmo padrão de arquivo separado já usado em
 * `route.test.ts`/`route.disabled.test.ts` (achado MEDIUM da revisão
 * final: `vi.mock()` se aplica ao arquivo inteiro, então misturar os dois
 * valores da flag num único arquivo quebraria o teste que depende do
 * valor real `false`).
 *
 * `BookingSelector` usa `ToursFlowPaymentClient` real (singleton de
 * módulo, não injetável) — a única forma de testar sem tocar
 * NauticFlow/Asaas é mockar `fetch` global, mesmo padrão já usado para
 * `/api/bookings` em `BookingSelector.test.tsx`.
 *
 * `BOOKING_CHECKOUT_ENABLED` também precisa ser mockada `true` aqui: sem
 * ela, a revisão nem mostra "Confirmar reserva" — não haveria como chegar
 * ao step de pagamento para testar o glue de `PAYMENTS_UI_ENABLED`.
 */
vi.mock('@/lib/feature-flags', () => ({ BOOKING_CHECKOUT_ENABLED: true, PAYMENTS_UI_ENABLED: true }));

const { BookingSelector } = await import('./BookingSelector');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const available: Departure = {
  id: 'dep-1',
  tourId: 'tour-1',
  departsAt: '2026-10-11T17:00:00+00:00',
  price: 150,
  priceType: 'per_person',
  availableSpots: 10,
  soldOut: false,
};

const BOOKING_ID = 'bk-real-1';

const successBookingData = {
  bookingId: BOOKING_ID,
  status: 'pendente',
  holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  tour: { slug: 't', name: 'T' },
  departure: { id: available.id, departsAt: available.departsAt },
  quantity: 1,
  priceType: 'per_person',
  priceCents: 15000,
  totalCents: 15000,
  currency: 'BRL',
};

function paymentView(status: 'pending' | 'paid') {
  return {
    bookingId: BOOKING_ID,
    bookingStatus: 'pending',
    holdExpiresAt: successBookingData.holdExpiresAt,
    quantity: 1,
    priceCents: 15000,
    totalCents: 15000,
    payment: { status, method: 'pix' as const },
    ...(status === 'pending'
      ? { pix: { payload: 'codigo-pix-teste', expirationDate: successBookingData.holdExpiresAt } }
      : {}),
  };
}

/**
 * Roteia por URL/método — mesmo `fetch` global usado por `submitBooking()`
 * e `ToursFlowPaymentClient`, nunca o NauticFlow/Asaas real. Qualquer
 * chamada fora das três esperadas lança, para nunca passar batido uma
 * chamada indevida.
 */
function makeRoutedFetch() {
  const fn = vi.fn(async (url: string, init?: any) => {
    const method = init?.method ?? 'GET';

    if (url === '/api/bookings' && method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ data: successBookingData }), headers: { get: () => null } };
    }
    if (url === `/api/bookings/${BOOKING_ID}/payment` && method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ data: paymentView('pending') }) };
    }
    if (url === `/api/bookings/${BOOKING_ID}/payment` && method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ data: paymentView('paid') }) };
    }
    throw new Error(`fetch não esperado nesta suíte: ${method} ${url}`);
  });
  return fn;
}

function paymentPostCalls(fetchSpy: ReturnType<typeof makeRoutedFetch>) {
  return fetchSpy.mock.calls.filter(([url, init]) => url === `/api/bookings/${BOOKING_ID}/payment` && init?.method === 'POST');
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fillAndReview() {
  const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
  fireEvent.click(departureButton);
  fireEvent.click(screen.getByRole('button', { name: /continuar reserva/i }));
  fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Turista Teste' } });
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'turista@example.com' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11912345678' } });
  fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));
}

describe('BookingSelector — integração do fluxo de pagamento (PAYMENTS_UI_ENABLED mockada true)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    routerRefresh.mockClear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('cadeia completa: seleção -> confirmação (bookingResult) -> Pagar com Pix -> pending -> paid (polling) -> voucher (paymentResult)', async () => {
    const fetchSpy = makeRoutedFetch();
    vi.stubGlobal('fetch', fetchSpy);

    const { rerender } = render(<BookingSelector departures={[available]} />);
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: /confirmar reserva/i }));
    await flush();

    // bookingResult existe antes de payment-pix: STEP 4 mostra o bookingId real do backend.
    expect(screen.getByText(BOOKING_ID)).toBeTruthy();
    const payButton = screen.getByRole('button', { name: /pagar com pix/i });

    fireEvent.click(payButton);
    await flush();

    // Entrou em payment-pix -> PixPayment criou o Pix (POST .../payment), com Idempotency-Key real.
    expect(paymentPostCalls(fetchSpy)).toHaveLength(1);
    const idempotencyKeySent = paymentPostCalls(fetchSpy)[0][1].headers['Idempotency-Key'];
    expect(idempotencyKeySent).toMatch(UUID_RE);

    // voucher (paymentResult) não existe ainda — pagamento continua pending.
    expect(screen.queryByText(/pagamento recebido/i)).toBeNull();
    expect(screen.getByText(/pague com pix/i)).toBeTruthy();

    // Re-render do pai com props idênticas não pode gerar um novo POST nem uma nova key
    // (paymentIdempotencyKey vive em useState — resolvePaymentIdempotencyKey só roda no clique).
    rerender(<BookingSelector departures={[available]} />);
    await flush();
    expect(paymentPostCalls(fetchSpy)).toHaveLength(1);
    expect(paymentPostCalls(fetchSpy)[0][1].headers['Idempotency-Key']).toBe(idempotencyKeySent);

    // Poll (5s) devolve status paid -> onPaid -> step voucher.
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // paymentResult existe: BookingVoucher renderizado com o bookingId da view de pagamento.
    expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
    expect(screen.getByText(BOOKING_ID)).toBeTruthy();
    expect(screen.queryByText(/pague com pix/i)).toBeNull();

    // Nunca recriado no polling: um único POST de criação durante todo o fluxo.
    expect(paymentPostCalls(fetchSpy)).toHaveLength(1);
  });

  /**
   * Codex review (30/09/2026, HIGH): booking criado + falha ao criar o Pix
   * não pode deixar o turista preso. Cada resposta do POST/GET de
   * pagamento é programada em fila; o resto segue `makeRoutedFetch`.
   */
  function makeScriptedFetch(script: { post?: Array<() => unknown>; get?: Array<() => unknown> }) {
    const posts = [...(script.post ?? [])];
    const gets = [...(script.get ?? [])];
    const base = makeRoutedFetch();
    return vi.fn(async (url: string, init?: any) => {
      const method = init?.method ?? 'GET';
      if (url === `/api/bookings/${BOOKING_ID}/payment` && method === 'POST' && posts.length) return posts.shift()!();
      if (url === `/api/bookings/${BOOKING_ID}/payment` && method === 'GET' && gets.length) return gets.shift()!();
      return base(url, init);
    });
  }

  const ok = (data: unknown, status = 200) => () => ({ ok: true, status, json: async () => ({ data }) });
  const fail = (status: number, code: string) => () => ({ ok: false, status, json: async () => ({ error: { code } }) });
  const networkDown = () => () => Promise.reject(new TypeError('Failed to fetch'));

  function bookingPostCalls(fetchSpy: ReturnType<typeof vi.fn>) {
    return fetchSpy.mock.calls.filter(([url, init]) => url === '/api/bookings' && init?.method === 'POST');
  }
  function paymentCalls(fetchSpy: ReturnType<typeof vi.fn>, method: 'POST' | 'GET') {
    return fetchSpy.mock.calls.filter(
      ([url, init]) => url === `/api/bookings/${BOOKING_ID}/payment` && (init?.method ?? 'GET') === method,
    );
  }

  async function reachPixStep(fetchSpy: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} />);
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: /confirmar reserva/i }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /pagar com pix/i }));
    await flush();
  }

  it('POST do Pix falha (503 ambíguo): retry reaproveita bookingId e a MESMA key, sem novo booking, e segue até o voucher', async () => {
    const fetchSpy = makeScriptedFetch({ post: [fail(503, 'PAYMENT_SERVICE_UNAVAILABLE')] });
    await reachPixStep(fetchSpy);

    expect(screen.getByRole('alert').textContent).toMatch(/indisponível/i);
    expect(screen.getByText(/sua reserva continua guardada/i)).toBeTruthy();
    const firstKey = paymentCalls(fetchSpy, 'POST')[0][1].headers['Idempotency-Key'];

    fireEvent.click(screen.getByRole('button', { name: /tentar gerar pix novamente/i }));
    await flush();

    const posts = paymentCalls(fetchSpy, 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1][0]).toBe(`/api/bookings/${BOOKING_ID}/payment`);
    expect(posts[1][1].headers['Idempotency-Key']).toBe(firstKey); // replay, nunca cobrança nova
    expect(bookingPostCalls(fetchSpy)).toHaveLength(1);
    expect(screen.getByText(/pague com pix/i)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
    expect(bookingPostCalls(fetchSpy)).toHaveLength(1);
  });

  it('erro de rede na criação pode ser tentado de novo; clique repetido não duplica o POST', async () => {
    const fetchSpy = makeScriptedFetch({ post: [networkDown()] });
    await reachPixStep(fetchSpy);

    const retry = screen.getByRole('button', { name: /tentar gerar pix novamente/i });
    await act(async () => {
      fireEvent.click(retry);
      fireEvent.click(retry);
      fireEvent.click(retry);
    });
    await flush();

    expect(paymentCalls(fetchSpy, 'POST')).toHaveLength(2); // original + UM retry
    expect(screen.getByText(/pague com pix/i)).toBeTruthy();
  });

  it('PAYMENT_ALREADY_ACTIVE: não tenta criar outro; "Verificar pagamento" (GET) reaproveita o Pix ativo', async () => {
    const fetchSpy = makeScriptedFetch({ post: [fail(409, 'PAYMENT_ALREADY_ACTIVE')], get: [ok(paymentView('pending'))] });
    await reachPixStep(fetchSpy);

    expect(screen.getByRole('alert').textContent).toMatch(/já existe um pagamento em andamento/i);
    expect(screen.queryByRole('button', { name: /tentar gerar pix novamente/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /verificar pagamento/i }));
    await flush();

    expect(screen.getByTestId('pix-copy-paste').textContent).toBe('codigo-pix-teste');
    expect(paymentCalls(fetchSpy, 'POST')).toHaveLength(1);
    expect(bookingPostCalls(fetchSpy)).toHaveLength(1);
  });

  it('HOLD_EXPIRED: sem retry de criação; "Verificar pagamento" só faz GET e nunca cria cobrança', async () => {
    const pendingNoPix = { ...paymentView('pending'), pix: undefined };
    const fetchSpy = makeScriptedFetch({ post: [fail(422, 'HOLD_EXPIRED')], get: [ok(pendingNoPix)] });
    await reachPixStep(fetchSpy);

    expect(screen.getByRole('alert').textContent).toMatch(/tempo da sua reserva expirou/i);
    expect(screen.queryByRole('button', { name: /tentar gerar pix novamente/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /verificar pagamento/i }));
    await flush();

    expect(paymentCalls(fetchSpy, 'GET')).toHaveLength(1);
    expect(paymentCalls(fetchSpy, 'POST')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toMatch(/tempo da sua reserva expirou/i);
  });

  it('erro não recuperável (CUSTOMER_DOCUMENT_REQUIRED): só a mensagem, nenhuma ação que crie algo', async () => {
    const fetchSpy = makeScriptedFetch({ post: [fail(422, 'CUSTOMER_DOCUMENT_REQUIRED')] });
    await reachPixStep(fetchSpy);

    expect(screen.getByRole('alert').textContent).toMatch(/cpf/i);
    expect(screen.queryByRole('button', { name: /tentar gerar pix novamente/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /verificar pagamento/i })).toBeNull();
  });

  it('failed confirmado pelo servidor: "Gerar novo Pix" usa o mesmo booking com Idempotency-Key NOVA', async () => {
    const failedView = { ...paymentView('pending'), payment: { status: 'failed', method: 'pix' }, pix: undefined };
    const fetchSpy = makeScriptedFetch({ get: [ok(failedView)] });
    await reachPixStep(fetchSpy);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText(/não foi possível confirmar este pagamento/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /gerar novo pix/i }));
    await flush();

    const posts = paymentCalls(fetchSpy, 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1][1].headers['Idempotency-Key']).toMatch(UUID_RE);
    expect(posts[1][1].headers['Idempotency-Key']).not.toBe(posts[0][1].headers['Idempotency-Key']);
    expect(bookingPostCalls(fetchSpy)).toHaveLength(1);
    expect(screen.getByText(/pague com pix/i)).toBeTruthy();
  });
});

