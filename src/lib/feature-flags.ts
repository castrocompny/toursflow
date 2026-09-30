/**
 * Única branch cujo Preview da Vercel liga o fluxo transacional — usada
 * para o primeiro E2E financeiro controlado. Trocar/adicionar branch exige
 * code change revisado (mesmo princípio de antes: nada liga isso por env
 * var no painel).
 */
export const TRANSACTIONAL_PREVIEW_BRANCH = 'frontend/mobile-booking-ux';

/**
 * `true` só para build de Preview da Vercel (`VERCEL_ENV === 'preview'`)
 * da branch `TRANSACTIONAL_PREVIEW_BRANCH`. Qualquer outra coisa —
 * Production (`main`), outra branch, build local, testes, valor ausente —
 * dá `false` (fail-closed). As entradas vêm de `next.config.mjs` (`env`),
 * congeladas no build a partir das variáveis de sistema da Vercel, então
 * cliente e servidor sempre veem o mesmo valor e Production nunca liga
 * por configuração.
 */
export function isTransactionalPreviewBuild(vercelEnv: string | undefined, gitRef: string | undefined): boolean {
  return vercelEnv === 'preview' && gitRef === TRANSACTIONAL_PREVIEW_BRANCH;
}

const TRANSACTIONAL_PREVIEW_BUILD = isTransactionalPreviewBuild(
  process.env.TOURSFLOW_BUILD_VERCEL_ENV,
  process.env.TOURSFLOW_BUILD_GIT_REF,
);

/**
 * `BOOKING_CHECKOUT_ENABLED` controla o rollout do fluxo de reserva/hold
 * em si — independente de `PAYMENTS_UI_ENABLED` abaixo, que controla só o
 * checkout Pix. Não lê env var própria nem header, de propósito: ligar em
 * Production exige um code change revisado, nunca uma variável de
 * ambiente que alguém possa ligar sem revisão. Hoje só é `true` no
 * Preview de `TRANSACTIONAL_PREVIEW_BRANCH` (ver
 * `isTransactionalPreviewBuild`); em Production é sempre `false`. Mesmo
 * padrão de `PAYMENTS_UI_ENABLED`.
 *
 * Enquanto `false`: `BookingReview` não mostra o botão funcional
 * "Confirmar reserva" (mostra só o aviso de que a reserva online chega em
 * breve — nunca instrui o turista a contatar o operador) — e a própria
 * rota `POST /api/bookings` falha fechada
 * por conta própria (ver `route.ts`), então nem uma chamada manual
 * (`curl`/`fetch` direto) cria um hold real. Isso decorre da mesma lição
 * do ADR-012: a ausência do botão na UI nunca é, sozinha, uma proteção —
 * a rota precisa se recusar por conta própria.
 *
 * Motivo de existir separada de `PAYMENTS_UI_ENABLED`: publicar a
 * infraestrutura de reserva+pagamento pronta sem tornar nenhuma delas
 * acessível ao público — permite validar o deploy em produção (build,
 * rotas reconhecidas, sem erro) sem criar holds reais nem risco
 * operacional de reservas sem acompanhamento humano. Ver ADR
 * correspondente em docs/DECISIONS.md.
 *
 * Só ligue em Production depois de decisão explícita de negócio — a
 * infraestrutura de reserva já está pronta e testada, então ligar esta
 * flag não depende de nenhum trabalho técnico adicional, só da decisão
 * de expor o fluxo publicamente (equipe operacional pronta para
 * acompanhar holds).
 */
export const BOOKING_CHECKOUT_ENABLED = TRANSACTIONAL_PREVIEW_BUILD;

/**
 * `PAYMENTS_UI_ENABLED` espelha, do lado do ToursFlow, o estado de
 * `MARKETPLACE_PAYMENTS_ENABLED` no NauticFlow (já ligada em produção lá
 * desde 29/09/2026). Não lê env var própria nem header, de propósito:
 * ligar em Production exige um code change revisado, nunca uma variável
 * de ambiente que alguém possa ligar sem revisão. Hoje só é `true` no
 * Preview de `TRANSACTIONAL_PREVIEW_BRANCH`; em Production é sempre
 * `false`.
 *
 * Enquanto `false`: `BookingConfirmation` não mostra nenhum caminho para
 * `PixPayment`, e nenhum componente do fluxo Pix é alcançável pela UI
 * real — só existem porque são testados diretamente (ver
 * `PixPayment.test.tsx`). Depende de `BOOKING_CHECKOUT_ENABLED` já estar
 * `true` para sequer ser alcançável (não existe reserva sem hold antes).
 *
 * Só ligue em Production depois que TODAS estas condições forem verdade:
 * 1. `MARKETPLACE_PAYMENTS_ENABLED` ligada em produção no NauticFlow.
 * 2. O contrato real do endpoint de pagamento estiver confirmado e
 *    `src/lib/payment-client.ts` tiver uma implementação real (não
 *    `NotImplementedPaymentClient`).
 * 3. Revisão explícita autorizando expor o fluxo publicamente.
 */
export const PAYMENTS_UI_ENABLED = TRANSACTIONAL_PREVIEW_BUILD;
