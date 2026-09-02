/**
 * Utilitário de Idempotency-Key do lado do navegador — preparado para a
 * Fase 3 (quando `BookingSelector` passar a chamar `POST /api/bookings`).
 * Nesta fase a key é gerada e mantida em estado local, mas **nunca**
 * enviada em nenhuma requisição — não existe fetch nesta etapa.
 *
 * Regra de regeneração (mesma descrita em
 * docs/RESERVAS-SERVER-TO-SERVER.md): a key pertence a UMA tentativa
 * lógica de reserva. Enquanto os dados semanticamente relevantes
 * (`departureId`, `quantity`, `customer.*`) não mudarem, a mesma key deve
 * ser reaproveitada — é isso que permite ao NauticFlow tratar um
 * duplo-clique ou um retry como a mesma operação. Se qualquer um desses
 * dados mudar, uma key nova precisa ser gerada, porque semanticamente é um
 * pedido diferente.
 *
 * `idempotencyFingerprint()` produz uma string estável desses dados; o
 * chamador (`BookingSelector`) compara o fingerprint atual com o da última
 * vez que gerou uma key — mudou, gera key nova; não mudou, reaproveita.
 */

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface IdempotencyFingerprintInput {
  departureId: string | null;
  quantity: number;
  name: string;
  email: string;
  phone: string;
  cpf: string;
}

export function idempotencyFingerprint(input: IdempotencyFingerprintInput): string {
  return JSON.stringify([
    input.departureId,
    input.quantity,
    input.name.trim(),
    input.email.trim().toLowerCase(),
    input.phone.trim(),
    input.cpf.trim(),
  ]);
}

export interface IdempotencyKeyState {
  key: string | null;
  fingerprint: string | null;
}

export interface ResolvedIdempotencyKey {
  key: string;
  fingerprint: string;
  /** true quando uma key NOVA foi gerada (não existia key, ou o fingerprint mudou); false quando a key existente foi reaproveitada. */
  regenerated: boolean;
}

/**
 * Decide se reaproveita a key existente ou gera uma nova, a partir do
 * estado atual e do fingerprint da tentativa agora. Extraído como função
 * pura (em vez de ficar só inline em `BookingSelector`) para o ciclo de
 * vida completo ser testável sem renderizar componente:
 *
 * - **Uma key por tentativa lógica / não muda em re-render:** chamar de
 *   novo com o MESMO fingerprint e a MESMA `state.key` devolve a mesma
 *   key (`regenerated: false`) — um re-render que não mudou nada não gera
 *   key nova.
 * - **Retry da mesma tentativa mantém a mesma key:** idem — enquanto
 *   `departureId`/`quantity`/dados do comprador não mudam, o fingerprint
 *   não muda, então a key não muda.
 * - **Mudança relevante gera nova tentativa/key:** fingerprint diferente
 *   do armazenado força `regenerated: true`.
 * - **Depois de sucesso definitivo, nova reserva recebe nova key:** o
 *   chamador (Fase 3, quando existir um step de sucesso) deve resetar o
 *   estado para `{ key: null, fingerprint: null }` após a reserva ser
 *   criada de verdade. Com `state.key === null`, esta função SEMPRE gera
 *   uma key nova, mesmo que o próximo fingerprint seja idêntico ao de
 *   antes (ex.: reservar o mesmo passeio de novo, com os mesmos dados) —
 *   nunca reaproveita a key de uma reserva já concluída.
 */
export function resolveIdempotencyKey(
  state: IdempotencyKeyState,
  nextFingerprint: string,
  generate: () => string = createIdempotencyKey,
): ResolvedIdempotencyKey {
  if (!state.key || nextFingerprint !== state.fingerprint) {
    return { key: generate(), fingerprint: nextFingerprint, regenerated: true };
  }
  return { key: state.key, fingerprint: state.fingerprint, regenerated: false };
}

/**
 * Versão sem fingerprint de `resolveIdempotencyKey()` — para uma
 * tentativa que não tem dado editável nenhum (o pagamento Pix: o único
 * "input" é "pagar esta reserva com Pix", sempre igual). Reaproveita a
 * key existente sempre que já existe uma; só gera nova quando `current`
 * é `null` — que é exatamente o estado depois de um reset (sucesso
 * definitivo do pagamento anterior, ver `BookingSelector`).
 *
 * Usado por `BookingSelector` no clique de "Pagar com Pix" — nasce ali,
 * vive em `useState` (nunca regenerada em re-render, porque
 * `useState` preserva a referência entre renders), e morre (`null`)
 * assim que `PixPayment` reporta `status: 'paid'`.
 */
export function resolvePaymentIdempotencyKey(
  current: string | null,
  generate: () => string = createIdempotencyKey,
): string {
  return current ?? generate();
}
