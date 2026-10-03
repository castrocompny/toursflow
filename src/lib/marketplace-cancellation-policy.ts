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
 * Condições comerciais aprovadas pelo usuário em 02/10/2026 (versão
 * `2026-10`, achado do Codex de 02/10/2026: o checkout não podia exibir só
 * um placeholder). `summary` resume a regra; `terms` é a lista completa,
 * exibida no checkout (`BookingReview`) antes de "Confirmar reserva" e na
 * página do passeio. Nenhuma condição além das aprovadas — sem multa, sem
 * prazo de estorno específico.
 *
 * Versionada (`id`/`version`): toda mudança de texto vira uma nova
 * versão neste mesmo objeto, não uma reescrita ad-hoc espalhada pela UI.
 * A reserva ainda NÃO grava `id`/`version` (CANCELLATION_POLICY_SNAPSHOT_PENDING,
 * ADR-016).
 */
export interface MarketplaceCancellationPolicy {
  /** Identificador estável da política — não muda entre versões. */
  id: string;
  /** Versão da política, formato AAAA-MM. Toda mudança de copy gera uma versão nova. */
  version: string;
  title: string;
  summary: string;
  /** Condições concretas, na ordem em que são exibidas. */
  terms: readonly string[];
}

export const MARKETPLACE_CANCELLATION_POLICY: MarketplaceCancellationPolicy = {
  id: 'toursflow-standard',
  version: '2026-10',
  title: 'Cancelamento e reembolso',
  summary:
    'Reembolso integral com pelo menos 48 horas de antecedência, 50% entre 24 e 48 horas antes do passeio e sem reembolso com menos de 24 horas ou em caso de não comparecimento.',
  terms: [
    'Cancelamentos solicitados com pelo menos 48 horas de antecedência: reembolso integral.',
    'Cancelamentos solicitados entre 24 e 48 horas antes do passeio: reembolso de 50%.',
    'Cancelamentos com menos de 24 horas de antecedência: sem reembolso.',
    'Não comparecimento (no-show): sem reembolso.',
    'Se o passeio for cancelado pelo operador por condições climáticas, condições marítimas, segurança ou impossibilidade operacional, você pode escolher entre remarcação ou reembolso integral.',
    'Reembolsos aprovados são processados pelo mesmo meio de pagamento utilizado na reserva, respeitando o prazo operacional do meio de pagamento.',
  ],
};

/**
 * Ponto único de leitura da política pública para um passeio. Recebe o
 * passeio só pela forma do contrato — nunca lê `cancellationPolicy` —
 * pra deixar explícito, num lugar só, que a política pública do
 * marketplace não depende (e não deve voltar a depender) do texto que o
 * operador cadastrou no NauticFlow, seja qual for esse texto. Qualquer
 * página que precise exibir a política de cancelamento deve chamar esta
 * função, nunca ler `tour.cancellationPolicy` diretamente.
 */
export function resolveCancellationPolicy(tour: { cancellationPolicy: string }): MarketplaceCancellationPolicy {
  void tour;
  return MARKETPLACE_CANCELLATION_POLICY;
}
