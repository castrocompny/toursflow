// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Departure } from '@/types';
import { BookingConfirmation, type BookingConfirmationData } from './BookingConfirmation';

afterEach(() => {
  cleanup();
});

const departure: Departure = {
  id: 'dep-1',
  tourId: 'tour-1',
  departsAt: '2026-10-11T17:00:00+00:00',
  price: 150,
  priceType: 'per_person',
  soldOut: false,
};

function booking(overrides: Partial<BookingConfirmationData> = {}): BookingConfirmationData {
  return {
    bookingId: 'bk-123',
    status: 'pendente',
    holdExpiresAt: '2026-09-01T12:15:00Z',
    priceCents: 15000,
    totalCents: 30000,
    quantity: 2,
    ...overrides,
  };
}

describe('BookingConfirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o preço REAL vindo do backend (totalCents), nunca um valor calculado no cliente', () => {
    render(<BookingConfirmation departure={departure} booking={booking({ totalCents: 30000 })} />);
    expect(screen.getByText('R$ 300,00')).toBeTruthy();
  });

  it('countdown inicial reflete holdExpiresAt - agora (15 min)', () => {
    render(<BookingConfirmation departure={departure} booking={booking({ holdExpiresAt: '2026-09-01T12:15:00Z' })} />);
    expect(screen.getByTestId('hold-countdown').textContent).toBe('15:00');
  });

  it('countdown diminui com o tempo (fake timers)', () => {
    render(<BookingConfirmation departure={departure} booking={booking({ holdExpiresAt: '2026-09-01T12:15:00Z' })} />);
    expect(screen.getByTestId('hold-countdown').textContent).toBe('15:00');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('hold-countdown').textContent).toBe('14:00');

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(screen.getByTestId('hold-countdown').textContent).toBe('9:00');
  });

  it('chega em zero sem ficar negativo e muda o estado da UI para expirado', () => {
    render(<BookingConfirmation departure={departure} booking={booking({ holdExpiresAt: '2026-09-01T12:15:00Z' })} />);

    act(() => {
      vi.advanceTimersByTime(15 * 60_000 + 5_000); // passa 5s do prazo
    });

    expect(screen.queryByTestId('hold-countdown')).toBeNull();
    expect(screen.getByText(/o tempo da sua reserva expirou/i)).toBeTruthy();
  });

  it('não mostra o aviso de pagamento depois de expirado', () => {
    render(<BookingConfirmation departure={departure} booking={booking({ holdExpiresAt: '2026-09-01T12:15:00Z' })} />);
    act(() => {
      vi.advanceTimersByTime(16 * 60_000);
    });
    expect(screen.queryByText(/pagamento será disponibilizado/i)).toBeNull();
  });
});
