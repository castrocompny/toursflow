'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Clock, Minus, Plus, Users } from 'lucide-react';
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
  groupDeparturesByDate,
  isGroupAvailable,
  isSellablePriceType,
  sortDeparturesByDate,
  type DepartureGroup,
} from '@/lib/booking-selection';
import { EMPTY_CUSTOMER_FORM_VALUES, validateCpf, type CustomerFormValues } from '@/lib/customer-form';
import {
  createIdempotencyKey,
  idempotencyFingerprint,
  resolveIdempotencyKey,
  resolvePaymentIdempotencyKey,
  type IdempotencyKeyState,
} from '@/lib/idempotency-key';
import { buildBookingPayload, submitBooking } from '@/lib/booking-submission';
import type { ClientBookingErrorCode } from '@/lib/booking-error-messages';
import { BOOKING_CHECKOUT_ENABLED, PAYMENTS_UI_ENABLED } from '@/lib/feature-flags';
import { isHoldExpired } from '@/lib/hold-countdown';
import { PaymentClientError, ToursFlowPaymentClient } from '@/lib/payment-client';
import {
  findBookingRecovery,
  removeBookingRecovery,
  saveBookingRecovery,
  type BookingRecoveryState,
} from '@/lib/booking-recovery';
import type { NauticFlowBookingPaymentView } from '@/types/payment';
import { CustomerForm } from './CustomerForm';
import { BookingReview } from './BookingReview';
import { BookingConfirmation, type BookingConfirmationData } from './BookingConfirmation';
import { PixPayment } from './PixPayment';
import { BookingVoucher } from './BookingVoucher';

const UNSELLABLE_MESSAGE = 'Reserva online para este tipo de passeio ainda não está disponível.';

/**
 * Quantas datas ficam montadas no DOM de uma vez na faixa "Escolha a data" —
 * nunca a agenda inteira (o NauticFlow pode ter saídas geradas todo santo
 * dia por meses). `‹`/`›` deslizam a janela por cima do array completo de
 * datas.
 *
 * O número muda por faixa de largura real (`useDateWindowSize` abaixo) —
 * não é só um CSS escondendo chips extras enquanto a lógica continua achando
 * que 7 estão visíveis: `windowStart`/`maxWindowStart`/`visibleDateGroups`
 * (mais abaixo) sempre usam o valor atual, então a quantidade que a
 * navegação `‹ ›` considera é exatamente a quantidade renderizada. Antes
 * disso, o valor era fixo em 7 e dependia só de `overflow-x-auto` pra
 * "sumir" com o excesso em telas estreitas — o que na prática criava uma
 * faixa horizontal longa e pesada no mobile (chips demais montados ao mesmo
 * tempo), em vez de recortar de fato a janela.
 *
 * `SMALL_MOBILE_DATE_WINDOW_SIZE` existe porque, mesmo depois de enxugar
 * gap/padding do chip (ver classes abaixo), 4 chips de largura variável
 * (`Qua 23` é o mais largo) só cabem sem cortar/rolar a partir de ~400px de
 * viewport real — abaixo disso (ex.: 320/360/375/390, testado visualmente),
 * o último chip ficava parcialmente visível com scroll horizontal interno.
 * 3 chips cabe com folga mesmo em 320px.
 */
const SMALL_MOBILE_DATE_WINDOW_SIZE = 3;
const MOBILE_DATE_WINDOW_SIZE = 4;
const TABLET_DATE_WINDOW_SIZE = 5;
const DESKTOP_DATE_WINDOW_SIZE = 7;

/** Mesmos breakpoints já usados no resto do projeto: `md` (768px, ver `Header`/`MobileMenu`) separa mobile de tablet, `lg` (1024px) separa tablet de desktop. `SMALL_MOBILE_BREAKPOINT_PX` é específico desta faixa de datas (não usado em mais nenhum lugar do projeto). */
const SMALL_MOBILE_BREAKPOINT_PX = 400;
const TABLET_BREAKPOINT_PX = 768;
const DESKTOP_BREAKPOINT_PX = 1024;

function resolveDateWindowSize(viewportWidth: number): number {
  if (viewportWidth >= DESKTOP_BREAKPOINT_PX) return DESKTOP_DATE_WINDOW_SIZE;
  if (viewportWidth >= TABLET_BREAKPOINT_PX) return TABLET_DATE_WINDOW_SIZE;
  if (viewportWidth >= SMALL_MOBILE_BREAKPOINT_PX) return MOBILE_DATE_WINDOW_SIZE;
  return SMALL_MOBILE_DATE_WINDOW_SIZE;
}

/**
 * SSR-safe de propósito: a primeira renderização (servidor E a primeira
 * passada no cliente, antes do `useEffect` rodar) sempre usa
 * `SMALL_MOBILE_DATE_WINDOW_SIZE` (o menor de todos, não mais
 * `MOBILE_DATE_WINDOW_SIZE`) — nunca lê `window` durante o render, só depois
 * de montado, pra nunca divergir do HTML gerado no servidor (sem isso, dá
 * mismatch de hidratação). Usar o menor tamanho como valor universal evita
 * qualquer flash de overflow em telas muito estreitas antes do efeito
 * ajustar pro valor real. O ajuste pro valor real da tela acontece uma vez
 * logo após montar (e de novo a cada resize/orientação), então só quem
 * carrega fora do menor tier vê a janela crescer depois do primeiro paint —
 * sem isso não haveria como saber a largura real antes de o JS rodar no
 * navegador.
 */
function useDateWindowSize(): number {
  const [size, setSize] = useState(SMALL_MOBILE_DATE_WINDOW_SIZE);

  useEffect(() => {
    const update = () => setSize(resolveDateWindowSize(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return size;
}

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
  /** `tour.name`/`tour.boardingPoint.*` — usados só no voucher final (`BookingVoucher`), pro resumo/mensagem de compartilhamento. Opcionais pra não obrigar toda chamada existente a passar: ausentes, o voucher só omite essas linhas. */
  tourName?: string;
  boardingPointName?: string;
  boardingPointReference?: string;
  /**
   * `tour.slug` — identificador estável do passeio que liga a recuperação
   * depois de reload (`booking-recovery.ts`) a esta página. Independe do
   * catálogo de saídas à venda: a compra continua recuperável mesmo quando a
   * saída esgota ou sai da lista. Ausente: sem recuperação.
   */
  tourSlug?: string;
  /**
   * Chamado quando a recuperação some (`BOOKING_NOT_FOUND` ou "Fazer outra
   * reserva") — usado pelo `BookingRecoveryFallback`, que monta este
   * componente sem catálogo (passeio despublicado/catálogo fora) e precisa
   * voltar ao 404/erro em vez de mostrar uma seleção vazia.
   */
  onRecoveryDismissed?: () => void;
}

type Step =
  | 'selection'
  | 'customer-form'
  | 'review'
  | 'confirmation'
  | 'payment-pix'
  | 'voucher'
  // Recuperação depois de reload (`booking-recovery.ts`): só GET, nunca POST.
  | 'recovering'
  | 'recovery-error'
  // Recuperada sem pagamento e com o hold vencido: só "Fazer outra reserva".
  | 'recovery-expired';
type SubmissionStatus = 'idle' | 'submitting' | 'error';

/**
 * Interface real de reserva: saída -> quantidade -> total estimado ->
 * dados do comprador -> revisão -> confirmação (hold). O step de revisão
 * chama `POST /api/bookings` de verdade — único ponto do projeto que cria
 * uma reserva real no NauticFlow (via `submitBooking()`) — **só quando
 * `BOOKING_CHECKOUT_ENABLED` está ligada** (`src/lib/feature-flags.ts`,
 * hoje `false`): sem ela, `BookingReview` não recebe `onConfirm` e mostra
 * só o aviso de que a reserva online chega em breve (nunca instrui a
 * contatar o operador diretamente). A rota
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
 * memória — nunca em localStorage/URL — para sobreviver à navegação entre
 * steps sem se perder. Depois de um sucesso, só o subconjunto seguro da
 * resposta (`BookingConfirmationData`) é guardado — nunca a resposta bruta
 * inteira, nunca PII em nenhum lugar persistente. Exceção deliberada, só com
 * `PAYMENTS_UI_ENABLED`: referências OPACAS da reserva já criada
 * (`bookingId`, `tourSlug`, `departsAt`, key do pagamento) em `sessionStorage`, para
 * recuperar o fluxo depois de um reload — ver `src/lib/booking-recovery.ts`.
 *
 * NÃO IMPLEMENTADO: pagamento (Asaas/PIX/cartão/split/webhook/voucher) —
 * o step de confirmação deixa isso explícito para o turista.
 */
export function BookingSelector({
  departures,
  initialQuantityHint,
  durationMinutes,
  tourName,
  boardingPointName,
  boardingPointReference,
  tourSlug,
  onRecoveryDismissed,
}: BookingSelectorProps) {
  const router = useRouter();
  const dateWindowSize = useDateWindowSize();
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
  // Início da janela de datas visível em "Escolha a data" — desliza com
  // `‹`/`›` por cima do array completo de `groups`, nunca monta mais que
  // `dateWindowSize` chips no DOM de uma vez. Começa na primeira data com
  // disponibilidade real (mesmo critério do `selectedDateKey` acima), pra
  // ela já aparecer dentro da janela sem precisar navegar. Usa
  // `SMALL_MOBILE_DATE_WINDOW_SIZE` aqui (não `dateWindowSize`) porque este
  // `useState` só roda uma vez, na primeira renderização — o mesmo momento
  // em que `dateWindowSize` ainda é o valor SSR-safe (o menor de todos); o
  // efeito abaixo reajusta `windowStart` quando o tamanho real da janela
  // chega.
  const [windowStart, setWindowStart] = useState(() => {
    const firstAvailableIndex = groups.findIndex((group) => isGroupAvailable(group));
    const start = firstAvailableIndex === -1 ? 0 : firstAvailableIndex;
    return Math.min(start, Math.max(0, groups.length - SMALL_MOBILE_DATE_WINDOW_SIZE));
  });
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
  // Recuperação depois de reload: view lida por GET, entregue ao PixPayment
  // para exibir a tentativa existente sem POST de criação.
  const [recoveredView, setRecoveredView] = useState<NauticFlowBookingPaymentView | null>(null);
  const [recoveredKeyIsOriginal, setRecoveredKeyIsOriginal] = useState(true);
  const [recoveryState, setRecoveryState] = useState<BookingRecoveryState | null>(null);
  const [recoveryErrorMessage, setRecoveryErrorMessage] = useState<string | null>(null);
  // Uma única recuperação por montagem — inclusive no double-invoke de
  // efeitos do React Strict Mode (GET é leitura, mas não precisa duplicar).
  const recoveryStartedRef = useRef(false);
  const recoveringRef = useRef(false);

  // Janela atual de datas — só essas ficam montadas no DOM da faixa
  // "Escolha a data" (nunca a agenda inteira, mesmo com saída diária por
  // meses). `maxWindowStart` garante que `›` nunca desliza além do fim.
  const maxWindowStart = Math.max(0, groups.length - dateWindowSize);
  const visibleDateGroups = groups.slice(windowStart, windowStart + dateWindowSize);
  const canGoToPreviousDates = windowStart > 0;
  const canGoToNextDates = windowStart < maxWindowStart;

  // `dateWindowSize` muda depois de montado (viewport real) e pode encolher
  // de novo num resize/orientação — sem isto, um `windowStart` válido pra
  // uma janela maior pode ficar além do novo `maxWindowStart`, cortando
  // datas do fim (`visibleDateGroups` devolveria menos que `dateWindowSize`
  // itens) sem que `›` perceba que já devia estar desabilitado. Só nunca
  // AUMENTA `windowStart` sozinho — isso poderia esconder uma data já
  // selecionada; só recua o mínimo pra caber de novo dentro da janela.
  useEffect(() => {
    setWindowStart((current) => Math.min(current, maxWindowStart));
  }, [maxWindowStart]);

  // Recuperação depois de reload: só com o checkout de pagamento ligado, só
  // para uma reserva DESTE passeio (`tourSlug`; reserva de outro passeio
  // fica guardada para a página dele) e sempre por GET — nunca POST de
  // reserva ou de Pix. Não depende da saída continuar no catálogo de venda
  // (`departures`): esgotada, passada ou lista vazia, a compra continua
  // recuperável (achado HIGH do Codex, 02/10/2026).
  useEffect(() => {
    if (!PAYMENTS_UI_ENABLED || !tourSlug || recoveryStartedRef.current) return;
    recoveryStartedRef.current = true;
    // Só a entrada DESTE passeio; as de outros passeios ficam intactas no
    // registro para as páginas deles (v3, uma entrada por bookingId).
    const saved = findBookingRecovery(tourSlug);
    if (!saved) return;
    setRecoveryState(saved);
    void recoverBooking(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recoverBooking(saved: BookingRecoveryState) {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    setRecoveryErrorMessage(null);
    setStep('recovering');
    try {
      const view = await paymentClient.getBookingPaymentStatus(saved.bookingId);
      applyRecoveredView(view, saved);
    } catch (error) {
      if (error instanceof PaymentClientError && error.code === 'BOOKING_NOT_FOUND') {
        // Reserva não existe mais (ou nunca foi do marketplace): nada a
        // recuperar — limpa só a referência e volta ao fluxo normal.
        removeBookingRecovery(saved.bookingId);
        setRecoveryState(null);
        setStep('selection');
        onRecoveryDismissed?.();
      } else {
        // Falha transitória: mantém a referência, nunca cria nada — o
        // turista tenta de novo (GET) quando quiser.
        setRecoveryErrorMessage('Não foi possível verificar sua reserva agora.');
        setStep('recovery-error');
      }
    } finally {
      recoveringRef.current = false;
    }
  }

  function applyRecoveredView(view: NauticFlowBookingPaymentView, saved: BookingRecoveryState) {
    setBookingResult({
      bookingId: view.bookingId,
      status: view.bookingStatus,
      holdExpiresAt: view.holdExpiresAt,
      priceCents: view.priceCents,
      totalCents: view.totalCents,
      quantity: view.quantity,
    });
    if (view.payment?.status === 'paid') {
      setPaymentResult(view);
      setStep('voucher');
      return;
    }
    if (!view.payment) {
      // Sem NENHUMA tentativa de pagamento, não há dinheiro em jogo: hold
      // vencido (`holdExpiresAt` do servidor) ou reserva cancelada vira um
      // estado final com "Fazer outra reserva" (achado MEDIUM do Codex) —
      // nunca uma confirmação inutilizável restaurada a cada reload. Com
      // tentativa existente (abaixo) isso NUNCA acontece: pending segue para
      // reconciliação no PixPayment, mesmo com o prazo local vencido.
      if (view.bookingStatus === 'cancelada' || isHoldExpired(view.holdExpiresAt)) {
        setStep('recovery-expired');
        return;
      }
      // Reserva criada, Pix ainda não iniciado: volta à confirmação — só o
      // clique em "Pagar com Pix" cria o pagamento.
      setStep('confirmation');
      return;
    }
    // Tentativa existente (pending/failed/estornada): exibida a partir da
    // view, sem POST. A key salva é a da MESMA tentativa (retry = replay);
    // sem ela, a key nova só seria usada por uma ação explícita.
    setPaymentIdempotencyKey(saved.paymentIdempotencyKey ?? createIdempotencyKey());
    // Sem a key original, nunca oferece replay de criação (só GET).
    setRecoveredKeyIsOriginal(saved.paymentIdempotencyKey !== null);
    setRecoveredView(view);
    setStep('payment-pix');
  }

  function handleStartNewBooking() {
    // Remove só a entrada da reserva atual — reservas de outros passeios
    // (e outras chaves do sessionStorage) continuam intactas.
    const currentBookingId = bookingResult?.bookingId ?? recoveryState?.bookingId;
    if (currentBookingId) removeBookingRecovery(currentBookingId);
    setRecoveryState(null);
    setBookingResult(null);
    setPaymentResult(null);
    setPaymentIdempotencyKey(null);
    setRecoveredView(null);
    setSelectedDepartureId(null);
    setStep('selection');
    onRecoveryDismissed?.();
  }

  /** Grava a referência opaca de recuperação (só no checkout com Pix e com `tourSlug`). */
  function persistRecovery(bookingId: string, departsAt: string, paymentIdempotencyKey: string | null) {
    if (!PAYMENTS_UI_ENABLED || !tourSlug) return;
    saveBookingRecovery({ bookingId, tourSlug, departsAt, paymentIdempotencyKey });
  }

  const selectedGroup = groups.find((group) => group.dateKey === selectedDateKey) ?? groups[0] ?? null;
  const selectedDeparture = sorted.find((departure) => departure.id === selectedDepartureId) ?? null;
  // Confirmação/Pix/voucher só exibem `departsAt`: vem da saída escolhida
  // ou, depois de reload, da referência de recuperação — nunca exige que a
  // saída ainda esteja no catálogo de venda.
  const bookedDeparture: { departsAt: string } | null =
    selectedDeparture ?? (recoveryState ? { departsAt: recoveryState.departsAt } : null);
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

  // Navegação da janela de datas — nunca troca a data selecionada sozinha,
  // só desliza quais chips ficam visíveis. Passo de 1 (não a janela
  // inteira) pra sempre sobrepor com a página anterior, sem "pular" uma
  // data no meio.
  function handleGoToPreviousDates() {
    setWindowStart((current) => Math.max(0, current - 1));
  }

  function handleGoToNextDates() {
    setWindowStart((current) => Math.min(maxWindowStart, current + 1));
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
    // Mesma regra do formulário, conferida de novo antes do POST: nunca cria
    // uma reserva que não conseguirá gerar o Pix.
    if (PAYMENTS_UI_ENABLED && validateCpf(customer.cpf, { required: true })) {
      setStep('customer-form');
      return;
    }
    // Já existe uma reserva recuperável deste passeio nesta aba (ex.: outra
    // aba duplicada, ou a recuperação ainda não terminou): nunca cria uma
    // segunda — retoma a existente (GET), sem POST.
    const existing = PAYMENTS_UI_ENABLED && tourSlug ? findBookingRecovery(tourSlug) : null;
    if (existing) {
      setRecoveryState(existing);
      void recoverBooking(existing);
      return;
    }
    isSubmittingRef.current = true;
    setSubmissionStatus('submitting');
    setSubmissionError(null);

    const payload = buildBookingPayload(selectedDeparture.id, quantity, customer);
    const result = await submitBooking(payload, idempotencyKeyState.key);

    if (result.ok) {
      // Referência opaca da reserva já criada ANTES de qualquer outra coisa:
      // um reload a partir daqui recupera a mesma reserva (GET), nunca cria
      // outra. Só no checkout com Pix (sem ele não há o que recuperar).
      persistRecovery(result.data.bookingId, selectedDeparture.departsAt, null);
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

  if (step === 'recovering') {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6" role="status">
        <p className="text-sm text-ink-muted">Verificando sua reserva...</p>
      </div>
    );
  }

  if (step === 'recovery-error' && recoveryState) {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p role="alert" className="text-sm text-red-700">
          {recoveryErrorMessage}
        </p>
        <p className="mt-2 text-sm text-ink-muted">Sua reserva continua guardada — não faça outra reserva nem outro pagamento.</p>
        <button type="button" onClick={() => void recoverBooking(recoveryState)} className="btn-primary mt-4 w-full">
          Verificar novamente
        </button>
      </div>
    );
  }

  if (step === 'recovery-expired' && bookingResult) {
    return (
      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="eyebrow">Reserva expirada</p>
        <h3 className="mt-2 font-display text-xl font-bold">Esta reserva expirou.</h3>
        <p className="mt-2 text-sm text-ink-muted">
          O prazo para pagar a reserva {bookingResult.bookingId} acabou sem nenhum pagamento iniciado. Nenhum valor foi cobrado.
        </p>
        <button type="button" onClick={handleStartNewBooking} className="btn-primary mt-4 w-full">
          Fazer outra reserva
        </button>
      </div>
    );
  }

  if (departures.length === 0 && step === 'selection') {
    return (
      <p className="rounded-card border border-dashed border-ink/20 bg-sand px-5 py-6 text-center text-sm text-ink-muted">
        Nenhuma saída programada no momento. Volte em breve para conferir novas datas.
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
        // Checkout com Pix: CPF válido ANTES de criar a reserva — o NauticFlow
        // só exige no Pix, e a reserva já criada não tem como corrigir o CPF.
        cpfRequired={PAYMENTS_UI_ENABLED}
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

  if (step === 'confirmation' && bookedDeparture && bookingResult) {
    return (
      <BookingConfirmation
        departure={bookedDeparture}
        onStartNewBooking={handleStartNewBooking}
        booking={bookingResult}
        onPayWithPix={
          PAYMENTS_UI_ENABLED
            ? () => {
                // Uma key nova por tentativa de pagamento — gerada uma
                // única vez ao entrar no step, nunca a cada re-render
                // (resolvePaymentIdempotencyKey só gera quando current é null).
                // Gravada junto da reserva ANTES do POST: um reload no meio
                // reaproveita a mesma tentativa, nunca abre outra.
                const key = resolvePaymentIdempotencyKey(paymentIdempotencyKey);
                setPaymentIdempotencyKey(key);
                persistRecovery(bookingResult.bookingId, bookedDeparture.departsAt, key);
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
        // Key nova = tentativa nova: remonta o componente do zero (fase,
        // polling, refs) em vez de herdar o estado `failed` da anterior.
        key={paymentIdempotencyKey}
        bookingId={bookingResult.bookingId}
        idempotencyKey={paymentIdempotencyKey}
        paymentClient={paymentClient}
        // Só depois de `failed` confirmado pelo servidor — mesmo booking,
        // Idempotency-Key NOVA (contrato do NauticFlow para retry legítimo).
        onNewAttempt={() => {
          const key = createIdempotencyKey();
          setRecoveredView(null);
          setRecoveredKeyIsOriginal(true);
          setPaymentIdempotencyKey(key);
          if (bookedDeparture) persistRecovery(bookingResult.bookingId, bookedDeparture.departsAt, key);
        }}
        initialView={recoveredView ?? undefined}
        canReplayCreate={recoveredView ? recoveredKeyIsOriginal : true}
        onPaid={(data) => {
          // A referência de recuperação continua salva: um reload depois do
          // pagamento ainda mostra o voucher (GET). Some ao fechar a aba ou em
          // "Fazer outra reserva".
          setPaymentResult(data);
          // Sucesso definitivo: uma eventual nova tentativa de pagamento
          // (outra reserva) precisa de key nova, nunca reaproveitar esta.
          setPaymentIdempotencyKey(null);
          setStep('voucher');
        }}
      />
    );
  }

  if (step === 'voucher' && bookedDeparture && paymentResult) {
    return (
      <div className="space-y-3">
        <BookingVoucher
          departure={bookedDeparture}
          bookingId={paymentResult.bookingId}
          payment={paymentResult}
          tourName={tourName}
          boardingPointName={boardingPointName}
          boardingPointReference={boardingPointReference}
        />
        {/* Pagamento já confirmado pelo servidor: começar outra reserva é seguro (nunca reaproveita esta). */}
        <button type="button" onClick={handleStartNewBooking} className="btn-secondary w-full">
          Fazer outra reserva
        </button>
      </div>
    );
  }

  const allSoldOut = sorted.every((departure) => departure.soldOut);
  const hasUnsellable = sorted.some((departure) => !isSellablePriceType(departure.priceType));

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Faixa "Escolha a data" — janela deslizante de no máximo `dateWindowSize`
          chips (3 <400px / 4 mobile / 5 tablet / 7 desktop), nunca a agenda
          inteira montada de uma vez. `‹`/`›` deslizam a janela; tocar num chip
          troca a data expandida abaixo, sem mudar a janela sozinho. */}
      <div>
        <p className="text-sm font-semibold text-ink">Escolha a data</p>
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            aria-label="Ver datas anteriores"
            disabled={!canGoToPreviousDates}
            onClick={handleGoToPreviousDates}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-ink/15 text-ink transition active:scale-90 hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>

          <div
            role="group"
            aria-label="Datas disponíveis"
            className="flex flex-1 gap-1 overflow-x-auto scroll-smooth px-0 py-1 sm:gap-1.5 sm:px-1 [-webkit-overflow-scrolling:touch]"
          >
            {visibleDateGroups.map((group) => {
              const isSelected = group.dateKey === selectedDateKey;
              const available = isGroupAvailable(group);
              return (
                <button
                  key={group.dateKey}
                  type="button"
                  disabled={!available}
                  aria-pressed={isSelected}
                  onClick={() => handleSelectDate(group)}
                  className={`flex min-h-[44px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1.5 py-1.5 text-sm font-semibold capitalize transition active:scale-95 sm:min-w-[56px] sm:px-1.5 sm:py-2 ${
                    !available
                      ? 'cursor-not-allowed border-ink/10 bg-sand text-ink-muted opacity-60'
                      : isSelected
                        ? 'border-sea bg-foam text-ink'
                        : 'border-ink/15 bg-white text-ink hover:border-sea hover:bg-foam'
                  }`}
                >
                  {formatDepartureDateShort(group.departures[0].departsAt)}
                  {!available ? <span className="text-[10px] font-medium normal-case">Esgotado</span> : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Ver mais datas"
            disabled={!canGoToNextDates}
            onClick={handleGoToNextDates}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-ink/15 text-ink transition active:scale-90 hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>

      {/* Painel único da data selecionada — nunca um card por data. Horários
          da mesma data viram linhas dentro DESTE painel (divididas por
          linha fina, não bordas de card), sem repetir o cabeçalho de data. */}
      {selectedGroup ? (
        <div className="border-t border-ink/10 pt-3 sm:pt-4">
          <p className="font-display text-base font-bold capitalize text-ink sm:text-lg">
            {formatRelativeDepartureDate(selectedGroup.departures[0].departsAt)}
          </p>

          <ul className="mt-2 divide-y divide-ink/10 sm:mt-3">
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
                    className={`flex w-full flex-col gap-1.5 rounded-xl px-2 py-2.5 text-left transition active:scale-[0.99] sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-3 ${
                      isDisabled ? 'cursor-not-allowed opacity-50' : isSelected ? 'bg-foam' : 'hover:bg-sand/60'
                    }`}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-row sm:items-center sm:gap-4">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <Clock size={14} aria-hidden />
                        {formatDepartureTimeRange(departure.departsAt, durationMinutes)}
                      </span>
                      <span className="font-display text-sm font-bold text-ink sm:text-base">
                        {formatPrice(departure.price)}{' '}
                        <span className="text-xs font-medium text-ink-muted">{priceTypeLabel(departure.priceType)}</span>
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-3 sm:justify-end">
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
                          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold text-white ${
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
        <div className="rounded-card border border-ink/10 bg-white p-4 sm:p-5">
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

          <dl className="mt-3 space-y-1.5 border-t border-ink/10 pt-3 text-sm sm:mt-4 sm:space-y-2 sm:pt-4">
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
