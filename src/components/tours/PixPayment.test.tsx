// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotImplementedPaymentClient, PaymentClientError } from '@/lib/payment-client';
import { createFakePaymentClient } from '@/test/fake-payment-client';
import { PixPayment } from './PixPayment';

afterEach(() => {
  cleanup();
});

/** Com fake timers ativos, `waitFor` trava (depende de setTimeout real) — flush manual do microtask queue em vez disso. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Avança o relógio fake de 5s em 5s (um tick de polling por `act`), para o
 * React re-renderizar e trocar o interval entre ticks quando a fase muda.
 */
async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 5000) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(5000, ms - elapsed));
    });
  }
}

describe('PixPayment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gera o Pix e mostra QR/copia-e-cola + countdown', async () => {
    const fake = createFakePaymentClient({
      pix: { payload: 'codigo-teste-123', expirationDate: '2026-09-01T12:15:00Z' },
    });
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={vi.fn()} />);
    await flush();

    expect(screen.getByText(/pague com pix/i)).toBeTruthy();
    expect(screen.getByTestId('pix-copy-paste').textContent).toBe('codigo-teste-123');
    expect(screen.getByTestId('pix-countdown').textContent).toBe('15:00');
  });

  it('countdown diminui com o tempo', async () => {
    const fake = createFakePaymentClient({ pix: { payload: 'x', expirationDate: '2026-09-01T12:15:00Z' } });
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={vi.fn()} />);
    await flush();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('pix-countdown').textContent).toBe('14:00');
  });

  it('quando o status muda para paid (via polling), chama onPaid e mostra confirmação', async () => {
    const fake = createFakePaymentClient({ pix: { payload: 'x', expirationDate: '2026-09-01T12:15:00Z' } });
    const onPaid = vi.fn();
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={onPaid} />);
    await flush();

    fake.setStatus('paid');
    await act(async () => {
      vi.advanceTimersByTime(5000); // próximo tick do polling
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/pix recebido/i)).toBeTruthy();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0][0].payment.status).toBe('paid');
  });

  it('status failed mostra mensagem de falha', async () => {
    const fake = createFakePaymentClient({ pix: { payload: 'x', expirationDate: '2026-09-01T12:15:00Z' } });
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={vi.fn()} />);
    await flush();

    fake.setStatus('failed');
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/não foi possível confirmar este pagamento/i)).toBeTruthy();
  });

  it('status refunded mostra mensagem de estorno', async () => {
    const fake = createFakePaymentClient({ pix: { payload: 'x', expirationDate: '2026-09-01T12:15:00Z' } });
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={vi.fn()} />);
    await flush();

    fake.setStatus('refunded');
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/pagamento estornado/i)).toBeTruthy();
  });

  it('status partially_refunded mostra mensagem específica', async () => {
    const fake = createFakePaymentClient({ pix: { payload: 'x', expirationDate: '2026-09-01T12:15:00Z' } });
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={vi.fn()} />);
    await flush();

    fake.setStatus('partially_refunded');
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/pagamento parcialmente estornado/i)).toBeTruthy();
  });


  it('client indisponível (NotImplementedPaymentClient): mostra erro seguro, nunca quebra', async () => {
    render(
      <PixPayment
        bookingId="booking-1"
        idempotencyKey="idem-1"
        paymentClient={new NotImplementedPaymentClient()}
        onPaid={vi.fn()}
      />,
    );
    await flush();

    expect(screen.getByText(/pagamento pix ainda não está disponível/i)).toBeTruthy();
  });

  it('erro do servidor na criação (ex.: PAYMENT_PROVIDER_NOT_ENABLED) mostra a mensagem segura mapeada', async () => {
    const client = {
      async createPixPayment() {
        const { PaymentClientError } = await import('@/lib/payment-client');
        throw new PaymentClientError('PAYMENT_PROVIDER_NOT_ENABLED', 'Pagamento online ainda não está disponível. Volte em breve.');
      },
      async getBookingPaymentStatus() {
        throw new Error('não deveria ser chamado');
      },
    };

    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={client} onPaid={vi.fn()} />);
    await flush();

    expect(screen.getByText(/pagamento online ainda não está disponível/i)).toBeTruthy();
  });
});

/**
 * Achado HIGH do Codex (29/09/2026): o countdown local nunca pode, sozinho,
 * encerrar o fluxo — senão um pagamento feito perto da expiração, com
 * webhook atrasado, some para sempre da tela do cliente.
 */
describe('PixPayment — reconciliação pós-expiração local', () => {
  // Pix expira 5s depois do "agora" → 1º tick (5s) entra em `reconciling`;
  // reconciliação = ticks 10s..125s (24), consulta final = tick 130s.
  const SHORT_PIX = { payload: 'codigo-curto', expirationDate: '2026-09-01T12:00:05Z' };
  const RECONCILE_WINDOW_MS = 24 * 5000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(pix = SHORT_PIX) {
    const fake = createFakePaymentClient({ pix });
    const getStatus = vi.spyOn(fake.client, 'getBookingPaymentStatus');
    const createPix = vi.spyOn(fake.client, 'createPixPayment');
    const onPaid = vi.fn();
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={onPaid} />);
    return { fake, getStatus, createPix, onPaid };
  }

  it('B: countdown zera ainda pending → entra em reconciliação, não em terminal, e continua consultando', async () => {
    const { getStatus } = setup();
    await flush();

    await advance(5000);
    expect(screen.getByText(/verificando pagamento/i)).toBeTruthy();
    expect(screen.queryByText(/o pix expirou/i)).toBeNull();
    expect(screen.queryByTestId('pix-copy-paste')).toBeNull(); // QR expirado não é mais oferecido

    const callsAtExpiry = getStatus.mock.calls.length;
    await advance(15_000);
    expect(getStatus.mock.calls.length).toBe(callsAtExpiry + 3);
  });

  it('A/C: pago antes da expiração, servidor só confirma paid depois dela → paid vence e chama onPaid uma vez', async () => {
    const { fake, onPaid } = setup();
    await flush();

    await advance(5000); // expirou localmente, servidor ainda pending
    await advance(60_000); // webhook atrasado 1 min
    expect(screen.getByText(/verificando pagamento/i)).toBeTruthy();

    fake.setStatus('paid');
    await advance(5000);

    expect(screen.getByText(/pix recebido/i)).toBeTruthy();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0][0].payment.status).toBe('paid');
  });

  it('D + I: servidor confirma failed durante a reconciliação → encerra em failed e para de consultar', async () => {
    const { fake, getStatus } = setup();
    await flush();
    await advance(5000);

    fake.setStatus('failed');
    await advance(5000);
    expect(screen.getByText(/não foi possível confirmar este pagamento/i)).toBeTruthy();

    const calls = getStatus.mock.calls.length;
    await advance(10 * 60_000);
    expect(getStatus.mock.calls.length).toBe(calls);
  });

  it('E + I: janela termina ainda pending → UMA consulta final antes de expired, depois nenhum polling', async () => {
    const { getStatus } = setup();
    await flush();
    await advance(5000); // 1 consulta (pending) → reconciling
    expect(getStatus).toHaveBeenCalledTimes(1);

    await advance(RECONCILE_WINDOW_MS);
    expect(getStatus).toHaveBeenCalledTimes(25);
    expect(screen.getByText(/verificando pagamento/i)).toBeTruthy(); // ainda não terminal

    await advance(5000); // consulta final autoritativa
    expect(getStatus).toHaveBeenCalledTimes(26);
    expect(screen.getByText(/o pix expirou/i)).toBeTruthy();

    await advance(10 * 60_000);
    expect(getStatus).toHaveBeenCalledTimes(26);
  });

  it('E: consulta final devolve paid → mostra confirmação, não expired', async () => {
    const { fake, onPaid } = setup();
    await flush();
    await advance(5000 + RECONCILE_WINDOW_MS);

    fake.setStatus('paid');
    await advance(5000);

    expect(screen.getByText(/pix recebido/i)).toBeTruthy();
    expect(screen.queryByText(/o pix expirou/i)).toBeNull();
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('E: consulta final falha por rede → encerra em expired (sem loop), com "Verificar pagamento" disponível', async () => {
    const { getStatus } = setup();
    await flush();
    await advance(5000 + RECONCILE_WINDOW_MS);

    getStatus.mockRejectedValueOnce(new Error('rede'));
    await advance(5000);

    expect(screen.getByText(/o pix expirou/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /verificar pagamento/i })).toBeTruthy();
  });

  it('F: relógio do navegador adiantado → reconcilia em vez de encerrar, e paid posterior aparece', async () => {
    // Navegador 20 min adiantado: o Pix (válido no servidor) já parece vencido no primeiro render.
    vi.setSystemTime(new Date('2026-09-01T12:20:00Z'));
    const { fake, onPaid } = setup({ payload: 'x', expirationDate: '2026-09-01T12:15:00Z' });
    await flush();

    expect(screen.getByText(/verificando pagamento/i)).toBeTruthy();
    expect(screen.queryByText(/o pix expirou/i)).toBeNull();

    await advance(30_000);
    fake.setStatus('paid');
    await advance(5000);

    expect(screen.getByText(/pix recebido/i)).toBeTruthy();
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('G: "Verificar pagamento" só consulta status (GET) — nunca cria booking/cobrança/Pix — e recupera paid tardio após expired', async () => {
    const { fake, getStatus, createPix, onPaid } = setup();
    await flush();
    await advance(5000 + RECONCILE_WINDOW_MS + 5000);
    expect(screen.getByText(/o pix expirou/i)).toBeTruthy();

    const callsBefore = getStatus.mock.calls.length;
    fake.setStatus('paid');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /verificar pagamento/i }));
    });
    await flush();

    expect(getStatus.mock.calls.length).toBe(callsBefore + 1);
    expect(createPix).toHaveBeenCalledTimes(1); // só a criação original
    expect(screen.getByText(/pix recebido/i)).toBeTruthy();
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('G: "Verificar pagamento" ignora clique repetido enquanto consulta; ainda pending mostra aviso', async () => {
    const { getStatus } = setup();
    await flush();
    await advance(5000);

    let release: () => void = () => {};
    getStatus.mockImplementationOnce(
      (id) =>
        new Promise((resolve) => {
          release = () => resolve(createFakePaymentClient({ bookingId: id }).current);
        }),
    );
    const callsBefore = getStatus.mock.calls.length;
    const button = screen.getByRole('button', { name: /verificar pagamento/i });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(getStatus.mock.calls.length).toBe(callsBefore + 1);
    expect((screen.getByRole('button', { name: /verificando/i }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      release();
    });
    await flush();
    expect(screen.getByTestId('pix-check-message').textContent).toMatch(/ainda não foi confirmado/i);
  });

  it('H: erro de rede no "Verificar pagamento" não perde o bookingId — nova verificação usa o mesmo id e recupera paid', async () => {
    const { fake, getStatus, onPaid } = setup();
    await flush();
    await advance(5000);

    getStatus.mockRejectedValueOnce(new PaymentClientError('NETWORK_ERROR', 'Sem conexão.'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /verificar pagamento/i }));
    });
    await flush();
    expect(screen.getByTestId('pix-check-message').textContent).toBe('Sem conexão.');

    fake.setStatus('paid');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /verificar pagamento/i }));
    });
    await flush();

    expect(screen.getByText(/pix recebido/i)).toBeTruthy();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(getStatus.mock.calls.every(([id]) => id === 'booking-1')).toBe(true);
  });
});
