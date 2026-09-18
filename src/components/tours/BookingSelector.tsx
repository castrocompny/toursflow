'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Clock, Minus, Plus, Users } from 'lucide-react';
import type { Departure } from '@/types';
import {
  formatDepartureDateShort,
  formatDepartureTimeRange,
  formatPrice,
  formatRelativeDepartureDate,
  priceTypeLabel,
} from '@/lib/format';
import {
  MIN_BOOKING_QUANTITY,
  availabilityLabel,
  calculateEstimatedTotal,
  canContinueBooking,
  clampQuantity,
  countAvailableInGroup,
  formatAvailableTimesCount,
  groupDeparturesByDate,
  isGroupAvailable,
  isSellablePriceType,
  sortDeparturesByDate,
  type DepartureGroup,
} from '@/lib/booking-selection';
import { EMPTY_CUSTOMER_FORM_VALUES, type CustomerFormValues } from '@/lib/customer-form';
import {
  idempotencyFingerprint,
  resolveIdempotencyKey,
  resolvePaymentIdempotencyKey,
  type IdempotencyKeyState,
} from '@/lib/idempotency-key';
import { buildBookingPayload, submitBooking } from '@/lib/booking-submission';
import type { ClientBookingErrorCode } from '@/lib/booking-error-messages';
import { BOOKING_CHECKOUT_ENABLED, PAYMENTS_UI_ENABLED } from '@/lib/feature-flags';
import { ToursFlowPaymentClient } from '@/lib/payment-client';
import type { NauticFlowBookingPaymentView } from '@/types/payment';
import { CustomerForm } from './CustomerForm';
import { BookingReview } from './BookingReview';
import { BookingConfirmation, type BookingConfirmationData } from './BookingConfirmation';
import { PixPayment } from './PixPayment';
import { BookingVoucher } from './BookingVoucher';

const UNSELLABLE_MESSAGE = 'Reserva online para este tipo de passeio ainda não está disponível.';

/**
 * Progressão de quantas datas extras (além da data em destaque) aparecem em
 * "Próximas datas" — nunca todas de uma vez (o NauticFlow pode ter dezenas
 * de saídas futuras geradas). Cada clique em "Ver mais datas" avança um
 * passo; o botão some quando não há mais nada a revelar.
 */
const DATE_REVEAL_STEPS = [3, 7, 14] as const;

// Client real (chama só as rotas do próprio ToursFlow, nunca o
// NauticFlow/Asaas diretamente) — a proteção contra uso em produção é
// PAYMENTS_UI_ENABLED (`src/lib/feature-flags.ts`), não este client:
// enquanto a flag for false, nenhum componente que o chama é alcançável
// pela UI real.
const paymentClient = new ToursFlowPaymentClient();

interface BookingSelectorProps {
  departures: Departure[];
  /**
   * Quantidade sugerida pela navegação anterior (ex.: `pessoas=4` na busca) —
   * só um ponto de partida de UX, nunca um filtro real de disponibilidade
   * (a API pública ainda não filtra por pessoas). Sempre passa por
   * `clampQuantity()` — se a saída escolhida tiver menos vagas que o
   * sugerido, a quantidade é reduzida automaticamente pro teto real.
   */
  initialQuantityHint?: number;
  /**
   * Duração do passeio (`tour.durationMinutes`) — usada só pra calcular o
   * horário final exibido ("09:00 às 14:00", ver `formatDepartureTimeRange`).
   * Opcional pra não obrigar toda chamada existente a passar: ausente ou
   * inválida, mostra só o horário de início, nunca inventa um horário final.
   */
  durationMinutes?: number;
}

type Step = 'selection' | 'customer-form' | 'review' | 'confirmation' | 'payment-pix' | 'voucher';
type SubmissionStatus = 'idle' | 'submitting' | 'error';

/**
 * Interface real de reserva: saída -> quantidade -> total estimado ->
 * dados do comprador -> revisão -> confirmação (hold). O step de revisão
 * chama `POST /api/bookings` de verdade — único ponto do projeto que cria
 * uma reserva real no NauticFlow (via `submitBooking()`) — **só quando
 * `BOOKING_CHECKOUT_ENABLED` está ligada** (`src/lib/feature-flags.ts`,
 * hoje `false`): sem ela, `BookingReview` não recebe `onConfirm` e mostra
 * o mesmo aviso "fale com o operador" de antes desta fase. A rota
 * `/api/bookings` falha fechada por conta própria com a flag off — não
 * depende da ausência do botão (mesma lição do ADR-012).
 *

 * O total mostrado antes da confirmação é só para o turista decidir —
 * nunca é a fonte de verdade do preço. Depois do sucesso, o step de
 * confirmação mostra `priceCents`/`totalCents` REAIS devolvidos pelo
 * NauticFlow, nunca o total estimado calculado no cliente.
 *
 * A API pública agora envia `availableSpots` (vagas reais restantes,
 * calculadas no NauticFlow — nunca a capacidade total da embarcação, que
 * continua interna) além de `soldOut`. A UI mostra essa disponibilidade e
 * usa `availableSpots` como teto VISUAL da quantidade (ver
 * `booking-selection.ts`), mas isso é só conveniência: o NauticFlow segue
 * sendo quem decide de fato se a quantidade é aceitável no momento exato da
 * reserva (recusa com `INSUFFICIENT_CAPACITY` se a vaga já tiver sido
 * consumida por outra compra concorrente entre o carregamento da página e a
 * submissão).
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
export function BookingSelector({ departures, initialQuantityHint, durationMinutes }: BookingSelectorProps) {
  const router = useRouter();
  const sorted = useMemo(() => sortDeparturesByDate(departures), [departures]);
  const groups = useMemo(() => groupDeparturesByDate(sorted), [sorted]);
  // Primeira DATA com disponibilidade real vem pré-selecionada (só o grupo —
  // nunca um horário específico, e nunca cria reserva nenhuma). Se todas as
  // datas estiverem esgotadas, cai na primeira mesmo assim, pra não deixar a
  // tela sem nenhuma data em destaque.
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(() => {
    const firstAvailable = groups.find((group) => isGroupAvailable(group));
    return (firstAvailable ?? groups[0])?.dateKey ?? null;
  });
  // Quantas datas extras (além da "próxima saída") já foram reveladas em
  // "Próximas datas" — índice em DATE_REVEAL_STEPS, avança 1 por clique em
  // "Ver mais datas". Nunca mostra todas as saídas futuras de uma vez.
  const [revealStepIndex, setRevealStepIndex] = useState(0);
  // Horário dentro da data escolhida — nunca pré-selecionado automaticamente,
  // mesmo quando a data tem um único horário: a escolha é sempre um clique
  // explícito do turista.
  const [selectedDepartureId, setSelectedDepartureId] = useState<string | null>(null);
  // `initialQuantityHint` (ex.: "pessoas" vindo da busca) é só um palpite de
  // UX — sem saída escolhida ainda não há teto de vagas real pra aplicar;
  // `handleSelectDeparture` reaplica `clampQuantity` com `availableSpots` da
  // saída assim que o turista escolhe um horário.
  const [quantity, setQuantity] = useState(() => clampQuantity(initialQuantityHint ?? MIN_BOOKING_QUANTITY));
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
  // Preenchido só quando PixPayment confirma 'paid' — hoje inatingível
  // pela UI real (PAYMENTS_UI_ENABLED === false).
  const [paymentResult, setPaymentResult] = useState<NauticFlowBookingPaymentView | null>(null);
  // Uma key por tentativa lógica de PAGAMENTO — conceito separado da
  // Idempotency-Key da reserva (`idempotencyKeyState` acima). Gerada uma
  // vez ao entrar no step `payment-pix`; como não há dado editável nesse
  // step (o método é sempre "pix"), não precisa de fingerprint — só não
  // pode ser gerada de novo a cada re-render.
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string | null>(null);

  // Índice da primeira data com disponibilidade real — vira o eyebrow
  // "Próxima saída". -1 quando nada está disponível (tudo esgotado ou não
  // vendável); nesse caso ainda mostramos a primeira data em destaque —
  // sem eyebrow de "próxima saída" — pra deixar claro POR QUE (esgotado/
  // indisponível), em vez de sumir com a informação. `allSoldOut`/
  // `hasUnsellable` mais abaixo cobrem a mensagem geral.
  const featuredIndex = groups.findIndex((group) => isGroupAvailable(group));
  const displayIndex = featuredIndex === -1 ? 0 : featuredIndex;
  const displayGroup = groups[displayIndex] ?? null;
  const isFeaturedAvailable = featuredIndex !== -1;
  // Só as datas DEPOIS da destacada — uma data anterior já esgotada não é
  // "próxima" de nada, não faz sentido misturar no "Próximas datas".
  const remainingGroups = groups.slice(displayIndex + 1);
  const visibleRemainingCount = Math.min(DATE_REVEAL_STEPS[revealStepIndex], remainingGroups.length);
  const canRevealMoreDates =
    revealStepIndex < DATE_REVEAL_STEPS.length - 1 && visibleRemainingCount < remainingGroups.length;

  const selectedGroup = groups.find((group) => group.dateKey === selectedDateKey) ?? displayGroup;
  const selectedDeparture = sorted.find((departure) => departure.id === selectedDepartureId) ?? null;
  const estimatedTotal = selectedDeparture ? calculateEstimatedTotal(selectedDeparture, quantity) : null;
  const canContinue = canContinueBooking(selectedDeparture, quantity);

  function handleSelectDate(group: DepartureGroup) {
    setSelectedDateKey(group.dateKey);
    // Trocar de data limpa o horário escolhido — o teto de vagas de um
    // horário do dia anterior não faz sentido pra um dia diferente, e
    // manter um `selectedDepartureId` de outra data escondido seria um
    // estado inconsistente (card mostrando resumo de uma saída que não
    // está mais visível na tela).
    setSelectedDepartureId(null);
  }

  function handleShowMoreDates() {
    setRevealStepIndex((current) => Math.min(current + 1, DATE_REVEAL_STEPS.length - 1));
  }

  function handleSelectDeparture(departure: Departure) {
    if (departure.soldOut || !isSellablePriceType(departure.priceType)) return;
    setSelectedDepartureId(departure.id);
    // reajusta a quantidade pro teto da NOVA saída escolhida (uma saída
    // anterior podia ter mais vagas que esta) -- nunca deixa uma quantidade
    // já inválida escondida atrás de "Continuar" desabilitado sem motivo.
    setQuantity((current) => clampQuantity(current, departure.availableSpots));
  }

  function handleQuantityChange(next: number) {
    setQuantity(clampQuantity(next, selectedDeparture?.availableSpots));
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
        onConfirm={BOOKING_CHECKOUT_ENABLED ? handleConfirmBooking : undefined}
        submitting={submissionStatus === 'submitting'}
        errorMessage={submissionError?.message ?? null}
      />
    );
  }

  if (step === 'confirmation' && selectedDeparture && bookingResult) {
    return (
      <BookingConfirmation
        departure={selectedDeparture}
        booking={bookingResult}
        onPayWithPix={
          PAYMENTS_UI_ENABLED
            ? () => {
                // Uma key nova por tentativa de pagamento — gerada uma
                // única vez ao entrar no step, nunca a cada re-render
                // (resolvePaymentIdempotencyKey só gera quando current é null).
                setPaymentIdempotencyKey((current) => resolvePaymentIdempotencyKey(current));
                setStep('payment-pix');
              }
            : undefined
        }
      />
    );
  }

  if (step === 'payment-pix' && bookingResult && paymentIdempotencyKey) {
    return (
      <PixPayment
        bookingId={bookingResult.bookingId}
        idempotencyKey={paymentIdempotencyKey}
        paymentClient={paymentClient}
        onPaid={(data) => {
          setPaymentResult(data);
          // Sucesso definitivo: uma eventual nova tentativa de pagamento
          // (outra reserva) precisa de key nova, nunca reaproveitar esta.
          setPaymentIdempotencyKey(null);
          setStep('voucher');
        }}
      />
    );
  }

  if (step === 'voucher' && selectedDeparture && paymentResult) {
    return <BookingVoucher departure={selectedDeparture} bookingId={paymentResult.bookingId} payment={paymentResult} />;
  }

  const allSoldOut = sorted.every((departure) => departure.soldOut);
  const hasUnsellable = sorted.some((departure) => !isSellablePriceType(departure.priceType));

  return (
    <div className="space-y-5">
      {displayGroup && selectedGroup ? (
        <div className="space-y-5">
          {/* Destaque: só a data em questão (a mais próxima com disponibilidade
              real, ou a que o turista escolheu em "Próximas datas" abaixo) — nunca
              a agenda inteira de uma vez, mesmo que o passeio saia todos os dias. */}
          <div className="space-y-2">
            {isFeaturedAvailable && selectedGroup.dateKey === displayGroup.dateKey ? (
              <p className="eyebrow">Próxima saída</p>
            ) : null}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-semibold capitalize text-ink">
              <Calendar size={16} aria-hidden />
              {formatRelativeDepartureDate(selectedGroup.departures[0].departsAt)}
            </p>
            <p className="text-sm text-ink-muted">{formatAvailableTimesCount(countAvailableInGroup(selectedGroup))}</p>

            {/* Horários da data em destaque — mostrados uma vez por horário, nunca
                repetindo a data (ela já está no cabeçalho acima). Se houver só um
                horário, esta lista mostra só ele. */}
            <ul className="space-y-2">
              {selectedGroup.departures.map((departure) => {
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
                      className={`flex w-full flex-col rounded-card border p-4 text-left transition active:scale-[0.98] ${
                        isDisabled
                          ? 'cursor-not-allowed border-ink/10 bg-sand opacity-60'
                          : isSelected
                            ? 'border-sea bg-foam'
                            : 'border-ink/15 bg-white hover:border-sea'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <Clock size={14} aria-hidden />
                        {formatDepartureTimeRange(departure.departsAt, durationMinutes)}
                      </span>
                      <span className="mt-1 font-display text-base font-bold text-ink">
                        {formatPrice(departure.price)}{' '}
                        <span className="text-xs font-medium text-ink-muted">{priceTypeLabel(departure.priceType)}</span>
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-3">
                        {departure.soldOut ? (
                          <span className="text-xs font-semibold text-ink-muted">Esgotado</span>
                        ) : !sellable ? (
                          <span className="text-xs font-semibold text-ink-muted">Indisponível</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                            <Users size={12} aria-hidden />
                            {availabilityLabel(departure.availableSpots)}
                          </span>
                        )}
                        {!isDisabled ? (
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white ${
                              isSelected ? 'bg-sea' : 'bg-ink'
                            }`}
                          >
                            {isSelected ? 'Selecionado' : 'Selecionar'}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {remainingGroups.length > 0 ? (
            <div className="space-y-2">
              <p className="eyebrow">Próximas datas</p>
              <div
                role="group"
                aria-label="Mais datas"
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch]"
              >
                {remainingGroups.slice(0, visibleRemainingCount).map((group) => {
                  const isSelected = group.dateKey === selectedDateKey;
                  const available = isGroupAvailable(group);
                  return (
                    <button
                      key={group.dateKey}
                      type="button"
                      disabled={!available}
                      aria-current={isSelected ? 'date' : undefined}
                      onClick={() => handleSelectDate(group)}
                      className={`flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-4 py-2.5 text-sm font-semibold capitalize transition active:scale-95 ${
                        !available
                          ? 'cursor-not-allowed border-ink/10 bg-sand text-ink-muted opacity-60'
                          : isSelected
                            ? 'border-sea bg-foam text-ink'
                            : 'border-ink/15 bg-white text-ink hover:border-sea'
                      }`}
                    >
                      {formatDepartureDateShort(group.departures[0].departsAt)}
                      {!available ? <span className="text-[10px] font-medium normal-case">Esgotado</span> : null}
                    </button>
                  );
                })}
              </div>
              {canRevealMoreDates ? (
                <button
                  type="button"
                  onClick={handleShowMoreDates}
                  className="inline-flex items-center rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink transition active:scale-95 hover:border-ink/40"
                >
                  Ver mais datas
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

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
                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink transition hover:border-ink/40 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                <Minus size={16} aria-hidden />
              </button>
              <input
                id="booking-quantity"
                name="quantity"
                type="number"
                inputMode="numeric"
                min={MIN_BOOKING_QUANTITY}
                max={selectedDeparture.availableSpots}
                value={quantity}
                onChange={(event) => handleQuantityChange(Number(event.target.value))}
                aria-label="Quantidade de pessoas"
                className="w-14 rounded-lg border border-ink/15 bg-white py-1.5 text-center font-semibold text-ink outline-none focus-visible:border-sea"
              />
              <button
                type="button"
                aria-label="Aumentar quantidade de pessoas"
                onClick={() => handleQuantityChange(quantity + 1)}
                disabled={quantity >= selectedDeparture.availableSpots}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink transition hover:border-ink/40 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <Users size={13} aria-hidden />
            {availabilityLabel(selectedDeparture.availableSpots)}
          </p>

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
        className="btn-primary w-full active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      >
        Continuar reserva
      </button>
    </div>
  );
}
