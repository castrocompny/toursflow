'use client';

import { useEffect, useRef, useState } from 'react';
import { PaymentClientError, type PaymentClient } from '@/lib/payment-client';
import { formatPrice, centsToReais } from '@/lib/format';
import { formatCountdown, isHoldExpired, msUntilExpiry } from '@/lib/hold-countdown';
import type { NauticFlowBookingPaymentView } from '@/types/payment';

const POLL_INTERVAL_MS = 5000;

type Phase = 'creating' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'expired' | 'error';

interface PixPaymentProps {
  bookingId: string;
  /** Uma key por tentativa lógica de pagamento — gerada/mantida pelo `BookingSelector`, mesmo padrão de `resolveIdempotencyKey()` do booking. */
  idempotencyKey: string;
  paymentClient: PaymentClient;
  onPaid: (view: NauticFlowBookingPaymentView) => void;
}

/**
 * Fluxo Pix — Pix gerado → QR Code/copia-e-cola → aguardando pagamento →
 * confirmado/falhou/estornado/expirado. NÃO alcançável pela UI pública
 * hoje (`PAYMENTS_UI_ENABLED === false` em `BookingSelector`), mesmo já
 * usando o `ToursFlowPaymentClient` real (chama só as rotas do próprio
 * ToursFlow — `/api/bookings/[bookingId]/payment` — nunca o
 * NauticFlow/Asaas diretamente).
 *
 * `expired` é sempre calculado no cliente (`isHoldExpired` sobre
 * `pix.expirationDate`, com fallback pra `holdExpiresAt`) — nunca um
 * status que o NauticFlow devolve. `manual_review` foi removido: não é
 * um `PaymentStatus` confirmado no contrato real.
 */
export function PixPayment({ bookingId, idempotencyKey, paymentClient, onPaid }: PixPaymentProps) {
  const [phase, setPhase] = useState<Phase>('creating');
  const [view, setView] = useState<NauticFlowBookingPaymentView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  useEffect(() => {
    let cancelled = false;

    async function create() {
      try {
        const data = await paymentClient.createPixPayment(bookingId, idempotencyKey);
        if (cancelled) return;
        setView(data);
        setPhase(data.payment?.status ?? 'pending');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof PaymentClientError ? error.message : 'Pagamento Pix ainda não está disponível.');
        setPhase('error');
      }
    }

    create();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, idempotencyKey]);

  useEffect(() => {
    if (phase !== 'pending') return;
    if (!view) return;

    const interval = setInterval(async () => {
      setNow(Date.now());
      try {
        const updated = await paymentClient.getBookingPaymentStatus(bookingId);
        setView(updated);
        const status = updated.payment?.status ?? 'pending';
        if (status === 'paid') {
          setPhase('paid');
          onPaidRef.current(updated);
        } else if (status !== 'pending') {
          setPhase(status);
        }
      } catch {
        // Falha transitória de polling não derruba o fluxo — tenta de novo no próximo tick.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase, view, bookingId, paymentClient]);

  // Expiração detectada localmente, mesmo antes do servidor confirmar —
  // usa a expiração do próprio Pix quando existe, senão a do hold.
  useEffect(() => {
    if (phase !== 'pending' || !view) return;
    const expiresAt = view.pix?.expirationDate ?? view.holdExpiresAt;
    if (isHoldExpired(expiresAt, now)) setPhase('expired');
  }, [phase, view, now]);

  if (phase === 'creating') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="text-sm text-ink-muted">Gerando Pix...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p role="alert" className="text-sm text-red-700">
          {errorMessage}
        </p>
      </div>
    );
  }

  if (!view) return null;

  if (phase === 'paid') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="eyebrow">Pagamento confirmado</p>
        <h3 className="mt-2 font-display text-xl font-bold">Pix recebido</h3>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p role="alert" className="text-sm text-red-700">
          Não foi possível confirmar este pagamento. Tente gerar um novo Pix.
        </p>
      </div>
    );
  }

  if (phase === 'refunded' || phase === 'partially_refunded') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="eyebrow">Estornado</p>
        <h3 className="mt-2 font-display text-xl font-bold">
          {phase === 'refunded' ? 'Pagamento estornado' : 'Pagamento parcialmente estornado'}
        </h3>
        <p className="mt-2 text-sm text-ink-muted">Fale com o operador para mais detalhes.</p>
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p role="alert" className="text-sm text-red-700">
          O Pix expirou antes do pagamento ser confirmado.
        </p>
      </div>
    );
  }

  // phase === 'pending'
  if (!view.pix) {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="text-sm text-ink-muted">Aguardando confirmação...</p>
      </div>
    );
  }

  const remaining = msUntilExpiry(view.pix.expirationDate, now);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-6">
      <p className="eyebrow">Aguardando pagamento</p>
      <h3 className="mt-2 font-display text-xl font-bold">Pague com Pix</h3>
      <p className="mt-2 text-sm text-ink-muted">
        Escaneie o QR Code ou copie o código abaixo. Expira em{' '}
        <span className="font-semibold text-ink" data-testid="pix-countdown">
          {formatCountdown(remaining)}
        </span>
        .
      </p>

      <div className="mt-4 break-all rounded-2xl bg-sand p-4 text-xs text-ink-muted" data-testid="pix-copy-paste">
        {view.pix.payload}
      </div>

      <p className="mt-4 font-display text-lg font-bold">{formatPrice(centsToReais(view.totalCents))}</p>
    </div>
  );
}
