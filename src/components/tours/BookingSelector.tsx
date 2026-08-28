'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Clock, Minus, Plus } from 'lucide-react';
import type { Departure } from '@/types';
import { formatDepartureDateTime, formatPrice, priceTypeLabel } from '@/lib/format';
import {
  MIN_BOOKING_QUANTITY,
  calculateEstimatedTotal,
  canContinueBooking,
  clampQuantity,
  isSellablePriceType,
  sortDeparturesByDate,
} from '@/lib/booking-selection';
import { EMPTY_CUSTOMER_FORM_VALUES, type CustomerFormValues } from '@/lib/customer-form';
import { idempotencyFingerprint, resolveIdempotencyKey, type IdempotencyKeyState } from '@/lib/idempotency-key';
import { buildBookingPayload, submitBooking } from '@/lib/booking-submission';
import type { ClientBookingErrorCode } from '@/lib/booking-error-messages';
import { CustomerForm } from './CustomerForm';
import { BookingReview } from './BookingReview';
import { BookingConfirmation, type BookingConfirmationData } from './BookingConfirmation';

const UNSELLABLE_MESSAGE = 'Reserva online para este tipo de passeio ainda não está disponível.';

interface BookingSelectorProps {
  departures: Departure[];
}

type Step = 'selection' | 'customer-form' | 'review' | 'confirmation';
type SubmissionStatus = 'idle' | 'submitting' | 'error';

/**
 * Interface real de reserva: saída -> quantidade -> total estimado ->
 * dados do comprador -> revisão -> confirmação (hold). Fase 3: o step de
 * revisão chama `POST /api/bookings` de verdade — único ponto do projeto
 * que cria uma reserva real no NauticFlow (via `submitBooking()`).
 *
 * O total mostrado antes da confirmação é só para o turista decidir —
 * nunca é a fonte de verdade do preço. Depois do sucesso, o step de
 * confirmação mostra `priceCents`/`totalCents` REAIS devolvidos pelo
 * NauticFlow, nunca o total estimado calculado no cliente.
 *
 * A API pública não envia capacidade numérica restante — só `soldOut`
 * binário. Por isso não existe "restam N vagas". Também não há teto
 * máximo de quantidade: o contrato do NauticFlow não define nenhum
 * (só o mínimo de 1 é uma regra real, ver `booking-selection.ts`) — quem
 * decide se a quantidade é aceitável é o NauticFlow, na hora da reserva.
 *
 * Nem todo `priceType` é vendável (ver `isSellablePriceType`): saídas
 * `starting_from` (catálogo, NauticFlow `a_partir_de`) ou `per_boat` (sem
 * equivalente confirmado no NauticFlow hoje) aparecem na lista mas não
 * podem ser selecionadas — o card fica desabilitado e a mensagem de
 * indisponibilidade é exibida, nunca é possível chegar em "Continuar".
 * Mesmo assim, o NauticFlow continua a autoridade final: se responder
 * `PRICE_TYPE_NOT_SELLABLE` (dado mudou entre o carregamento da página e a
 * submissão), o erro é tratado como qualquer outro.
 *
 * Estado (departure/quantidade/dados do comprador) vive todo aqui, em
 * memória — nunca em localStorage/sessionStorage/URL — para sobreviver à
 * navegação entre steps sem se perder. Depois de um sucesso, só o
 * subconjunto seguro da resposta (`BookingConfirmationData`) é guardado —
 * nunca a resposta bruta inteira, nunca PII em nenhum lugar persistente.
 *
 * NÃO IMPLEMENTADO: pagamento (Asaas/PIX/cartão/split/webhook/voucher) —
 * o step de confirmação deixa isso explícito para o turista.
 */
export function BookingSelector({ departures }: BookingSelectorProps) {
  const router = useRouter();
  const [selectedDepartureId, setSelectedDepartureId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(MIN_BOOKING_QUANTITY);
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY_CUSTOMER_FORM_VALUES);
  const [step, setStep] = useState<Step>('selection');
  // Estado bruto ({key, fingerprint}) para resolveIdempotencyKey() decidir
  // reaproveitar ou regenerar. Reaproveitada em retry/re-render (mesmo
  // pedido lógico); resetada para {key: null, fingerprint: null} depois
  // de um sucesso definitivo OU de um IDEMPOTENCY_CONFLICT (nunca faz
  // sentido reusar uma key que o servidor já rejeitou por conflito).
  const [idempotencyKeyState, setIdempotencyKeyState] = useState<IdempotencyKeyState>({
    key: null,
    fingerprint: null,
  });
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [submissionError, setSubmissionError] = useState<{ code: ClientBookingErrorCode; message: string } | null>(
    null,
  );
  const [bookingResult, setBookingResult] = useState<BookingConfirmationData | null>(null);
  // Guarda síncrona contra duplo-clique/duplo-submit — não depende do
  // re-render de `submissionStatus` (state) ter acontecido a tempo.
  const isSubmittingRef = useRef(false);

  const sorted = useMemo(() => sortDeparturesByDate(departures), [departures]);
  const selectedDeparture = sorted.find((departure) => departure.id === selectedDepartureId) ?? null;
  const estimatedTotal = selectedDeparture ? calculateEstimatedTotal(selectedDeparture, quantity) : null;
  const canContinue = canContinueBooking(selectedDeparture, quantity);

  function handleSelectDeparture(departure: Departure) {
    if (departure.soldOut || !isSellablePriceType(departure.priceType)) return;
    setSelectedDepartureId(departure.id);
  }

  function handleQuantityChange(next: number) {
    setQuantity(clampQuantity(next));
  }

  function handleContinue() {
    if (!canContinue) return;
    setStep('customer-form');
  }

  function handleCustomerSubmit(values: CustomerFormValues) {
    setCustomer(values);

    // Reaproveita a Idempotency-Key existente se os dados relevantes não
    // mudaram desde a última vez, ou gera uma nova.
    const fingerprint = idempotencyFingerprint({ departureId: selectedDepartureId, quantity, ...values });
    const resolved = resolveIdempotencyKey(idempotencyKeyState, fingerprint);
    setIdempotencyKeyState({ key: resolved.key, fingerprint: resolved.fingerprint });
    setSubmissionError(null);

    setStep('review');
  }

  async function handleConfirmBooking() {
    if (isSubmittingRef.current || !selectedDeparture || !idempotencyKeyState.key) return;
    isSubmittingRef.current = true;
    setSubmissionStatus('submitting');
    setSubmissionError(null);

    const payload = buildBookingPayload(selectedDeparture.id, quantity, customer);
    const result = await submitBooking(payload, idempotencyKeyState.key);

    if (result.ok) {
      // Só o subconjunto seguro em memória — nunca a resposta bruta inteira.
      setBookingResult({
        bookingId: result.data.bookingId,
        status: result.data.status,
        holdExpiresAt: result.data.holdExpiresAt,
        priceCents: result.data.priceCents,
        totalCents: result.data.totalCents,
        quantity: result.data.quantity,
      });
      // Sucesso definitivo (criação real ou replay da mesma reserva): a
      // próxima tentativa de reserva (mesmo com dados idênticos) precisa
      // de uma key nova — nunca reaproveitar a de uma reserva concluída.
      setIdempotencyKeyState({ key: null, fingerprint: null });
      setSubmissionStatus('idle');
      isSubmittingRef.current = false;
      setStep('confirmation');
      return;
    }

    setSubmissionError({ code: result.code, message: result.message });
    setSubmissionStatus('error');
    isSubmittingRef.current = false;

    if (result.code === 'IDEMPOTENCY_CONFLICT') {
      // O servidor já rejeitou esta key por conflito — reusá-la de novo
      // só repetiria o mesmo 409. Força uma key nova na próxima tentativa.
      setIdempotencyKeyState({ key: null, fingerprint: null });
    }

    if (result.code === 'INSUFFICIENT_CAPACITY') {
      // Atualiza a disponibilidade real (soldOut) sem tentar outra saída
      // automaticamente — o turista decide, ao voltar para a seleção, com
      // dado fresco (Server Component reexecuta `listDepartures`).
      router.refresh();
    }
  }

  if (departures.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-ink/20 bg-sand px-5 py-6 text-center text-sm text-ink-muted">
        Nenhuma saída programada no momento. Fale com o operador para saber a próxima disponibilidade.
      </p>
    );
  }

  if (step === 'customer-form' && selectedDeparture) {
    return (
      <CustomerForm
        values={customer}
        onChange={setCustomer}
        onSubmit={handleCustomerSubmit}
        onBack={() => setStep('selection')}
      />
    );
  }

  if (step === 'review' && selectedDeparture) {
    return (
      <BookingReview
        departure={selectedDeparture}
        quantity={quantity}
        estimatedTotal={estimatedTotal ?? 0}
        customer={customer}
        onEdit={() => setStep('customer-form')}
        onBack={() => setStep('selection')}
        onConfirm={handleConfirmBooking}
        submitting={submissionStatus === 'submitting'}
        errorMessage={submissionError?.message ?? null}
      />
    );
  }

  if (step === 'confirmation' && selectedDeparture && bookingResult) {
    return <BookingConfirmation departure={selectedDeparture} booking={bookingResult} />;
  }

  const allSoldOut = sorted.every((departure) => departure.soldOut);
  const hasUnsellable = sorted.some((departure) => !isSellablePriceType(departure.priceType));

  return (
    <div className="space-y-5">
      <ul className="grid gap-3 sm:grid-cols-2">
        {sorted.map((departure) => {
          const { date, time } = formatDepartureDateTime(departure.departsAt);
          const isSelected = selectedDepartureId === departure.id;
          const sellable = isSellablePriceType(departure.priceType);
          const isDisabled = departure.soldOut || !sellable;

          return (
            <li key={departure.id}>
              <button
                type="button"
                disabled={isDisabled}
                aria-pressed={isSelected}
                onClick={() => handleSelectDeparture(departure)}
                className={`flex w-full flex-col gap-2 rounded-card border p-4 text-left transition-colors ${
                  isDisabled
                    ? 'cursor-not-allowed border-ink/10 bg-sand opacity-60'
                    : isSelected
                      ? 'border-sea bg-foam'
                      : 'border-ink/15 bg-white hover:border-sea'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold capitalize text-ink">
                    <Calendar size={14} aria-hidden />
                    {date}
                  </span>
                  {departure.soldOut ? (
                    <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold text-ink-muted">
                      Esgotado
                    </span>
                  ) : !sellable ? (
                    <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold text-ink-muted">
                      Indisponível
                    </span>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
                  <Clock size={14} aria-hidden />
                  {time}
                </span>
                <span className="font-display text-base font-bold text-ink">
                  {formatPrice(departure.price)}{' '}
                  <span className="text-xs font-medium text-ink-muted">{priceTypeLabel(departure.priceType)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {allSoldOut ? (
        <p className="rounded-card border border-dashed border-ink/20 bg-sand px-5 py-4 text-center text-sm text-ink-muted">
          Todas as saídas programadas estão esgotadas no momento.
        </p>
      ) : null}

      {hasUnsellable ? (
        <p className="rounded-card border border-dashed border-ink/20 bg-sand px-5 py-4 text-center text-sm text-ink-muted">
          {UNSELLABLE_MESSAGE}
        </p>
      ) : null}

      {selectedDeparture ? (
        <div className="rounded-card border border-ink/10 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label htmlFor="booking-quantity" className="text-sm font-semibold text-ink">
              Quantas pessoas?
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Diminuir quantidade de pessoas"
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= MIN_BOOKING_QUANTITY}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={16} aria-hidden />
              </button>
              <input
                id="booking-quantity"
                name="quantity"
                type="number"
                inputMode="numeric"
                min={MIN_BOOKING_QUANTITY}
                value={quantity}
                onChange={(event) => handleQuantityChange(Number(event.target.value))}
                aria-label="Quantidade de pessoas"
                className="w-14 rounded-lg border border-ink/15 bg-white py-1.5 text-center font-semibold text-ink outline-none focus-visible:border-sea"
              />
              <button
                type="button"
                aria-label="Aumentar quantidade de pessoas"
                onClick={() => handleQuantityChange(quantity + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </div>

          <dl className="mt-4 space-y-2 border-t border-ink/10 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Preço {priceTypeLabel(selectedDeparture.priceType)}</dt>
              <dd className="font-semibold">{formatPrice(selectedDeparture.price)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Total estimado</dt>
              <dd className="font-display text-lg font-bold">{formatPrice(estimatedTotal ?? 0)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-muted">
            Valor estimado. O preço final é sempre confirmado pelo operador no momento da reserva.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!canContinue}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continuar reserva
      </button>
    </div>
  );
}
