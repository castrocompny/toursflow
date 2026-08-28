import type { BookingErrorCode } from '@/types/booking';

/**
 * Mensagem segura para exibir ao turista por código de erro de reserva.
 * Usada pela Fase 3 (`src/lib/booking-submission.ts`) na única chamada
 * real a `POST /api/bookings` do projeto.
 *
 * Nunca inclui detalhe técnico, nome de variável/segredo, ou o texto bruto
 * vindo do backend sem curadoria — só as 14 mensagens abaixo, uma por
 * `BookingErrorCode` (`src/types/booking.ts`), mais `NETWORK_ERROR`
 * (`getClientBookingErrorMessage()` abaixo) para quando o `fetch` falha
 * sem nenhuma resposta do servidor. Status HTTP típico de cada código
 * documentado ao lado, só como referência (a UI decide a mensagem pelo
 * `code`, nunca pelo status sozinho).
 */
export const BOOKING_ERROR_MESSAGES: Record<BookingErrorCode, string> = {
  INVALID_REQUEST: 'Não foi possível processar os dados enviados. Confira e tente novamente.', // 400
  INVALID_IDEMPOTENCY_KEY: 'Não foi possível iniciar a reserva. Atualize a página e tente novamente.', // 400
  UNAUTHORIZED: 'Não foi possível completar a reserva agora. Tente novamente em instantes.', // 401/403
  DEPARTURE_NOT_FOUND: 'Esta saída não está mais disponível. Escolha outra data.', // 404
  DEPARTURE_IN_PAST: 'Esta saída já passou. Escolha uma data futura.', // 409/422
  DEPARTURE_NOT_SELLABLE: 'Esta saída não está disponível para reserva online no momento.', // 409/422
  PRICE_NOT_CONFIGURED: 'Este passeio não está disponível para reserva online no momento.', // 422
  PRICE_TYPE_NOT_SELLABLE: 'Este tipo de passeio não está disponível para reserva online no momento.', // 422
  INSUFFICIENT_CAPACITY: 'Essa saída não possui mais disponibilidade para a quantidade selecionada.', // 409
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.', // 429
  IDEMPOTENCY_CONFLICT: 'Detectamos uma tentativa anterior com dados diferentes. Atualize a página e tente novamente.', // 409
  INTERNAL_ERROR: 'Não foi possível completar a reserva agora. Tente novamente em instantes.', // 500
  BOOKING_SERVICE_UNAVAILABLE: 'O serviço de reservas está indisponível no momento. Tente novamente em instantes.', // 503
  CLIENT_IP_UNAVAILABLE: 'Não foi possível iniciar a reserva agora. Tente novamente.', // 503
};

const DEFAULT_MESSAGE = BOOKING_ERROR_MESSAGES.INTERNAL_ERROR;

function isBookingErrorCode(value: unknown): value is BookingErrorCode {
  return typeof value === 'string' && value in BOOKING_ERROR_MESSAGES;
}

/** Nunca lança para código desconhecido — cai na mensagem genérica segura. */
export function getBookingErrorMessage(code: unknown): string {
  return isBookingErrorCode(code) ? BOOKING_ERROR_MESSAGES[code] : DEFAULT_MESSAGE;
}

/** Código só do cliente: `fetch` falhou sem nenhuma resposta do servidor (rede, timeout, CORS). */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR' as const;
export type ClientBookingErrorCode = BookingErrorCode | typeof NETWORK_ERROR_CODE;

const NETWORK_ERROR_MESSAGE =
  'Não foi possível confirmar se a reserva foi criada. Verifique sua conexão — se o problema persistir, tente novamente com o mesmo pedido.';

/**
 * Mesma coisa que `getBookingErrorMessage()`, mas também cobre
 * `NETWORK_ERROR` — usada em `booking-submission.ts`, que é quem lida com
 * a possibilidade real de o `fetch` falhar sem resposta nenhuma.
 */
export function getClientBookingErrorMessage(code: unknown): string {
  if (code === NETWORK_ERROR_CODE) return NETWORK_ERROR_MESSAGE;
  return getBookingErrorMessage(code);
}
