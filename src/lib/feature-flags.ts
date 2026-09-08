/**
 * `BOOKING_CHECKOUT_ENABLED` controla o rollout do fluxo de reserva/hold
 * em si — independente de `PAYMENTS_UI_ENABLED` abaixo, que controla só o
 * checkout Pix. Constante literal (não lê env var nem header), de
 * propósito: mudar isso exige um code change revisado, nunca uma
 * variável de ambiente que alguém possa ligar sem revisão. Mesmo padrão
 * de `PAYMENTS_UI_ENABLED`.
 *
 * Enquanto `false`: `BookingReview` não mostra o botão funcional
 * "Confirmar reserva" (mostra a mesma mensagem "fale com o operador" de
 * antes da Fase 3) — e a própria rota `POST /api/bookings` falha fechada
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
 * Só mude para `true` depois de decisão explícita de negócio — a
 * infraestrutura de reserva já está pronta e testada, então ligar esta
 * flag não depende de nenhum trabalho técnico adicional, só da decisão
 * de expor o fluxo publicamente (equipe operacional pronta para
 * acompanhar holds).
 *
 * **`true` só nesta branch (`e2e/real-payment`), de propósito — não
 * mergear em `main` assim.** Ligada aqui exclusivamente para permitir o
 * primeiro teste real (Preview Deployment isolado, `main`/Production
 * continuam com a flag `false`), decisão explícita de negócio registrada
 * em `docs/DECISIONS.md`.
 */
export const BOOKING_CHECKOUT_ENABLED = true;

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
 * `PixPayment.test.tsx`). Depende de `BOOKING_CHECKOUT_ENABLED` já estar
 * `true` para sequer ser alcançável (não existe reserva sem hold antes).
 *
 * Só mude para `true` depois que TODAS estas condições forem verdade:
 * 1. `MARKETPLACE_PAYMENTS_ENABLED` ligada em produção no NauticFlow.
 * 2. O contrato real do endpoint de pagamento estiver confirmado e
 *    `src/lib/payment-client.ts` tiver uma implementação real (não
 *    `NotImplementedPaymentClient`).
 * 3. Revisão explícita autorizando expor o fluxo publicamente.
 *
 * **`true` só nesta branch (`e2e/real-payment`), de propósito — não
 * mergear em `main` assim.** As três condições acima já estão satisfeitas
 * (`MARKETPLACE_PAYMENTS_ENABLED = true` em produção no NauticFlow,
 * contrato real implementado desde o ADR-011, revisão explícita desta
 * tarefa) — ligada aqui exclusivamente para o primeiro teste real E2E,
 * isolado em Preview Deployment. `main`/Production continuam com a flag
 * `false`.
 */
export const PAYMENTS_UI_ENABLED = true;
