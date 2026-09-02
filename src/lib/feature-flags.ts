/**
 * `PAYMENTS_UI_ENABLED` espelha, do lado do ToursFlow, o estado de
 * `MARKETPLACE_PAYMENTS_ENABLED` no NauticFlow — hoje desligada lá, então
 * também travada em `false` aqui. Constante literal (não lê env var nem
 * header), de propósito: mudar isso exige um code change revisado, nunca
 * uma variável de ambiente que alguém possa ligar sem revisão.
 *
 * Enquanto `false`: `BookingConfirmation` não mostra nenhum caminho para
 * `PixPayment`, e nenhum componente do fluxo Pix é alcançável pela UI
 * real — só existem porque são testados diretamente (ver
 * `PixPayment.test.tsx`).
 *
 * Só mude para `true` depois que TODAS estas condições forem verdade:
 * 1. `MARKETPLACE_PAYMENTS_ENABLED` ligada em produção no NauticFlow.
 * 2. O contrato real do endpoint de pagamento estiver confirmado e
 *    `src/lib/payment-client.ts` tiver uma implementação real (não
 *    `NotImplementedPaymentClient`).
 * 3. Revisão explícita autorizando expor o fluxo publicamente.
 */
export const PAYMENTS_UI_ENABLED = false;
