// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotImplementedPaymentClient } from '@/lib/payment-client';
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

  it('Pix expira pelo countdown mesmo sem o servidor confirmar (detecção local)', async () => {
    const fake = createFakePaymentClient({ pix: { payload: 'x', expirationDate: '2026-09-01T12:00:05Z' } }); // expira em 5s
    render(<PixPayment bookingId="booking-1" idempotencyKey="idem-1" paymentClient={fake.client} onPaid={vi.fn()} />);
    await flush();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText(/o pix expirou/i)).toBeTruthy();
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
        throw new PaymentClientError('PAYMENT_PROVIDER_NOT_ENABLED', 'Pagamento online ainda não está disponível. Fale com o operador para confirmar sua reserva.');
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
