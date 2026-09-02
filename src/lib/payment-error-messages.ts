import type { PaymentErrorCode } from '@/types/payment';

/**
 * Mensagem segura para exibir ao turista por código de erro de pagamento
 * — nunca o texto bruto do NauticFlow/provider, nunca detalhe técnico.
 * Usada tanto pela rota interna (`/api/bookings/[bookingId]/payment`,
 * caso precise expor algo além do `code`) quanto pelo client-side
 * (`ToursFlowPaymentClient`/`PixPayment`).
 */
export const PAYMENT_ERROR_MESSAGES: Record<PaymentErrorCode, string> = {
  INVALID_REQUEST: 'Não foi possível processar o pagamento. Atualize a página e tente novamente.',
  UNAUTHORIZED: 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.',
  INVALID_CLIENT_KEY: 'Não foi possível iniciar o pagamento agora. Tente novamente.',
  INVALID_IDEMPOTENCY_KEY: 'Não foi possível iniciar o pagamento. Atualize a página e tente novamente.',
  BOOKING_NOT_FOUND: 'Não encontramos esta reserva. Volte e tente novamente.',
  BOOKING_NOT_PENDING: 'Esta reserva não está mais disponível para pagamento.',
  HOLD_EXPIRED: 'O tempo da sua reserva expirou antes do pagamento ser iniciado.',
  PAYMENT_METHOD_NOT_SUPPORTED: 'Esta forma de pagamento não está disponível no momento.',
  PAYMENT_IDEMPOTENCY_CONFLICT:
    'Detectamos uma tentativa anterior com dados diferentes. Atualize a página e tente novamente.',
  PAYMENT_ALREADY_ACTIVE: 'Já existe um pagamento em andamento para esta reserva.',
  PAYMENT_PROVIDER_NOT_ENABLED:
    'Pagamento online ainda não está disponível. Fale com o operador para confirmar sua reserva.',
  CUSTOMER_DOCUMENT_REQUIRED: 'Para pagar com Pix, informe o CPF nos dados do comprador.',
  PAYMENT_PROVIDER_ERROR: 'Não foi possível processar o pagamento agora. Tente novamente em instantes.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.',
  INTERNAL_ERROR: 'Não foi possível completar o pagamento agora. Tente novamente em instantes.',
  PAYMENT_SERVICE_UNAVAILABLE: 'O serviço de pagamento está indisponível no momento. Tente novamente em instantes.',
  CLIENT_IP_UNAVAILABLE: 'Não foi possível iniciar o pagamento agora. Tente novamente.',
};

const DEFAULT_MESSAGE = PAYMENT_ERROR_MESSAGES.INTERNAL_ERROR;

function isPaymentErrorCode(value: unknown): value is PaymentErrorCode {
  return typeof value === 'string' && value in PAYMENT_ERROR_MESSAGES;
}

/** Nunca lança para código desconhecido — cai na mensagem genérica segura. */
export function getPaymentErrorMessage(code: unknown): string {
  return isPaymentErrorCode(code) ? PAYMENT_ERROR_MESSAGES[code] : DEFAULT_MESSAGE;
}

/** Código só do cliente: `fetch` falhou sem nenhuma resposta do servidor (rede, timeout). */
export const PAYMENT_NETWORK_ERROR_CODE = 'NETWORK_ERROR' as const;
export type ClientPaymentErrorCode = PaymentErrorCode | typeof PAYMENT_NETWORK_ERROR_CODE;

const NETWORK_ERROR_MESSAGE =
  'Não foi possível confirmar o status do pagamento agora. Verifique sua conexão e tente novamente.';

export function getClientPaymentErrorMessage(code: unknown): string {
  if (code === PAYMENT_NETWORK_ERROR_CODE) return NETWORK_ERROR_MESSAGE;
  return getPaymentErrorMessage(code);
}
