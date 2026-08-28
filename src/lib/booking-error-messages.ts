import type { BookingErrorCode } from '@/types/booking';

/**
 * Mensagem segura para exibir ao turista por código de erro de reserva —
 * preparado para a Fase 3 (quando a UI passar a chamar `POST /api/bookings`
 * de verdade). Não usado por nenhuma chamada real nesta fase.
 *
 * Nunca inclui detalhe técnico, nome de variável/segredo, ou o texto bruto
 * vindo do backend sem curadoria — só as 14 mensagens abaixo, uma por
 * `BookingErrorCode` (`src/types/booking.ts`). Status HTTP típico de cada
 * código documentado ao lado, só como referência (a UI decide a mensagem
 * pelo `code`, nunca pelo status sozinho).
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
  INSUFFICIENT_CAPACITY: 'Não há vagas suficientes para a quantidade escolhida. Tente reduzir a quantidade.', // 409
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.', // 429
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
