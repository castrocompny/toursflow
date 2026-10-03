/**
 * Recuperação da reserva/pagamento depois de reload (achado HIGH do Codex,
 * 02/10/2026): o turista copia o Pix, vai ao app do banco, e o navegador
 * pode recarregar a aba ao voltar — sem isto, `bookingId` e a key do
 * pagamento (só em estado React) se perdiam, e ele podia reservar/pagar de
 * novo.
 *
 * Só referências OPACAS, nunca PII (nome, e-mail, telefone, CPF, QR, valor):
 * - `bookingId` — UUID que o NauticFlow devolveu; o status autoritativo é
 *   reconsultado sempre por `GET /api/bookings/{bookingId}/payment`.
 * - `departureId` — só para saber se a recuperação pertence ao passeio da
 *   página atual e reexibir o resumo da saída.
 * - `paymentIdempotencyKey` — a key da tentativa de pagamento em curso, para
 *   que um retry depois do reload seja replay da MESMA tentativa (nunca uma
 *   cobrança nova); `null` antes de "Pagar com Pix".
 *
 * `sessionStorage` (não `localStorage`): sobrevive a reload/descarte da aba
 * — o caso real do app do banco — e some sozinho ao fechar a aba, então a
 * referência não fica para sempre no aparelho nem vaza para outras abas.
 *
 * Toda falha de storage (indisponível, cota, modo privado) é engolida: a
 * recuperação é um extra, nunca pode quebrar o checkout.
 */

export const BOOKING_RECOVERY_STORAGE_KEY = 'toursflow:booking-recovery';
const BOOKING_RECOVERY_VERSION = 1;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEPARTURE_ID_LENGTH = 100;

export interface BookingRecoveryState {
  bookingId: string;
  departureId: string;
  paymentIdempotencyKey: string | null;
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isValidState(value: unknown): value is BookingRecoveryState & { version: number } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === BOOKING_RECOVERY_VERSION &&
    typeof v.bookingId === 'string' &&
    UUID_RE.test(v.bookingId) &&
    typeof v.departureId === 'string' &&
    v.departureId.length > 0 &&
    v.departureId.length <= MAX_DEPARTURE_ID_LENGTH &&
    (v.paymentIdempotencyKey === null ||
      (typeof v.paymentIdempotencyKey === 'string' && UUID_RE.test(v.paymentIdempotencyKey)))
  );
}

/**
 * Estado salvo, ou `null`. Conteúdo inválido/corrompido/versão antiga é
 * apagado (só esta chave) e tratado como "nada a recuperar".
 */
export function readBookingRecovery(storage: Storage | null = getStorage()): BookingRecoveryState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BOOKING_RECOVERY_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) {
      storage.removeItem(BOOKING_RECOVERY_STORAGE_KEY);
      return null;
    }
    return { bookingId: parsed.bookingId, departureId: parsed.departureId, paymentIdempotencyKey: parsed.paymentIdempotencyKey };
  } catch {
    try {
      storage.removeItem(BOOKING_RECOVERY_STORAGE_KEY);
    } catch {
      // storage inutilizável — segue sem recuperação.
    }
    return null;
  }
}

/** Grava (sobrescreve) — uma reserva recuperável por aba. Whitelist explícita: nunca grava outro campo. */
export function saveBookingRecovery(state: BookingRecoveryState, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(
      BOOKING_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        version: BOOKING_RECOVERY_VERSION,
        bookingId: state.bookingId,
        departureId: state.departureId,
        paymentIdempotencyKey: state.paymentIdempotencyKey,
      }),
    );
  } catch {
    // cota/modo privado — o fluxo em memória continua funcionando.
  }
}

export function clearBookingRecovery(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(BOOKING_RECOVERY_STORAGE_KEY);
  } catch {
    // idem
  }
}
