'use client';

import { useEffect, useState } from 'react';
import type { Departure } from '@/types';
import { formatDepartureDateTime, formatPrice, centsToReais } from '@/lib/format';
import { formatCountdown, isHoldExpired, msUntilExpiry } from '@/lib/hold-countdown';

/** Só o subconjunto guardado em memória depois de um 201/200 — nunca a resposta bruta inteira. */
export interface BookingConfirmationData {
  bookingId: string;
  status: string;
  holdExpiresAt: string;
  priceCents: number;
  totalCents: number;
  quantity: number;
}

interface BookingConfirmationProps {
  departure: Departure;
  booking: BookingConfirmationData;
}

/** Recalcula a cada segundo a partir de `holdExpiresAt` — nunca assume 15:00 fixo no cliente. */
function useHoldCountdown(holdExpiresAtIso: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return { remainingMs: msUntilExpiry(holdExpiresAtIso, now), expired: isHoldExpired(holdExpiresAtIso, now) };
}

/**
 * STEP 4 — reserva criada (hold), Fase 3. Mostra só dado vindo do backend
 * (`booking.priceCents`/`totalCents`) — nunca o total estimado calculado
 * no cliente, que pode divergir do preço real. Sem botão de pagamento:
 * "Pagamento será disponibilizado na próxima etapa" é só aviso — Asaas/
 * PIX/cartão/split/webhook/voucher continuam fora do escopo do projeto
 * nesta fase.
 */
export function BookingConfirmation({ departure, booking }: BookingConfirmationProps) {
  const { date, time } = formatDepartureDateTime(departure.departsAt);
  const { remainingMs, expired } = useHoldCountdown(booking.holdExpiresAt);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-6">
      <p className="eyebrow">{expired ? 'Reserva expirada' : 'Reserva temporariamente garantida'}</p>
      <h3 className="mt-2 font-display text-xl font-bold">
        {expired ? 'O tempo da sua reserva expirou.' : 'Sua vaga está garantida por tempo limitado'}
      </h3>

      {expired ? (
        <p className="mt-2 text-sm text-ink-muted">
          O prazo para concluir esta reserva acabou. Volte à seleção de saída para tentar de novo.
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          Conclua o pagamento em até{' '}
          <span className="font-semibold text-ink" data-testid="hold-countdown">
            {formatCountdown(remainingMs)}
          </span>{' '}
          para não perder a vaga.
        </p>
      )}

      <dl className="mt-5 space-y-2 rounded-2xl bg-sand p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Código da reserva</dt>
          <dd className="font-semibold">{booking.bookingId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Data</dt>
          <dd className="font-semibold capitalize">{date}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Horário</dt>
          <dd className="font-semibold">{time}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Pessoas</dt>
          <dd className="font-semibold">{booking.quantity}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-ink/10 pt-2">
          {/* Preço/total sempre do backend (priceCents/totalCents) — nunca o total estimado calculado no cliente. */}
          <dt className="text-ink-muted">Total (confirmado pelo operador)</dt>
          <dd className="font-display text-base font-bold">{formatPrice(centsToReais(booking.totalCents))}</dd>
        </div>
      </dl>

      {!expired ? (
        <p className="mt-4 rounded-2xl bg-foam px-4 py-3 text-xs text-ink-muted">
          Pagamento será disponibilizado na próxima etapa. Por enquanto, fale com o operador para confirmar.
        </p>
      ) : null}
    </div>
  );
}
