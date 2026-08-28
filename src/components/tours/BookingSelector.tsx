'use client';

import { useMemo, useState } from 'react';
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
import { CustomerForm } from './CustomerForm';
import { BookingReview } from './BookingReview';

const UNSELLABLE_MESSAGE = 'Reserva online para este tipo de passeio ainda não está disponível.';

interface BookingSelectorProps {
  departures: Departure[];
}

type Step = 'selection' | 'customer-form' | 'review';

/**
 * Interface real de reserva: saída -> quantidade -> total estimado ->
 * dados do comprador -> revisão. Fase 2 do fluxo — ainda NÃO chama
 * `POST /api/bookings` em nenhum step; a Fase 3 conecta o step de revisão
 * ao backend.
 *
 * O total mostrado aqui é só para o turista decidir — nunca é a fonte de
 * verdade do preço. Quando o checkout existir, o valor cobrado será
 * sempre recalculado no servidor a partir do `departureId` (ver
 * docs/RESERVAS-SERVER-TO-SERVER.md), nunca este número calculado no
 * cliente.
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
 *
 * Estado (departure/quantidade/dados do comprador) vive todo aqui, em
 * memória — nunca em localStorage/sessionStorage/URL — para sobreviver à
 * navegação entre steps sem se perder, e para nunca deixar PII em nenhum
 * lugar persistente antes de existir uma reserva de verdade.
 */
export function BookingSelector({ departures }: BookingSelectorProps) {
  const [selectedDepartureId, setSelectedDepartureId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(MIN_BOOKING_QUANTITY);
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY_CUSTOMER_FORM_VALUES);
  const [step, setStep] = useState<Step>('selection');
  // Estado bruto ({key, fingerprint}) para resolveIdempotencyKey() decidir
  // reaproveitar ou regenerar — nunca enviada nesta fase (sem fetch algum).
  // Depois de um sucesso definitivo (Fase 3), resetar para {key: null,
  // fingerprint: null} garante que a próxima reserva NUNCA reaproveita a
  // key de uma reserva já concluída, mesmo com os mesmos dados.
  const [idempotencyKeyState, setIdempotencyKeyState] = useState<IdempotencyKeyState>({
    key: null,
    fingerprint: null,
  });

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
    // mudaram desde a última vez, ou gera uma nova — nunca enviada nesta
    // fase, só preparada para a Fase 3 (ver src/lib/idempotency-key.ts).
    const fingerprint = idempotencyFingerprint({ departureId: selectedDepartureId, quantity, ...values });
    const resolved = resolveIdempotencyKey(idempotencyKeyState, fingerprint);
    setIdempotencyKeyState({ key: resolved.key, fingerprint: resolved.fingerprint });

    setStep('review');
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
      />
    );
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
