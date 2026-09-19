/**
 * Política de cancelamento/reembolso do MARKETPLACE — única fonte de
 * verdade para o que é exibido ao turista no ToursFlow. Decisão de
 * produto: o turista que reserva pelo ToursFlow não vê uma política
 * escrita livremente por cada operador (`tour.cancellationPolicy`, que
 * vem do NauticFlow e varia por passeio) — vê a política padronizada do
 * próprio marketplace, igual para qualquer passeio/operador/destino.
 *
 * `tour.cancellationPolicy` continua existindo no tipo `Tour` (o
 * NauticFlow ainda envia o campo, e o operador pode usá-lo em contextos
 * fora do marketplace público) — só deixou de ser a fonte da política
 * exibida nesta página. Ver ADR correspondente em docs/DECISIONS.md.
 *
 * Ainda não há autorização de produto para números financeiros/prazos
 * definitivos (ex.: "grátis até 24h", "50% após X horas") — enquanto
 * isso não for decidido (e enquanto booking/pagamento reais estiverem
 * desligados via BOOKING_CHECKOUT_ENABLED/PAYMENTS_UI_ENABLED), o `summary`
 * abaixo é a única copy pública: factual, sem prometer reembolso ou
 * gratuidade, sem inventar prazo, sem instruir a falar com o operador.
 *
 * Versionada desde já (`id`/`version`) para quando a regra financeira
 * real for aprovada: vira uma nova versão neste mesmo objeto, não uma
 * reescrita ad-hoc espalhada pela UI.
 */
export interface MarketplaceCancellationPolicy {
  /** Identificador estável da política — não muda entre versões. */
  id: string;
  /** Versão da política, formato AAAA-MM. Toda mudança de copy gera uma versão nova. */
  version: string;
  title: string;
  summary: string;
}

export const MARKETPLACE_CANCELLATION_POLICY: MarketplaceCancellationPolicy = {
  id: 'toursflow-standard',
  version: '2026-09',
  title: 'Cancelamento e reembolso',
  summary:
    'As condições de cancelamento e reembolso das reservas feitas pelo ToursFlow são definidas pelo próprio marketplace e serão apresentadas antes da confirmação da reserva.',
};
