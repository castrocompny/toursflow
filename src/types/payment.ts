/**
 * Contrato REAL de pagamento do NauticFlow (confirmado 2026-09-02) —
 * não é mais hipótese.
 *
 * POST /api/marketplace/bookings/{bookingId}/payment
 *   Headers: Authorization: Bearer <TOURSFLOW_API_SECRET>,
 *            X-ToursFlow-Client-Key: <hmac>, Idempotency-Key: <uuid>
 *   Body: { paymentMethod: "pix" } — NUNCA envia amount; o NauticFlow
 *   recalcula o valor a partir da reserva.
 *   Com MARKETPLACE_PAYMENTS_ENABLED desligada (hoje), falha com
 *   `PAYMENT_PROVIDER_NOT_ENABLED` antes de criar qualquer tentativa.
 *
 * GET /api/marketplace/bookings/{bookingId}
 *   Headers: Authorization: Bearer <TOURSFLOW_API_SECRET>,
 *            X-ToursFlow-Client-Key: <hmac>
 *   Somente leitura, sem Idempotency-Key.
 *
 * ATENÇÃO (conferido no código do NauticFlow Production `ede8fb0`,
 * 30/09/2026): os dois NÃO devolvem o mesmo formato. O POST devolve a
 * TENTATIVA (`NauticFlowPaymentAttempt`, status/pix no topo); só o GET
 * devolve a "view" da reserva (`NauticFlowBookingPaymentView`). A rota do
 * ToursFlow (`/api/bookings/[bookingId]/payment` POST) junta os dois e
 * devolve sempre a view ao navegador — ver `mergePaymentAttemptIntoView`.
 *
 * Replay do POST com a MESMA Idempotency-Key devolve a tentativa já
 * existente (antes de qualquer checagem de hold) e reconcilia a cobrança
 * no Asaas por `externalReference` — nunca cria cobrança duplicada. Uma
 * Idempotency-Key NOVA só cria outra tentativa se nenhuma estiver
 * `pending`/`paid` (índice único `payments_one_active_per_reservation`),
 * senão `PAYMENT_ALREADY_ACTIVE`; depois de `failed` é "retry legítimo".
 */

/** Estados confirmados do payment endpoint — NUNCA acrescentar um valor não confirmado aqui (ver `ClientPaymentPhase` para estado derivado só na UI). */
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';

/** Único método suportado hoje. */
export type PaymentMethod = 'pix';

export interface NauticFlowPixData {
  /** Payload "copia e cola" do Pix (BR Code). */
  payload: string;
  /** Imagem do QR Code (base64), quando o NauticFlow devolve uma. */
  encodedImage?: string;
  expirationDate: string;
}

export interface NauticFlowPaymentInfo {
  status: PaymentStatus;
  method: PaymentMethod;
}

/** Resposta real do `POST .../payment` do NauticFlow (`MarketplacePaymentAttemptDTO`). */
export interface NauticFlowPaymentAttempt {
  paymentId: string;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  amountCents: number;
  currency: 'BRL';
  /** Só quando a cobrança Pix foi criada/reconciliada e ainda está pending. */
  pix?: NauticFlowPixData;
}

/** "View" devolvida por `GET .../bookings/{id}` — e pela rota POST do ToursFlow, já normalizada. */
export interface NauticFlowBookingPaymentView {
  bookingId: string;
  bookingStatus: string;
  holdExpiresAt: string;
  quantity: number;
  priceCents: number;
  totalCents: number;
  /** `null` quando nenhuma tentativa de pagamento foi iniciada ainda. */
  payment: NauticFlowPaymentInfo | null;
  /** Presente quando `payment.method === 'pix'` e ainda faz sentido mostrar o QR (pending, não expirado). */
  pix?: NauticFlowPixData;
}

/**
 * Estado usado só pela UI — nunca finge ser um `PaymentStatus` devolvido
 * pelo NauticFlow. `'expired'` é derivado no cliente: o countdown local
 * (`holdExpiresAt`/`pix.expirationDate` vs `Date.now()`) zerou E a
 * reconciliação + consulta final do servidor ainda devolveram `pending`
 * (ver `PixPayment`) — nunca uma falha definitiva; `'not_started'`
 * é antes de qualquer `POST .../payment` ter sido feito.
 */
export type ClientPaymentPhase = PaymentStatus | 'expired' | 'not_started';

/**
 * Códigos de erro do payment endpoint. Os 14 primeiros preservam o que o
 * NauticFlow devolve; os 3 últimos são específicos do ToursFlow (mesmo
 * padrão de `BookingErrorCode` em `src/types/booking.ts`).
 */
export type PaymentErrorCode =
  | 'INVALID_REQUEST' // ToursFlow-layer: Content-Type/tamanho de corpo/JSON malformado/bookingId com formato inválido — nunca um código do NauticFlow
  | 'UNAUTHORIZED'
  | 'INVALID_CLIENT_KEY'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_NOT_PENDING'
  | 'HOLD_EXPIRED'
  | 'PAYMENT_METHOD_NOT_SUPPORTED'
  | 'PAYMENT_IDEMPOTENCY_CONFLICT'
  | 'PAYMENT_ALREADY_ACTIVE'
  | 'PAYMENT_PROVIDER_NOT_ENABLED'
  | 'CUSTOMER_DOCUMENT_REQUIRED'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'PAYMENT_SERVICE_UNAVAILABLE' // ToursFlow-only: falha de comunicação (timeout/rede/resposta inválida) com o NauticFlow
  | 'CLIENT_IP_UNAVAILABLE'; // ToursFlow-only: mesmo conceito de client-ip.ts, reaproveitado aqui
