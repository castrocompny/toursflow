import type { PaymentClient } from '@/lib/payment-client';
import type { NauticFlowBookingPaymentView, PaymentStatus } from '@/types/payment';

/**
 * Fake em memória de `PaymentClient`, só para testes e preview local —
 * nunca importado por código de produção. Deixa o teste controlar
 * exatamente a transição de status (`setStatus`) sem qualquer chamada de
 * rede real.
 */
export function createFakePaymentClient(overrides: Partial<NauticFlowBookingPaymentView> = {}) {
  let current: NauticFlowBookingPaymentView = {
    bookingId: 'fake-booking-1',
    bookingStatus: 'pending',
    holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    quantity: 1,
    priceCents: 15000,
    totalCents: 15000,
    payment: { status: 'pending', method: 'pix' },
    pix: {
      payload: '00020126...fake-copia-e-cola...6304ABCD',
      expirationDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    ...overrides,
  };

  const client: PaymentClient = {
    async createPixPayment() {
      return current;
    },
    async getBookingPaymentStatus() {
      return current;
    },
  };

  return {
    client,
    setStatus(status: PaymentStatus) {
      current = { ...current, payment: current.payment ? { ...current.payment, status } : { status, method: 'pix' } };
    },
    get current() {
      return current;
    },
  };
}
