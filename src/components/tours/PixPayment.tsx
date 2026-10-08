'use client';

import { useEffect, useRef, useState } from 'react';
import { PaymentClientError, type PaymentClient } from '@/lib/payment-client';
import { formatPrice, centsToReais } from '@/lib/format';
import { formatCountdown, isHoldExpired, msUntilExpiry } from '@/lib/hold-countdown';
import type { ClientPaymentErrorCode } from '@/lib/payment-error-messages';
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
 * Falha ao CRIAR o Pix com o booking já criado — o `bookingId` nunca se
 * perde (vem do `BookingSelector`), então o turista sempre tem um caminho
 * sem refazer a reserva:
 * - `retry`: resultado ambíguo/transitório (rede, timeout de 8s do
 *   servidor, erro do provedor, rate limit). Repetir o POST com a MESMA
 *   Idempotency-Key é replay no NauticFlow: devolve a mesma tentativa e
 *   reconcilia a cobrança no Asaas por `externalReference` — se o Pix
 *   chegou a ser criado e só a resposta se perdeu, é ele que volta.
 * - `verify`: já existe pagamento ativo, ou a reserva saiu de pending /
 *   o hold venceu — nunca tenta criar outro; só consulta o status (GET),
 *   que pode revelar `paid` ou o Pix já ativo.
 * - `fatal`: nada que o turista consiga resolver nesta tela.
 */
type CreateErrorKind = 'retry' | 'verify' | 'fatal';

const RETRY_SAME_KEY_CODES: ReadonlySet<ClientPaymentErrorCode> = new Set([
  'NETWORK_ERROR',
  'PAYMENT_SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  'PAYMENT_PROVIDER_ERROR',
  'RATE_LIMITED',
  'CLIENT_IP_UNAVAILABLE',
  'INVALID_CLIENT_KEY',
  'UNAUTHORIZED',
]);

const VERIFY_ONLY_CODES: ReadonlySet<ClientPaymentErrorCode> = new Set([
  'PAYMENT_ALREADY_ACTIVE',
  'HOLD_EXPIRED',
  'BOOKING_NOT_PENDING',
  'BOOKING_NOT_FOUND',
]);

function classifyCreateError(error: unknown): CreateErrorKind {
  if (!(error instanceof PaymentClientError)) return 'fatal';
  if (RETRY_SAME_KEY_CODES.has(error.code)) return 'retry';
  if (VERIFY_ONLY_CODES.has(error.code)) return 'verify';
  return 'fatal';
}

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
  /**
   * Nova tentativa depois de `failed` confirmado pelo servidor — o
   * `BookingSelector` gera uma Idempotency-Key NOVA (contrato do
   * NauticFlow: `failed` libera o slot de `payments_one_active_per_reservation`,
   * "retry legítimo") e remonta este componente. Ausente = sem botão.
   */
  onNewAttempt?: () => void;
  /**
   * Recuperação depois de reload (`booking-recovery.ts`): a view já lida por
   * `GET` — a tentativa existente é exibida/consultada a partir dela, SEM o
   * `POST` de criação. Só um clique explícito ("Tentar gerar Pix novamente",
   * mesma key = replay) ou "Gerar novo Pix" (depois de `failed`) faz POST.
   */
  initialView?: NauticFlowBookingPaymentView;
  /**
   * `false` quando a key desta tentativa NÃO é a original (recuperação sem
   * key salva): aí o replay explícito de "pending sem Pix" é escondido —
   * uma key inventada não reconcilia a tentativa existente.
   */
  canReplayCreate?: boolean;
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
export function PixPayment({
  bookingId,
  idempotencyKey,
  paymentClient,
  onPaid,
  onNewAttempt,
  initialView,
  canReplayCreate = true,
}: PixPaymentProps) {
  const [phase, setPhase] = useState<Phase>('creating');
  const [view, setView] = useState<NauticFlowBookingPaymentView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createErrorKind, setCreateErrorKind] = useState<CreateErrorKind>('fatal');
  // Incrementado por "Tentar gerar Pix novamente" — re-executa o POST com
  // a MESMA Idempotency-Key (replay), nunca uma nova.
  const [createRun, setCreateRun] = useState(0);
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
  // POST em voo — guarda síncrona contra clique repetido em "Tentar gerar Pix novamente".
  const creatingRef = useRef(false);
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

    if (createRun === 0 && initialView) {
      if (applyServerView(initialView) === 'pending') setPhase('pending');
      return;
    }

    async function create() {
      creatingRef.current = true;
      try {
        const data = await paymentClient.createPixPayment(bookingId, idempotencyKey);
        if (cancelled) return;
        if (applyServerView(data) === 'pending') setPhase('pending');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof PaymentClientError ? error.message : 'Pagamento Pix ainda não está disponível.');
        setCreateErrorKind(classifyCreateError(error));
        setPhase('error');
      } finally {
        if (!cancelled) creatingRef.current = false;
      }
    }

    create();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, idempotencyKey, createRun]);

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
      const updated = await paymentClient.getBookingPaymentStatus(bookingId);
      const status = applyServerView(updated);
      if (status === 'pending' && phase === 'error' && updated.pix) {
        // Pix já ativo para esta reserva (ex.: PAYMENT_ALREADY_ACTIVE, ou a
        // criação deu certo e só a resposta se perdeu) — reaproveita o
        // mesmo QR, nunca cria outro.
        setPhase('pending');
      } else if (status === 'pending') {
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

  function handleRetryCreate() {
    if ((phase !== 'error' && phase !== 'pending') || creatingRef.current || settledRef.current) return;
    creatingRef.current = true;
    setErrorMessage(null);
    setCheckMessage(null);
    setPhase('creating');
    setCreateRun((run) => run + 1);
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
        {createErrorKind === 'retry' ? (
          <>
            <p className="mt-2 text-sm text-ink-muted">Sua reserva continua guardada — não é preciso refazê-la.</p>
            <button type="button" onClick={handleRetryCreate} className="btn-primary mt-4 w-full">
              Tentar gerar Pix novamente
            </button>
          </>
        ) : null}
        {createErrorKind === 'verify' ? verifyAction : null}
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
          Não foi possível confirmar este pagamento.
        </p>
        {onNewAttempt ? (
          <button type="button" onClick={onNewAttempt} className="btn-primary mt-4 w-full">
            Gerar novo Pix
          </button>
        ) : null}
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
    // Tentativa existe no servidor, mas sem QR (ex.: criação interrompida
    // por timeout antes de chegar ao Asaas, e a página recarregou). O
    // polling continua; o replay é sempre um clique explícito, com a MESMA
    // Idempotency-Key — no NauticFlow isso devolve a mesma tentativa e
    // reconcilia/cria a cobrança por `externalReference`, nunca uma segunda.
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="text-sm text-ink-muted">Aguardando confirmação...</p>
        {canReplayCreate ? (
          <>
            <p className="mt-2 text-sm text-ink-muted">
              Se o código Pix não apareceu, recupere o mesmo Pix desta reserva — nenhuma cobrança nova é criada.
            </p>
            <button type="button" onClick={handleRetryCreate} className="btn-primary mt-4 w-full">
              Recuperar Pix
            </button>
          </>
        ) : null}
        {verifyAction}
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
