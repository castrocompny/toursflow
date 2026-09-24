# Feature Flags

Nenhuma flag foi alterada nesta análise. Os valores abaixo foram
confirmados por leitura direta de `src/lib/feature-flags.ts` em
24/09/2026 (linhas 31 e 53), e novamente reconfirmados nesta revisão via
`grep` no arquivo atual — sem alterações no código desde a última
verificação (`git log` mostra o último commit a tocar o arquivo em
18/09/2026, e o arquivo não aparece como modificado no `git status`
atual).

## As duas flags — valor atual confirmado no código

```ts
export const BOOKING_CHECKOUT_ENABLED = false; // linha 31
export const PAYMENTS_UI_ENABLED = false;      // linha 53
```

Ambas são **constantes literais no código-fonte** — não lêem env var nem
header. Isso é deliberado: mudar qualquer uma delas exige um code change
revisado (PR, review), nunca uma variável de ambiente que alguém ligue
sem revisão de código.

## `BOOKING_CHECKOUT_ENABLED`

**Finalidade**: controla o rollout do fluxo de reserva/hold em si
(`POST /api/bookings`) — independente de `PAYMENTS_UI_ENABLED`, que
controla só o checkout Pix.

**Onde atua**:
- `BookingReview` (dentro de `BookingSelector.tsx`).
- Rota `POST /api/bookings` (`src/app/api/bookings/route.ts`).

**Proteção de UI** (enquanto `false`): `BookingReview` não mostra o
botão funcional "Confirmar reserva" — mostra só o aviso de que a reserva
online chega em breve, **nunca** instrui o turista a contatar o operador
diretamente.

**Proteção server-side** (existe, confirmada no código): a rota
`POST /api/bookings` falha fechada por conta própria, independente da
UI. `throwIfBookingCheckoutDisabled()` é a primeira checagem no handler
— antes até de checar Origin/Content-Type/parsing do corpo. Isso
significa que mesmo uma chamada manual (`curl`/`fetch` direto, sem passar
pela UI) não cria um hold real enquanto a flag estiver `false`. Testado
diretamente em `route.disabled.test.ts`.

**Por que existe separada de `PAYMENTS_UI_ENABLED`**: permite publicar a
infraestrutura de reserva+pagamento pronta em produção (build ok, rotas
reconhecidas, sem erro) sem tornar nenhuma delas acessível ao público —
valida o deploy sem criar holds reais nem risco operacional de reservas
sem acompanhamento humano.

**Consequência de ativá-la** (`true`): o botão "Confirmar reserva" passa
a funcionar de verdade na UI, e a rota `POST /api/bookings` passa a
aceitar chamadas reais e criar holds reais no NauticFlow via
`POST /api/marketplace/bookings`. Segundo o comentário no próprio
código, a infraestrutura já está pronta e testada — ativar não depende
de trabalho técnico adicional, só de decisão explícita de negócio
(equipe operacional pronta para acompanhar holds).

## `PAYMENTS_UI_ENABLED`

**Finalidade**: controla se o caminho para `PixPayment` fica acessível
na UI, do lado do ToursFlow.

**Onde atua**:
- `BookingConfirmation`.
- Rota `POST/GET /api/bookings/[bookingId]/payment`
  (`src/app/api/bookings/[bookingId]/payment/route.ts`).

**Proteção de UI** (enquanto `false`): `BookingConfirmation` não mostra
nenhum caminho para `PixPayment`; nenhum componente do fluxo Pix é
alcançável pela UI real — só existem porque são testados diretamente
(`PixPayment.test.tsx`). Também depende de `BOOKING_CHECKOUT_ENABLED` já
estar `true` para sequer ser alcançável (não existe pagamento sem
reserva/hold antes).

**Proteção server-side** (existe, confirmada no código): a rota de
pagamento falha fechada por conta própria, mesmo padrão de
`BOOKING_CHECKOUT_ENABLED` — checagem de flag é o primeiro passo no
handler. Testado diretamente em `route.disabled.test.ts`.

**Relação com o NauticFlow — o que é e não é confirmável a partir do
ToursFlow**: o comentário no código-fonte (`src/lib/feature-flags.ts`)
afirma que esta flag "espelha, do lado do ToursFlow, o estado de
`MARKETPLACE_PAYMENTS_ENABLED` no NauticFlow — hoje desligada lá". Essa é
uma afirmação sobre o estado do **NauticFlow**, um sistema externo — o
repositório do ToursFlow não tem como confirmar o estado real de
produção do NauticFlow por leitura de código local. Por isso: o estado
de `MARKETPLACE_PAYMENTS_ENABLED` no NauticFlow em produção é
**NÃO CONFIRMADO EM PRODUÇÃO** a partir desta análise — o que está
confirmado é apenas que, do lado do ToursFlow, `PAYMENTS_UI_ENABLED`
está `false` no código-fonte atual.

**Consequência de ativá-la** (`true`, só depois que as 3 condições abaixo
forem verdadeiras): o fluxo de pagamento Pix passa a ficar acessível na
UI real depois de uma reserva confirmada, e a rota de pagamento passa a
aceitar chamadas reais contra `POST/GET /api/bookings/{bookingId}/payment`
do NauticFlow.

Condições para ativar, segundo o comentário no código:
1. `MARKETPLACE_PAYMENTS_ENABLED` ligada em produção no NauticFlow —
   **NÃO CONFIRMADO EM PRODUÇÃO** (não inferível do ToursFlow, ver acima).
2. O contrato real do endpoint de pagamento confirmado e
   `src/lib/payment-client.ts` com implementação real (não
   `NotImplementedPaymentClient`) — este ponto tem evidência direta no
   próprio repositório: `docs/PAYMENTS.md` documenta o contrato real
   validado em 02/09/2026. Confirmar se `payment-client.ts` já usa uma
   implementação real hoje exigiria ler esse arquivo diretamente; não foi
   relido nesta revisão pontual.
3. Revisão explícita autorizando expor o fluxo publicamente — decisão de
   negócio, não verificável por código.

## Código preparado vs. funcionalidade habilitada — distinção explícita

Existe uma diferença importante entre "o código existe e está testado" e
"a funcionalidade está realmente disponível para o público":

- **Código preparado**: toda a infraestrutura de reserva, formulário do
  cliente, revisão, pagamento Pix, voucher e compartilhamento via
  WhatsApp já está implementada e coberta por testes (ver
  [[Reservas e Pagamentos (Pix)]]). Isso é verificável diretamente no
  código-fonte, hoje.
- **Funcionalidade habilitada**: nenhuma dessas partes é alcançável por
  um usuário real do site, porque as duas flags acima estão `false`. A
  única forma de exercitar esse código hoje é por teste automatizado
  direto (ex.: `PixPayment.test.tsx` chama o componente sem passar pela
  UI real).
- Ter o código pronto **não implica** que a flag vá ser ativada em
  qualquer prazo determinado — a ativação depende de decisões de negócio
  e, no caso de `PAYMENTS_UI_ENABLED`, também de confirmação externa do
  lado do NauticFlow que este repositório não tem como verificar sozinho.

## Padrão de defesa em profundidade (a lição central das ADRs 012/013)

A ausência de um botão na UI **nunca é, sozinha, uma proteção**. As duas
rotas (`/api/bookings` e `/api/bookings/[bookingId]/payment`) se recusam
por conta própria, na primeira linha do handler, independente do que a
UI mostra ou esconde. Isso é o que permite o código de reserva/pagamento
estar implementado e testado em produção sem nenhum risco de criar holds
ou cobranças reais — a segurança não depende de ninguém "esquecer" de
adicionar um botão na interface.

## Onde isso é usado

- `src/app/api/bookings/route.ts` e `route.disabled.test.ts`
- `src/app/api/bookings/[bookingId]/payment/route.ts` e `route.disabled.test.ts`
- `BookingConfirmation`, `BookingReview` (dentro de `BookingSelector.tsx`)

Ver também [[Estado Atual do Produto]] para o impacto disso em cada parte
da UI, e [[Reservas e Pagamentos (Pix)]] para o fluxo completo por trás
da flag.
