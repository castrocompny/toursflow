// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Departure } from '@/types';
import type { NauticFlowBookingPaymentView } from '@/types/payment';
import { BookingVoucher } from './BookingVoucher';

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

const payment: NauticFlowBookingPaymentView = {
  bookingId: 'bk-1',
  bookingStatus: 'paid',
  holdExpiresAt: '2026-10-11T17:00:00+00:00',
  quantity: 2,
  priceCents: 15000,
  totalCents: 30000,
  payment: { status: 'paid', method: 'pix' },
};

describe('BookingVoucher', () => {
  it('mostra código da reserva, data/horário e valor pago (do backend)', () => {
    render(<BookingVoucher departure={departure} bookingId="bk-1" payment={payment} />);

    expect(screen.getByText('bk-1')).toBeTruthy();
    expect(screen.getByText('R$ 300,00')).toBeTruthy();
    expect(screen.getByText(/reserva confirmada/i)).toBeTruthy();
  });
});
