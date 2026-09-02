/**
 * Contratos da integração de reservas ToursFlow -> NauticFlow.
 *
 * Deliberadamente separado de `src/types/index.ts` (contratos de catálogo):
 * reserva é escrita, com segredo envolvido, e não deve se misturar com o
 * modelo de leitura pública de passeios/destinos/categorias.
 */

export interface BookingCustomerInput {
  name: string;
  email: string;
  phone: string;
  cpf?: string;
}

/** Exatamente o que o ToursFlow aceita do navegador — nunca mais que isso. */
export interface BookingRequestInput {
  departureId: string;
  quantity: number;
  customer: BookingCustomerInput;
}

/**
 * Códigos de erro conhecidos. Os primeiros 12 vêm do NauticFlow
 * (`POST /api/marketplace/bookings`) e são preservados como estão.
 * `BOOKING_SERVICE_UNAVAILABLE` e `CLIENT_IP_UNAVAILABLE` são específicos do
 * ToursFlow: falha de comunicação e impossibilidade de determinar um IP
 * confiável do visitante, respectivamente — nunca confundir com um erro de
 * negócio do NauticFlow. `BOOKING_CHECKOUT_NOT_ENABLED` também é só do
 * ToursFlow: `BOOKING_CHECKOUT_ENABLED` (`src/lib/feature-flags.ts`)
 * desligada, mesmo padrão de `PAYMENT_PROVIDER_NOT_ENABLED` em
 * `src/types/payment.ts`.
 */
export type BookingErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'UNAUTHORIZED'
  | 'DEPARTURE_NOT_FOUND'
  | 'DEPARTURE_IN_PAST'
  | 'DEPARTURE_NOT_SELLABLE'
  | 'PRICE_NOT_CONFIGURED'
  | 'PRICE_TYPE_NOT_SELLABLE'
  | 'INSUFFICIENT_CAPACITY'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'BOOKING_SERVICE_UNAVAILABLE'
  | 'CLIENT_IP_UNAVAILABLE'
  | 'BOOKING_CHECKOUT_NOT_ENABLED';

/** `data` da resposta de sucesso do NauticFlow — repassado ao navegador quase sem alteração. */
export interface NauticFlowBookingResponseData {
  bookingId: string;
  status: string;
  holdExpiresAt: string;
  tour: { slug: string; name: string };
  departure: { id: string; departsAt: string };
  quantity: number;
  priceType: string;
  priceCents: number;
  totalCents: number;
  currency: string;
}
