// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Departure } from '@/types';
import { BOOKING_RECOVERY_STORAGE_KEY } from '@/lib/booking-recovery';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

/**
 * Achado HIGH do Codex (02/10/2026): reload no meio do checkout perdia a
 * reserva/pagamento (só em estado React). Recuperação via `sessionStorage`
 * (só referências opacas) + GET autoritativo — nunca POST automático.
 * Flags mockadas ON, mesmo padrão de `BookingSelector.payment.test.tsx`.
 */
vi.mock('@/lib/feature-flags', () => ({ BOOKING_CHECKOUT_ENABLED: true, PAYMENTS_UI_ENABLED: true }));

const { BookingSelector } = await import('./BookingSelector');

const BOOKING_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const TOUR_SLUG = 'passeio-teste';
const SAVED_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// CPF de teste público com checksum válido — não pertence a ninguém real.
const TEST_CPF = '111.444.777-35';

const available: Departure = {
  id: 'dep-1',
  tourId: 'tour-1',
  departsAt: '2026-10-11T17:00:00+00:00',
  price: 150,
  priceType: 'per_person',
  availableSpots: 10,
  soldOut: false,
};

const holdExpiresAt = () => new Date(Date.now() + 15 * 60 * 1000).toISOString();

function view(
  payment: null | 'pending' | 'paid' | 'failed',
  withPix = payment === 'pending',
  hold: string = holdExpiresAt(),
) {
  return {
    bookingId: BOOKING_ID,
    bookingStatus: payment === 'paid' ? 'confirmada' : 'pendente',
    holdExpiresAt: hold,
    quantity: 1,
    priceCents: 15000,
    totalCents: 15000,
    payment: payment ? { status: payment, method: 'pix' as const } : null,
    ...(withPix ? { pix: { payload: 'codigo-pix-recuperado', expirationDate: holdExpiresAt() } } : {}),
  };
}

const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => ({ data }), headers: { get: () => null } });
const fail = (status: number, code: string) => ({ ok: false, status, json: async () => ({ error: { code } }) });

/** `get`: fila de respostas do GET de status; POSTs de reserva/pagamento respondem sucesso, mas os testes provam quando NÃO são chamados. */
function makeFetch(gets: Array<() => unknown> = [], bookingId = BOOKING_ID) {
  const queue = [...gets];
  return vi.fn(async (url: string, init?: any) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/bookings' && method === 'POST') {
      return ok(
        {
          bookingId,
          status: 'pendente',
          holdExpiresAt: holdExpiresAt(),
          tour: { slug: 't', name: 'T' },
          departure: { id: available.id, departsAt: available.departsAt },
          quantity: 1,
          priceType: 'per_person',
          priceCents: 15000,
          totalCents: 15000,
          currency: 'BRL',
        },
        201,
      );
    }
    if (url === `/api/bookings/${bookingId}/payment` && method === 'POST') return ok({ ...view('pending'), bookingId }, 201);
    if (url === `/api/bookings/${bookingId}/payment` && method === 'GET') {
      const next = queue.shift();
      if (!next) return ok({ ...view('pending'), bookingId });
      return next();
    }
    throw new Error(`fetch não esperado: ${method} ${url}`);
  });
}

function calls(fetchSpy: ReturnType<typeof makeFetch>, url: string, method: string) {
  return fetchSpy.mock.calls.filter(([u, init]) => u === url && (init?.method ?? 'GET') === method);
}
const bookingPosts = (f: ReturnType<typeof makeFetch>) => calls(f, '/api/bookings', 'POST');
const paymentPosts = (f: ReturnType<typeof makeFetch>) => calls(f, `/api/bookings/${BOOKING_ID}/payment`, 'POST');
const statusGets = (f: ReturnType<typeof makeFetch>) => calls(f, `/api/bookings/${BOOKING_ID}/payment`, 'GET');

/** Registro v3: uma entrada por bookingId; acrescenta sem apagar as existentes. */
function saveRecovery(state: Record<string, unknown>) {
  const raw = window.sessionStorage.getItem(BOOKING_RECOVERY_STORAGE_KEY);
  const registry = raw ? JSON.parse(raw) : { version: 3, bookings: {} };
  const entry: Record<string, unknown> = { tourSlug: TOUR_SLUG, departsAt: available.departsAt, paymentIdempotencyKey: null, ...state };
  registry.bookings[entry.bookingId as string] = entry;
  window.sessionStorage.setItem(BOOKING_RECOVERY_STORAGE_KEY, JSON.stringify(registry));
}
function savedRecovery(bookingId = BOOKING_ID) {
  const raw = window.sessionStorage.getItem(BOOKING_RECOVERY_STORAGE_KEY);
  return raw ? (JSON.parse(raw).bookings?.[bookingId] ?? null) : null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function bookAndOpenPix() {
  const departureButton = within(screen.getByRole('list')).getAllByRole('button').find((el) => el.getAttribute('aria-pressed') !== null)!;
  fireEvent.click(departureButton);
  fireEvent.click(screen.getByRole('button', { name: /continuar reserva/i }));
  fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Turista Teste' } });
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'turista@example.com' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11912345678' } });
  fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: TEST_CPF } });
  fireEvent.click(screen.getByRole('button', { name: /revisar reserva/i }));
  fireEvent.click(screen.getByRole('button', { name: /confirmar reserva/i }));
  await flush();
}

describe('BookingSelector — recuperação depois de reload (sem POST automático)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('grava só referências opacas assim que a reserva é criada, e a key ANTES do POST do Pix — nunca PII', async () => {
    const fetchSpy = makeFetch();
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await bookAndOpenPix();

    expect(savedRecovery()).toEqual({
      bookingId: BOOKING_ID,
      tourSlug: TOUR_SLUG,
      departsAt: available.departsAt,
      paymentIdempotencyKey: null,
    });

    fireEvent.click(screen.getByRole('button', { name: /pagar com pix/i }));
    await flush();

    const sentKey = paymentPosts(fetchSpy)[0][1].headers['Idempotency-Key'];
    expect(savedRecovery().paymentIdempotencyKey).toBe(sentKey);
    const raw = window.sessionStorage.getItem(BOOKING_RECOVERY_STORAGE_KEY)!;
    expect(raw).not.toMatch(/Turista|turista@example|11912345678|11144477735|111\.444|codigo-pix|15000/);
    expect(window.sessionStorage.length).toBe(1);
  });

  it('reload com Pix pendente: GET restaura o QR existente, sem POST de reserva nem de Pix, e paid tardio leva ao voucher com a MESMA key', async () => {
    const first = makeFetch();
    vi.stubGlobal('fetch', first);
    const { unmount } = render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await bookAndOpenPix();
    fireEvent.click(screen.getByRole('button', { name: /pagar com pix/i }));
    await flush();
    const keyBeforeReload = savedRecovery().paymentIdempotencyKey;
    unmount(); // "reload"

    const afterReload = makeFetch([() => ok(view('pending')), () => ok(view('paid', false))]);
    vi.stubGlobal('fetch', afterReload);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(screen.getByTestId('pix-copy-paste').textContent).toBe('codigo-pix-recuperado');
    expect(bookingPosts(afterReload)).toHaveLength(0);
    expect(paymentPosts(afterReload)).toHaveLength(0);
    expect(statusGets(afterReload)).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
    expect(paymentPosts(afterReload)).toHaveLength(0);
    expect(savedRecovery().paymentIdempotencyKey).toBe(keyBeforeReload);
  });

  it('reload depois de pago: GET devolve paid e o voucher reaparece; referência continua salva', async () => {
    saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
    const fetchSpy = makeFetch([() => ok(view('paid', false))]);
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
    expect(screen.getByText(BOOKING_ID)).toBeTruthy();
    expect(bookingPosts(fetchSpy)).toHaveLength(0);
    expect(paymentPosts(fetchSpy)).toHaveLength(0);
    expect(savedRecovery()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /fazer outra reserva/i }));
    expect(savedRecovery()).toBeNull();
    expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
  });

  it('reload antes de iniciar o Pix: volta à confirmação; só o clique em "Pagar com Pix" cria o pagamento', async () => {
    saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
    const fetchSpy = makeFetch([() => ok(view(null))]);
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(screen.getByText(BOOKING_ID)).toBeTruthy();
    expect(screen.getByRole('button', { name: /pagar com pix/i })).toBeTruthy();
    expect(paymentPosts(fetchSpy)).toHaveLength(0);
    expect(bookingPosts(fetchSpy)).toHaveLength(0);
  });

  it('reload com tentativa failed: mostra a falha; "Gerar novo Pix" (ação explícita) usa key NOVA no mesmo booking', async () => {
    saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: SAVED_KEY });
    const fetchSpy = makeFetch([() => ok(view('failed', false))]);
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(screen.getByText(/não foi possível confirmar este pagamento/i)).toBeTruthy();
    expect(paymentPosts(fetchSpy)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /gerar novo pix/i }));
    await flush();

    const posts = paymentPosts(fetchSpy);
    expect(posts).toHaveLength(1);
    expect(posts[0][1].headers['Idempotency-Key']).toMatch(UUID_RE);
    expect(posts[0][1].headers['Idempotency-Key']).not.toBe(SAVED_KEY);
    expect(savedRecovery().paymentIdempotencyKey).toBe(posts[0][1].headers['Idempotency-Key']);
    expect(bookingPosts(fetchSpy)).toHaveLength(0);
  });

  it('erro de rede no GET: mantém a referência, não cria nada, e "Verificar novamente" (GET) recupera', async () => {
    saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: SAVED_KEY });
    const fetchSpy = makeFetch([() => Promise.reject(new TypeError('Failed to fetch')), () => ok(view('pending'))]);
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(screen.getByRole('alert').textContent).toMatch(/não foi possível verificar sua reserva agora/i);
    expect(savedRecovery()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /verificar novamente/i }));
    await flush();

    expect(screen.getByTestId('pix-copy-paste')).toBeTruthy();
    expect(statusGets(fetchSpy)).toHaveLength(2);
    expect(paymentPosts(fetchSpy)).toHaveLength(0);
    expect(bookingPosts(fetchSpy)).toHaveLength(0);
  });

  it('BOOKING_NOT_FOUND: limpa só a referência e volta ao fluxo normal, sem POST', async () => {
    saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
    const fetchSpy = makeFetch([() => fail(404, 'BOOKING_NOT_FOUND')]);
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(savedRecovery()).toBeNull();
    expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
    expect(bookingPosts(fetchSpy)).toHaveLength(0);
    expect(paymentPosts(fetchSpy)).toHaveLength(0);
  });

  it('storage corrompido: fail-safe — fluxo normal, chave removida, nenhuma requisição', async () => {
    window.sessionStorage.setItem(BOOKING_RECOVERY_STORAGE_KEY, '{lixo');
    const fetchSpy = makeFetch();
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
    expect(window.sessionStorage.getItem(BOOKING_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reserva de outro passeio (tourSlug diferente): ignorada e preservada, nenhuma requisição', async () => {
    saveRecovery({ bookingId: BOOKING_ID, tourSlug: 'outro-passeio', paymentIdempotencyKey: null });
    const fetchSpy = makeFetch();
    vi.stubGlobal('fetch', fetchSpy);
    render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
    await flush();

    expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
    expect(savedRecovery().tourSlug).toBe('outro-passeio');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('React Strict Mode (efeitos em dobro): um único GET, nenhum POST', async () => {
    saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: SAVED_KEY });
    const fetchSpy = makeFetch([() => ok(view('pending'))]);
    vi.stubGlobal('fetch', fetchSpy);
    render(
      <StrictMode>
        <BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />
      </StrictMode>,
    );
    await flush();

    expect(screen.getByTestId('pix-copy-paste')).toBeTruthy();
    expect(statusGets(fetchSpy)).toHaveLength(1);
    expect(paymentPosts(fetchSpy)).toHaveLength(0);
    expect(bookingPosts(fetchSpy)).toHaveLength(0);
  });

  /** Achado HIGH do Codex (02/10/2026): a compra não pode depender da saída continuar à venda. */
  describe('independente do catálogo de venda', () => {
    it('departures = [] + GET paid: voucher com a data/hora salva, sem POST', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      const fetchSpy = makeFetch([() => ok(view('paid', false))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
      expect(screen.getByText(BOOKING_ID)).toBeTruthy();
      expect(screen.queryByText(/nenhuma saída programada/i)).toBeNull();
      expect(statusGets(fetchSpy)).toHaveLength(1);
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
    });

    const otherDeparture: Departure = { ...available, id: 'dep-2', departsAt: '2026-11-01T12:00:00+00:00' };

    it('saída fora do catálogo + GET pending: recupera o Pix existente, sem POST', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: SAVED_KEY });
      const fetchSpy = makeFetch([() => ok(view('pending'))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[otherDeparture]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByTestId('pix-copy-paste').textContent).toBe('codigo-pix-recuperado');
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
    });

    it('saída fora do catálogo + GET paid: voucher acessível', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      const fetchSpy = makeFetch([() => ok(view('paid', false))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[otherDeparture]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
    });
  });

  /** Achado MEDIUM do Codex (02/10/2026): reserva vencida sem pagamento não pode prender a aba. */
  describe('reserva expirada sem pagamento', () => {
    const pastHold = () => new Date(Date.now() - 60_000).toISOString();

    it('hold vencido e nenhuma tentativa: "Esta reserva expirou." + "Fazer outra reserva", sem POST', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      const fetchSpy = makeFetch([() => ok(view(null, false, pastHold()))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByText(/esta reserva expirou/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /pagar com pix/i })).toBeNull();
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
    });

    it('reload de novo sem clicar: continua expirada (referência mantida), sem criar nada', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      const first = makeFetch([() => ok(view(null, false, pastHold()))]);
      vi.stubGlobal('fetch', first);
      const { unmount } = render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();
      unmount();

      const second = makeFetch([() => ok(view(null, false, pastHold()))]);
      vi.stubGlobal('fetch', second);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByText(/esta reserva expirou/i)).toBeTruthy();
      expect(savedRecovery()).not.toBeNull();
      expect(bookingPosts(second)).toHaveLength(0);
      expect(paymentPosts(second)).toHaveLength(0);
    });

    it('"Fazer outra reserva": limpa só a referência e volta à seleção, sem POST automático', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      window.sessionStorage.setItem('outra-chave', 'intacta');
      const fetchSpy = makeFetch([() => ok(view(null, false, pastHold()))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      fireEvent.click(screen.getByRole('button', { name: /fazer outra reserva/i }));
      await flush();

      expect(savedRecovery()).toBeNull();
      expect(window.sessionStorage.getItem('outra-chave')).toBe('intacta');
      expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
    });

    it('reserva cancelada pelo servidor (sem pagamento): mesmo estado expirado', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      const fetchSpy = makeFetch([() => ok({ ...view(null), bookingStatus: 'cancelada' })]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByText(/esta reserva expirou/i)).toBeTruthy();
    });

    it('pagamento PENDING com prazo local vencido NÃO vira reserva abandonada: reconcilia, e paid tardio leva ao voucher', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: SAVED_KEY });
      const fetchSpy = makeFetch([
        () => ok(view('pending', false, pastHold())),
        () => ok(view('pending', false, pastHold())),
        () => ok(view('paid', false, pastHold())),
      ]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.queryByText(/esta reserva expirou/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /fazer outra reserva/i })).toBeNull();
      expect(screen.getByText(/verificando pagamento/i)).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
    });

    it('confirmação ao vivo que expira na tela também oferece "Fazer outra reserva"', async () => {
      const fetchSpy = makeFetch();
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await bookAndOpenPix();
      expect(screen.getByRole('button', { name: /pagar com pix/i })).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
      });

      expect(screen.queryByRole('button', { name: /pagar com pix/i })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /fazer outra reserva/i }));
      expect(savedRecovery()).toBeNull();
      expect(screen.getByRole('button', { name: /continuar reserva/i })).toBeTruthy();
      expect(bookingPosts(fetchSpy)).toHaveLength(1);
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
    });
  });

  /** Achado HIGH do Codex (02/10/2026): reservar outro passeio não pode apagar a recuperação de um Pix pendente. */
  describe('várias reservas na mesma aba (registro v3, uma entrada por bookingId)', () => {
    const BOOKING_ID_B = '2f0d6a3e-1c4b-4b7e-9a51-6d2e8f0c3a77';
    const departureB: Departure = { ...available, id: 'dep-b', tourId: 'tour-b', departsAt: '2026-11-20T13:00:00+00:00' };

    it('Pix pendente em A → reserva B → volta para A: A recuperada por GET, sem nova reserva nem novo Pix; paid tardio → voucher de A', async () => {
      // Passeio A: reserva + Pix pendente.
      const fetchA = makeFetch();
      vi.stubGlobal('fetch', fetchA);
      const pageA = render(<BookingSelector departures={[available]} tourSlug="passeio-a" />);
      await bookAndOpenPix();
      fireEvent.click(screen.getByRole('button', { name: /pagar com pix/i }));
      await flush();
      const keyA = savedRecovery(BOOKING_ID).paymentIdempotencyKey;
      expect(keyA).toMatch(UUID_RE);
      pageA.unmount();

      // Passeio B: outra reserva na mesma aba.
      const fetchB = makeFetch([], BOOKING_ID_B);
      vi.stubGlobal('fetch', fetchB);
      const pageB = render(<BookingSelector departures={[departureB]} tourSlug="passeio-b" />);
      await flush();
      expect(statusGets(fetchB)).toHaveLength(0); // a reserva de A não pertence a esta página
      await bookAndOpenPix();
      expect(bookingPosts(fetchB)).toHaveLength(1);

      expect(savedRecovery(BOOKING_ID)).toEqual({ bookingId: BOOKING_ID, tourSlug: 'passeio-a', departsAt: available.departsAt, paymentIdempotencyKey: keyA });
      expect(savedRecovery(BOOKING_ID_B)).toEqual({ bookingId: BOOKING_ID_B, tourSlug: 'passeio-b', departsAt: departureB.departsAt, paymentIdempotencyKey: null });
      pageB.unmount();

      // Volta para A.
      const backToA = makeFetch([() => ok(view('pending')), () => ok(view('paid', false))]);
      vi.stubGlobal('fetch', backToA);
      render(<BookingSelector departures={[available]} tourSlug="passeio-a" />);
      await flush();

      expect(screen.getByTestId('pix-copy-paste').textContent).toBe('codigo-pix-recuperado');
      expect(bookingPosts(backToA)).toHaveLength(0);
      expect(paymentPosts(backToA)).toHaveLength(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
      expect(screen.getByText(BOOKING_ID)).toBeTruthy();
      expect(paymentPosts(backToA)).toHaveLength(0);
      expect(savedRecovery(BOOKING_ID_B)).not.toBeNull();
    });

    it('"Fazer outra reserva" remove só a entrada atual — a de outro passeio e outras chaves continuam', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      saveRecovery({ bookingId: BOOKING_ID_B, tourSlug: 'passeio-b', departsAt: departureB.departsAt, paymentIdempotencyKey: SAVED_KEY });
      window.sessionStorage.setItem('outra-chave', 'intacta');
      const fetchSpy = makeFetch([() => ok(view('paid', false))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      fireEvent.click(screen.getByRole('button', { name: /fazer outra reserva/i }));

      expect(savedRecovery(BOOKING_ID)).toBeNull();
      expect(savedRecovery(BOOKING_ID_B)).toEqual({
        bookingId: BOOKING_ID_B,
        tourSlug: 'passeio-b',
        departsAt: departureB.departsAt,
        paymentIdempotencyKey: SAVED_KEY,
      });
      expect(window.sessionStorage.getItem('outra-chave')).toBe('intacta');
    });

    it('BOOKING_NOT_FOUND remove só aquele bookingId', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      saveRecovery({ bookingId: BOOKING_ID_B, tourSlug: 'passeio-b', departsAt: departureB.departsAt });
      const fetchSpy = makeFetch([() => fail(404, 'BOOKING_NOT_FOUND')]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(savedRecovery(BOOKING_ID)).toBeNull();
      expect(savedRecovery(BOOKING_ID_B)).not.toBeNull();
    });

    it('A paga + reserva B gravada → volta para A: voucher de A por GET; B intacta', async () => {
      saveRecovery({ bookingId: BOOKING_ID, tourSlug: 'passeio-a', paymentIdempotencyKey: SAVED_KEY });
      saveRecovery({ bookingId: BOOKING_ID_B, tourSlug: 'passeio-b', departsAt: departureB.departsAt });
      const fetchSpy = makeFetch([() => ok(view('paid', false))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug="passeio-a" />);
      await flush();

      expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
      expect(screen.getByText(BOOKING_ID)).toBeTruthy();
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
      expect(savedRecovery(BOOKING_ID_B)).not.toBeNull();
    });

    it('erro de rede ao recuperar A: A e B continuam no registro, nada é criado', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: SAVED_KEY });
      saveRecovery({ bookingId: BOOKING_ID_B, tourSlug: 'passeio-b', departsAt: departureB.departsAt });
      const fetchSpy = makeFetch([() => Promise.reject(new TypeError('Failed to fetch'))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByRole('button', { name: /verificar novamente/i })).toBeTruthy();
      expect(savedRecovery(BOOKING_ID)).not.toBeNull();
      expect(savedRecovery(BOOKING_ID_B)).not.toBeNull();
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
    });

    it('A expirada sem pagamento + "Fazer outra reserva": remove só A; B continua', async () => {
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: null });
      saveRecovery({ bookingId: BOOKING_ID_B, tourSlug: 'passeio-b', departsAt: departureB.departsAt });
      const pastHold = new Date(Date.now() - 60_000).toISOString();
      const fetchSpy = makeFetch([() => ok(view(null, false, pastHold))]);
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      await flush();

      expect(screen.getByText(/esta reserva expirou/i)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /fazer outra reserva/i }));

      expect(savedRecovery(BOOKING_ID)).toBeNull();
      expect(savedRecovery(BOOKING_ID_B)).not.toBeNull();
      expect(bookingPosts(fetchSpy)).toHaveLength(0);
    });

    it('já existe reserva recuperável deste passeio na aba: "Confirmar reserva" NÃO cria outra, retoma a existente por GET', async () => {
      const fetchSpy = makeFetch();
      vi.stubGlobal('fetch', fetchSpy);
      render(<BookingSelector departures={[available]} tourSlug={TOUR_SLUG} />);
      // Outra aba (sessionStorage duplicado) gravou uma reserva deste passeio depois da montagem.
      saveRecovery({ bookingId: BOOKING_ID, paymentIdempotencyKey: SAVED_KEY });

      await bookAndOpenPix();

      expect(bookingPosts(fetchSpy)).toHaveLength(0);
      expect(statusGets(fetchSpy)).toHaveLength(1);
      expect(screen.getByTestId('pix-copy-paste')).toBeTruthy();
      expect(paymentPosts(fetchSpy)).toHaveLength(0);
    });
  });
});

