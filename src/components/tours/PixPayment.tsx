'use client';

import { useEffect, useRef, useState } from 'react';
import { PaymentClientError, type PaymentClient } from '@/lib/payment-client';
import { formatPrice, centsToReais } from '@/lib/format';
import { formatCountdown, isHoldExpired, msUntilExpiry } from '@/lib/hold-countdown';
import type { NauticFlowBookingPaymentView, PaymentStatus } from '@/types/payment';

const POLL_INTERVAL_MS = 5000;

/**
 * Janela de reconciliação depois que o countdown LOCAL zera: 24 consultas
 * × 5s = 2 min, mais UMA consulta final antes de mostrar `expired`. O
 * contrato não devolve nenhuma janela server-side de liquidação (só
 * `pix.expirationDate`/`holdExpiresAt`, que são exatamente os instantes
 * comparados com o relógio do navegador — não servem de régua se o
 * relógio estiver errado), então a janela é contada em consultas desde a
 * entrada em `reconciling`, imune a clock skew. 2 min cobre atraso normal
 * de webhook Asaas → NauticFlow com folga; 12 req/min fica bem abaixo do
 * limite de polling do NauticFlow (40/60s por cliente). Depois disso o
 * botão "Verificar pagamento" continua disponível — `expired` nunca é uma
 * falha definitiva, só "não confirmado a tempo".
 */
const RECONCILE_MAX_POLLS = 24;

/**
 * `reconciling`: countdown local zerou, mas o servidor ainda não disse
 * nada terminal — QR escondido, polling continua (limitado). `expired`:
 * janela de reconciliação + consulta final terminaram ainda `pending`.
 */
type Phase =
  | 'creating'
  | 'pending'
  | 'reconciling'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'expired'
  | 'error';

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
 * O relógio do navegador só decide a expiração VISUAL do QR (`isHoldExpired`
 * sobre `pix.expirationDate`, com fallback pra `holdExpiresAt`) — nunca o
 * estado financeiro. Quando o countdown zera, a UI entra em `reconciling`
 * e continua consultando o servidor (ver `RECONCILE_MAX_POLLS`); `paid`
 * devolvido pelo servidor vence qualquer estado local, inclusive
 * `expired`, que é só "não confirmado a tempo" (achado HIGH do Codex,
 * 29/09/2026). `manual_review` foi removido: não é um `PaymentStatus`
 * confirmado no contrato real.
 */
export function PixPayment({ bookingId, idempotencyKey, paymentClient, onPaid }: PixPaymentProps) {
  const [phase, setPhase] = useState<Phase>('creating');
  const [view, setView] = useState<NauticFlowBookingPaymentView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  // Estado terminal vindo do SERVIDOR já aplicado — respostas atrasadas
  // (poll em voo, "Verificar pagamento") nunca sobrescrevem nem chamam
  // `onPaid` duas vezes.
  const settledRef = useRef(false);
  const checkingRef = useRef(false);
  const reconcilePollsRef = useRef(0);
  const finalCheckStartedRef = useRef(false);
  const hasView = view !== null;

  /** Aplica a resposta autoritativa do servidor; devolve o status lido. */
  function applyServerView(updated: NauticFlowBookingPaymentView): PaymentStatus {
    const status = updated.payment?.status ?? 'pending';
    if (settledRef.current) return status;
    setView(updated);
    if (status === 'paid') {
      settledRef.current = true;
      setPhase('paid');
      onPaidRef.current(updated);
    } else if (status !== 'pending') {
      settledRef.current = true;
      setPhase(status);
    }
    return status;
  }

  useEffect(() => {
    let cancelled = false;

    async function create() {
      try {
        const data = await paymentClient.createPixPayment(bookingId, idempotencyKey);
        if (cancelled) return;
        if (applyServerView(data) === 'pending') setPhase('pending');
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
    if (phase !== 'pending' && phase !== 'reconciling') return;
    if (!hasView) return;

    const interval = setInterval(async () => {
      setNow(Date.now());
      let finalCheck = false;
      if (phase === 'reconciling') {
        if (finalCheckStartedRef.current) return;
        finalCheck = reconcilePollsRef.current >= RECONCILE_MAX_POLLS;
        if (finalCheck) finalCheckStartedRef.current = true;
        else reconcilePollsRef.current += 1;
      }
      try {
        const status = applyServerView(await paymentClient.getBookingPaymentStatus(bookingId));
        if (finalCheck && status === 'pending' && !settledRef.current) setPhase('expired');
      } catch {
        // Falha transitória de polling não derruba o fluxo — tenta de novo
        // no próximo tick. Na consulta final, encerra em `expired` (que
        // ainda permite "Verificar pagamento") para nunca virar loop infinito.
        if (finalCheck && !settledRef.current) setPhase('expired');
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hasView, bookingId, paymentClient]);

  // Countdown local zerou (Pix, com fallback pro hold): esconde o QR e
  // passa a reconciliar com o servidor — nunca declara falha sozinho.
  useEffect(() => {
    if (phase !== 'pending' || !view) return;
    const expiresAt = view.pix?.expirationDate ?? view.holdExpiresAt;
    if (isHoldExpired(expiresAt, now)) {
      reconcilePollsRef.current = 0;
      finalCheckStartedRef.current = false;
      setPhase('reconciling');
    }
  }, [phase, view, now]);

  /** Só consulta status (GET) do mesmo `bookingId` — nunca cria reserva, cobrança ou Pix. */
  async function handleVerifyPayment() {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setCheckMessage(null);
    try {
      const status = applyServerView(await paymentClient.getBookingPaymentStatus(bookingId));
      if (status === 'pending') {
        setCheckMessage('O pagamento ainda não foi confirmado. Se você já pagou, aguarde alguns instantes e verifique de novo.');
      }
    } catch (error) {
      setCheckMessage(
        error instanceof PaymentClientError ? error.message : 'Não foi possível verificar o pagamento agora. Tente de novo.',
      );
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  const verifyAction = (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleVerifyPayment}
        disabled={checking}
        className="btn-primary w-full disabled:opacity-60"
      >
        {checking ? 'Verificando...' : 'Verificar pagamento'}
      </button>
      {checkMessage && (
        <p className="mt-2 text-sm text-ink-muted" data-testid="pix-check-message">
          {checkMessage}
        </p>
      )}
    </div>
  );

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
        <p className="mt-2 text-sm text-ink-muted">Você pode acompanhar o estorno pelo meio de pagamento utilizado.</p>
      </div>
    );
  }

  if (phase === 'reconciling') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="eyebrow">Verificando pagamento</p>
        <h3 className="mt-2 font-display text-xl font-bold">O prazo deste Pix terminou</h3>
        <p className="mt-2 text-sm text-ink-muted">
          Se você já pagou, estamos confirmando com o banco — pode levar alguns instantes. Não pague de novo.
        </p>
        {verifyAction}
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p role="alert" className="text-sm text-red-700">
          O Pix expirou antes do pagamento ser confirmado.
        </p>
        <p className="mt-2 text-sm text-ink-muted">Se você já pagou, verifique o pagamento antes de tentar de novo.</p>
        {verifyAction}
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
