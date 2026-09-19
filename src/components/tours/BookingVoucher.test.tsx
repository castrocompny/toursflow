// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Departure } from '@/types';
import type { NauticFlowBookingPaymentView } from '@/types/payment';
import { formatPrice } from '@/lib/format';
import { BookingVoucher } from './BookingVoucher';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const departure: Departure = {
  id: 'dep-1',
  tourId: 'tour-1',
  departsAt: '2026-10-11T17:00:00+00:00',
  price: 150,
  priceType: 'per_person',
  availableSpots: 10,
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
  it('mostra código da reserva, data/horário, pessoas e valor pago (do backend)', () => {
    render(<BookingVoucher departure={departure} bookingId="bk-1" payment={payment} />);

    expect(screen.getByText('bk-1')).toBeTruthy();
    expect(screen.getByText('R$ 300,00')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(/reserva confirmada/i)).toBeTruthy();
  });

  it('sem tourName/boardingPointName (ausentes), mantém o fallback e não inventa embarque', () => {
    render(<BookingVoucher departure={departure} bookingId="bk-1" payment={payment} />);

    expect(screen.getByText(/pagamento recebido/i)).toBeTruthy();
    expect(screen.queryByText('Embarque')).toBeNull();
  });

  it('com tourName e embarque, mostra nome do passeio e embarque (nome + referência)', () => {
    render(
      <BookingVoucher
        departure={departure}
        bookingId="bk-1"
        payment={payment}
        tourName="Passeio de Escuna em Búzios"
        boardingPointName="Porto da Barra"
        boardingPointReference="Próximo ao quiosque azul"
      />,
    );

    expect(screen.getByText('Passeio de Escuna em Búzios')).toBeTruthy();
    expect(screen.getByText('Embarque')).toBeTruthy();
    expect(screen.getByText('Porto da Barra')).toBeTruthy();
    expect(screen.getByText('Próximo ao quiosque azul')).toBeTruthy();
  });

  it('com embarque sem referência, mostra só o nome (não inventa referência)', () => {
    render(
      <BookingVoucher departure={departure} bookingId="bk-1" payment={payment} boardingPointName="Porto da Barra" />,
    );

    expect(screen.getByText('Porto da Barra')).toBeTruthy();
  });

  it('inclui a instrução de apresentar o código, sem prometer QR code ou validação de ingresso', () => {
    render(<BookingVoucher departure={departure} bookingId="bk-1" payment={payment} />);

    expect(screen.getByText(/apresente o código da reserva/i)).toBeTruthy();
    expect(screen.queryByText(/qr code/i)).toBeNull();
  });

  it('botão "Compartilhar no WhatsApp" é um link para wa.me com a mensagem correta, sem PII', () => {
    render(
      <BookingVoucher
        departure={departure}
        bookingId="bk-1"
        payment={payment}
        tourName="Passeio de Escuna em Búzios"
        boardingPointName="Porto da Barra"
      />,
    );

    const link = screen.getByRole('link', { name: /compartilhar no whatsapp/i });
    const href = link.getAttribute('href')!;
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);

    const decoded = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
    expect(decoded).toContain('Passeio de Escuna em Búzios');
    expect(decoded).toContain('bk-1');
    expect(decoded).toContain(formatPrice(300));
    expect(decoded).toContain('Porto da Barra');
    expect(decoded).not.toMatch(/@/);
    expect(decoded).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(decoded).not.toMatch(/idempotency|secret|client-key|token/i);

    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('botão "Copiar dados da reserva" copia a mesma mensagem e mostra feedback "Copiado"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<BookingVoucher departure={departure} bookingId="bk-1" payment={payment} tourName="Passeio de Escuna" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar dados da reserva/i }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('Passeio de Escuna');
    expect(screen.getByRole('button', { name: /copiado/i })).toBeTruthy();
  });

  it('trata indisponibilidade do clipboard sem quebrar (mostra estado de erro, não lança)', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });

    render(<BookingVoucher departure={departure} bookingId="bk-1" payment={payment} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar dados da reserva/i }));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: /não foi possível copiar/i })).toBeTruthy();
  });
});
