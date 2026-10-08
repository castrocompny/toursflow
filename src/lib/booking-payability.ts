import { isHoldExpired } from './hold-countdown';

/**
 * A reserva ainda pode receber uma NOVA tentativa de Pix? Espelha as
 * checagens da RPC `create_marketplace_payment_attempt` do NauticFlow
 * (migration 0059): `status` precisa ser `pendente` (senão
 * `BOOKING_NOT_PENDING`) e `hold_expires_at` precisa estar no futuro (senão
 * `HOLD_EXPIRED`). Os status de reserva do NauticFlow são só `pendente`,
 * `confirmada` e `cancelada`.
 *
 * Só decide se a UI OFERECE "Gerar novo Pix" — o servidor continua sendo a
 * autoridade: se ele ainda assim recusar (ex.: relógio do navegador
 * atrasado), `PixPayment` trata `HOLD_EXPIRED`/`BOOKING_NOT_PENDING` como
 * reserva encerrada.
 */
export function isBookingPayable(
  booking: { bookingStatus: string; holdExpiresAt: string | null },
  now: number = Date.now(),
): boolean {
  if (booking.bookingStatus === 'cancelada' || booking.bookingStatus === 'confirmada') return false;
  if (!booking.holdExpiresAt) return false;
  return !isHoldExpired(booking.holdExpiresAt, now);
}
