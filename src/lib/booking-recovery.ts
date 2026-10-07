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
 * - `tourSlug` — identificador estável do PASSEIO (não da saída): diz se a
 *   recuperação pertence à página atual. A saída pode sair do catálogo de
 *   VENDA (esgotou, passou) e a compra continua precisando ser recuperável
 *   (achado HIGH do Codex, 02/10/2026) — por isso a recuperação não depende
 *   mais da saída estar listada.
 * - `departsAt` — data/hora pública da saída (não é PII), única informação
 *   da saída que confirmação/voucher exibem; o GET do NauticFlow não a
 *   devolve. Gravada no momento da reserva, quando a saída é conhecida.
 * - `paymentIdempotencyKey` — a key da tentativa de pagamento em curso, para
 *   que um retry depois do reload seja replay da MESMA tentativa (nunca uma
 *   cobrança nova); `null` antes de "Pagar com Pix".
 *
 * `sessionStorage` (não `localStorage`): sobrevive a reload/descarte da aba
 * — o caso real do app do banco — e some sozinho ao fechar a aba, então a
 * referência não fica para sempre no aparelho nem vaza para outras abas.
 *
 * v3 (achado HIGH do Codex, 02/10/2026): um REGISTRO por aba, com uma
 * entrada independente por `bookingId` — reservar o passeio B nunca apaga a
 * recuperação de um Pix ainda pendente do passeio A. `tourSlug` é só o
 * índice de busca da página atual; gravar, atualizar e remover sempre
 * atingem uma única entrada.
 *
 * Toda falha de storage (indisponível, cota, modo privado) é engolida: a
 * recuperação é um extra, nunca pode quebrar o checkout.
 */

export const BOOKING_RECOVERY_STORAGE_KEY = 'toursflow:booking-recovery';
// v3 (02/10/2026): `{ version, bookings: { [bookingId]: entrada } }`.
// v2 (uma única entrada) é migrada para v3; v1 e qualquer outra coisa são
// descartadas (v1/v2 só existiram no Preview, nunca em Production).
const BOOKING_RECOVERY_VERSION = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOUR_SLUG_LENGTH = 200;
const MAX_DEPARTS_AT_LENGTH = 40;

export interface BookingRecoveryState {
  bookingId: string;
  tourSlug: string;
  departsAt: string;
  paymentIdempotencyKey: string | null;
}

type Registry = Map<string, BookingRecoveryState>;

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isValidEntry(value: unknown): value is BookingRecoveryState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.bookingId === 'string' &&
    UUID_RE.test(v.bookingId) &&
    typeof v.tourSlug === 'string' &&
    v.tourSlug.length > 0 &&
    v.tourSlug.length <= MAX_TOUR_SLUG_LENGTH &&
    typeof v.departsAt === 'string' &&
    v.departsAt.length <= MAX_DEPARTS_AT_LENGTH &&
    !Number.isNaN(new Date(v.departsAt).getTime()) &&
    (v.paymentIdempotencyKey === null ||
      (typeof v.paymentIdempotencyKey === 'string' && UUID_RE.test(v.paymentIdempotencyKey)))
  );
}

/** Whitelist explícita — só estes 4 campos, nunca o objeto recebido. */
function pick(entry: BookingRecoveryState): BookingRecoveryState {
  return {
    bookingId: entry.bookingId,
    tourSlug: entry.tourSlug,
    departsAt: entry.departsAt,
    paymentIdempotencyKey: entry.paymentIdempotencyKey,
  };
}

function removeKey(storage: Storage): void {
  try {
    storage.removeItem(BOOKING_RECOVERY_STORAGE_KEY);
  } catch {
    // storage inutilizável — segue sem recuperação.
  }
}

/**
 * Lê o registro. Conteúdo ilegível/versão desconhecida apaga só esta chave;
 * entradas individuais inválidas são descartadas (as válidas continuam).
 */
function loadRegistry(storage: Storage): Registry {
  const registry: Registry = new Map();
  let raw: string | null;
  try {
    raw = storage.getItem(BOOKING_RECOVERY_STORAGE_KEY);
  } catch {
    return registry;
  }
  if (raw === null) return registry;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeKey(storage);
    return registry;
  }

  const v = (parsed ?? {}) as Record<string, unknown>;
  let entries: unknown[];
  if (v.version === BOOKING_RECOVERY_VERSION && v.bookings && typeof v.bookings === 'object') {
    entries = Object.values(v.bookings as Record<string, unknown>);
  } else if (v.version === 2) {
    entries = [v]; // v2: a própria raiz era a única entrada
  } else {
    removeKey(storage);
    return registry;
  }

  for (const entry of entries) {
    if (isValidEntry(entry)) registry.set(entry.bookingId, pick(entry));
  }
  if (registry.size !== entries.length || v.version !== BOOKING_RECOVERY_VERSION) persist(storage, registry);
  return registry;
}

function persist(storage: Storage, registry: Registry): void {
  try {
    if (registry.size === 0) {
      storage.removeItem(BOOKING_RECOVERY_STORAGE_KEY);
      return;
    }
    storage.setItem(
      BOOKING_RECOVERY_STORAGE_KEY,
      JSON.stringify({ version: BOOKING_RECOVERY_VERSION, bookings: Object.fromEntries(registry) }),
    );
  } catch {
    // cota/modo privado — o fluxo em memória continua funcionando.
  }
}

/** Todas as reservas recuperáveis desta aba (ordem de criação). */
export function readBookingRecoveries(storage: Storage | null = getStorage()): BookingRecoveryState[] {
  return storage ? [...loadRegistry(storage).values()] : [];
}

/**
 * A reserva recuperável deste passeio, ou `null`. O `BookingSelector` não
 * cria uma segunda reserva do mesmo passeio enquanto existir uma aqui, então
 * em uso normal há no máximo uma; se ainda assim houver mais (aba
 * duplicada etc.), devolve sempre a mais recente — nunca uma ao acaso.
 */
export function findBookingRecovery(tourSlug: string, storage: Storage | null = getStorage()): BookingRecoveryState | null {
  const forTour = readBookingRecoveries(storage).filter((entry) => entry.tourSlug === tourSlug);
  return forTour[forTour.length - 1] ?? null;
}

/** Upsert de UMA entrada (por `bookingId`) — nunca apaga as demais. */
export function saveBookingRecovery(state: BookingRecoveryState, storage: Storage | null = getStorage()): void {
  if (!storage || !isValidEntry(state)) return;
  const registry = loadRegistry(storage);
  registry.set(state.bookingId, pick(state));
  persist(storage, registry);
}

/** Remove só a entrada desta reserva; as de outras reservas/passeios ficam. */
export function removeBookingRecovery(bookingId: string, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  const registry = loadRegistry(storage);
  if (!registry.delete(bookingId)) return;
  persist(storage, registry);
}
