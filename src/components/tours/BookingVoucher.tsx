'use client';

import type { Departure } from '@/types';
import { formatDepartureDateTime, formatPrice, centsToReais } from '@/lib/format';
import type { NauticFlowBookingPaymentView } from '@/types/payment';

interface BookingVoucherProps {
  departure: Departure;
  bookingId: string;
  payment: NauticFlowBookingPaymentView;
}

/**
 * Estado final do fluxo (reserva concluída) — só alcançável depois de
 * `PixPayment` reportar `status: 'paid'`. NÃO gera nem representa um
 * voucher real do NauticFlow: o formato/entrega do voucher de verdade
 * não está definido em nenhum contrato confirmado (mesma ressalva de
 * `src/types/payment.ts`). Esta tela é só a confirmação visual do lado
 * ToursFlow — o voucher real, quando existir, é responsabilidade do
 * NauticFlow (ver docs/PLANO-INTEGRACAO-NAUTICFLOW.md, Fase 10).
 */
export function BookingVoucher({ departure, bookingId, payment }: BookingVoucherProps) {
  const { date, time } = formatDepartureDateTime(departure.departsAt);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-6">
      <p className="eyebrow">Reserva confirmada</p>
      <h3 className="mt-2 font-display text-xl font-bold">Pagamento recebido</h3>

      <dl className="mt-5 space-y-2 rounded-2xl bg-sand p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Código da reserva</dt>
          <dd className="font-semibold">{bookingId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Data</dt>
          <dd className="font-semibold capitalize">{date}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Horário</dt>
          <dd className="font-semibold">{time}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-ink/10 pt-2">
          <dt className="text-ink-muted">Valor pago</dt>
          <dd className="font-display text-base font-bold">{formatPrice(centsToReais(payment.totalCents))}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-ink-muted">
        Voucher e detalhes finais da reserva serão enviados pelo operador.
      </p>
    </div>
  );
}
