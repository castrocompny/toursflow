# Decisões de arquitetura (ADR)

Registro das decisões técnicas relevantes já tomadas neste projeto, no
formato Contexto / Decisão / Motivo / Alternativas rejeitadas /
Consequências. Só decisões realmente tomadas — nada especulativo.

---

## ADR-001 — Repositório de dados escolhido por variável de ambiente

**Contexto:** o catálogo precisa funcionar em dev local sem exigir setup
de credencial/rede, e em produção precisa sempre usar dados reais do
NauticFlow.

**Decisão:** `src/data/repository.ts` escolhe `nauticflow-source` ou
`mock-source` puramente pela presença de `NAUTICFLOW_API_URL`, atrás de um
único contrato (`ToursDataSource`). Nenhum componente sabe qual está
ativo.

**Motivo:** permite dev sem setup (mock automático) sem risco de mock
vazar pra produção (lá a env var está sempre presente) e sem duplicar
lógica de UI por fonte de dado.

**Alternativas rejeitadas:** flag booleana explícita (`USE_MOCK=true`) —
rejeitada por criar um segundo lugar pra errar (esquecer de setar/desetar);
mock sempre ativo com "modo real" opt-in — rejeitada por inverter o padrão
seguro (produção deveria ter que optar por dado real, não o contrário).

**Consequências:** se `NAUTICFLOW_API_URL` for setada por engano em dev
local, o mock para de ser usado silenciosamente — comportamento aceito
como correto (reflete produção), documentado em
[ENVIRONMENT.md](ENVIRONMENT.md).

---

## ADR-002 — Cache dividido: conteúdo com ISR, disponibilidade sempre fresca

**Contexto:** dados de catálogo (nome, descrição, fotos) mudam pouco;
disponibilidade de saída (`soldOut`, vagas) muda a cada reserva e nunca
pode estar desatualizada.

**Decisão:** `nauticflow-source.ts` usa `next: { revalidate: 300 }` para
tours/destinos/categorias, e `cache: 'no-store'` para `listDepartures`.

**Motivo:** evitar reserva de uma saída que já esgotou entre o cache e a
tentativa real (o NauticFlow revalida tudo de novo no momento da reserva,
mas a UI não deveria nem oferecer a opção com dado óbvio desatualizado).

**Alternativas rejeitadas:** ISR uniforme para tudo — rejeitada por poder
mostrar `soldOut: false` por até 5 minutos depois de esgotar de verdade;
`no-store` uniforme para tudo — rejeitada por eliminar o ganho de
performance do ISR em dado que muda pouco.

**Consequências:** publicar/despublicar um passeio no NauticFlow pode
levar até 5 min para refletir no catálogo do ToursFlow (sem
`revalidateTag`/revalidação sob demanda ainda — ver PLANEJADO abaixo).
Disponibilidade, porém, é sempre a mais recente possível.

---

## ADR-003 — `/passeios/[destino]/[slug]` é `force-dynamic`, sem `generateStaticParams`

**Contexto:** a página do passeio mostra saídas com disponibilidade
(`listDepartures`, `no-store`) — não pode ser pré-renderizada em build
sem congelar esse dado.

**Decisão:** a rota é marcada `export const dynamic = 'force-dynamic'` e
não implementa `generateStaticParams`.

**Motivo:** consistência com ADR-002 — não faz sentido ter cache de
conteúdo inteligente na busca (`fetch`) e depois anular isso com uma
página 100% estática que só atualiza no próximo build.

**Alternativas rejeitadas:** SSG + revalidação periódica da página inteira
— rejeitada pela mesma razão do ADR-002 (disponibilidade não pode ter
janela de staleness).

**Consequências:** cada acesso à página do passeio é uma renderização
server-side real (custo de compute maior que uma página estática pura),
aceito como o trade-off correto para não vender saída já esgotada.

---

## ADR-004 — Rate limit do visitante via HMAC do IP, não IP em claro

**Contexto:** o NauticFlow precisa de uma identidade por visitante para
aplicar rate limit em `/api/marketplace/bookings`, mas o ToursFlow não
deve repassar IP em claro a um sistema terceiro nem manter estado próprio
de rate limit.

**Decisão:** `X-ToursFlow-Client-Key = HMAC-SHA256(TOURSFLOW_API_SECRET,
"rate-limit:v1:" + ip)`, calculado só no servidor do ToursFlow, a partir
do IP confiável da requisição (`x-vercel-forwarded-for` em produção),
nunca de um header vindo do navegador.

**Motivo:** o NauticFlow ganha uma identidade estável por visitante sem
nunca ver o IP real; o segredo compartilhado (já existente para
autenticação) é reaproveitado com domain separation em vez de introduzir
um segredo novo.

**Alternativas rejeitadas:** enviar o IP em claro — rejeitado por
desnecessário e por aumentar a superfície de dado pessoal trafegado;
cliente gerar a própria identidade (ex.: UUID em cookie) — rejeitado por
ser trivialmente forjável/reiniciável pelo próprio visitante, anulando o
rate limit.

**Consequências:** rate limit por visitante depende de o IP confiável
estar disponível — quando não está, a rota falha fechada
(`CLIENT_IP_UNAVAILABLE`) em vez de deixar passar sem limite. Ver
[SECURITY.md](SECURITY.md).

---

## ADR-005 — Whitelist explícita do payload de reserva, nunca objeto repassado direto

**Contexto:** o corpo de `POST /api/bookings` vem do navegador — não pode
ser confiável como fonte de preço, operador ou identificadores internos.

**Decisão:** `validateBookingInput()` extrai campo por campo
(`departureId`, `quantity`, `customer.{...}`) para um novo objeto — nunca
faz spread do body recebido nem repassa chaves desconhecidas adiante.

**Motivo:** impedir que um cliente malicioso injete `price`, `total`,
`companyId`, `status` etc. tentando influenciar o resultado da reserva.

**Alternativas rejeitadas:** blacklist de campos perigosos — rejeitada por
exigir manutenção reativa toda vez que um campo novo e sensível for
adicionado ao contrato; whitelist é segura por padrão mesmo se o contrato
crescer.

**Consequências:** todo campo novo do contrato de reserva precisa ser
adicionado explicitamente à whitelist antes de funcionar — fricção
aceita como o preço de não confiar no cliente por padrão.

---

## ADR-006 — Tipos de reserva separados dos tipos de catálogo

**Contexto:** `src/types/index.ts` (catálogo) e `src/types/booking.ts`
(reserva) poderiam, em tese, compartilhar um único arquivo de tipos.

**Decisão:** mantidos em arquivos separados.

**Motivo:** catálogo é lido por qualquer Server Component; reserva envolve
tipos que só o backend server-only manipula (`BookingErrorCode`,
payload de request/response do NauticFlow) — separar deixa explícito o que
é seguro importar de onde, e evita que um Client Component importe
acidentalmente um tipo que "puxa" um módulo server-only via barrel file.

**Alternativas rejeitadas:** um único `types/index.ts` — rejeitada pelo
motivo acima.

**Consequências:** duas fontes de tipo para conferir ao mexer em algo que
toca os dois domínios (ex.: `Departure.priceType` usado tanto no catálogo
quanto na validação de reserva).

---

## ADR-007 — Rate limit próprio do ToursFlow: classificado como hardening, não bloqueador

**Contexto:** a Fase 2 prepara `/api/bookings` para receber tráfego real
da UI na Fase 3. A rota já tem proteção de origem (Origin/Sec-Fetch-Site,
seção 5 de [SECURITY.md](SECURITY.md)) e o NauticFlow já aplica rate
limit global e por visitante via `X-ToursFlow-Client-Key`. A pergunta
desta fase: o ToursFlow precisa de uma camada própria de rate limit antes
de expor a rota publicamente — isso é um bloqueador real, ou defesa em
profundidade sobre uma proteção que já existe a jusante?

**Decisão:** não implementar rate limit próprio do ToursFlow. Classificado
como **hardening/defesa em profundidade**, não como bloqueador para
iniciar a Fase 3.

**Motivo:** revisando o que já está de fato comprovado (não só
implementado) contra produção:

- **Hold de capacidade e idempotência do NauticFlow** — comprovados em
  E2E real contra produção antes desta fase (criação `201`, replay
  idempotente `200`, conflito de idempotência `409`, `soldOut` refletido
  no catálogo). Isso é o que protege o risco mais grave (overbooking,
  reserva duplicada) — e já funciona, verificado.
- **Rate limit global + por visitante do NauticFlow** — documentado como
  contrato acordado (`RESERVAS-SERVER-TO-SERVER.md`); o lado ToursFlow da
  identidade por visitante (`X-ToursFlow-Client-Key`) está implementado e
  comprovado por teste automatizado real (HMAC calculado de verdade, não
  mockado — `toursflow-client-key.test.ts`, `route.test.ts`). O que
  falta comprovar é só o lado NauticFlow em produção (E2E cross-serviço
  específico, pendente por falta de deploy coordenado — ver
  [SECURITY.md](SECURITY.md#2-identidade-do-visitante-no-rate-limit-nunca-o-ip-em-claro)) — uma
  lacuna de verificação/coordenação, não de código faltando neste
  repositório.
- Dado que a proteção contra o risco mais sério (overbooking) já é real e
  comprovada, e a proteção de volume/abuso já tem uma implementação
  (pendente só de confirmação E2E, não de construção), uma segunda camada
  de rate limit no ToursFlow seria redundante com o que já existe a
  jusante — não uma lacuna que impeça começar a Fase 3.
- Tecnicamente, qualquer implementação real em ambiente serverless
  (Vercel) exigiria estado compartilhado entre invocações — um `Map` em
  memória não protege nada, porque cada invocação pode rodar numa
  instância diferente. A opção correta (ex.: Upstash Redis, ou um KV
  gerenciado) é uma dependência SaaS nova, não configurada neste projeto
  — fora de escopo sem autorização explícita, e desproporcional para
  reforçar uma proteção que já existe a jusante.

**Alternativas consideradas:**
- Limiter em memória (`Map`/contador local) — rejeitado: falso senso de
  proteção em serverless, pior que não ter nada porque sugere uma garantia
  que não existe.
- Upstash Redis (ou equivalente) — rejeitado por exigir uma
  conta/credencial nova sem autorização; desproporcional dado que o risco
  principal já tem cobertura comprovada a jusante.
- Vercel WAF/Attack Challenge Mode (recurso da própria plataforma, sem
  dependência nova) — não avaliado (depende do plano da conta Vercel, não
  verificado); permanece como opção de custo zero de nova dependência se
  o volume de tráfego real algum dia justificar.

**Consequências:** a proteção contra abuso de tráfego na rota do
ToursFlow continua sendo, em ordem de força real: (1) hold + idempotência
do NauticFlow (comprovado, protege o risco mais grave), (2) rate limit
do NauticFlow (contrato real, identidade por visitante pronta do lado
ToursFlow, E2E cross-serviço pendente de coordenação), (3) Origin/
Sec-Fetch-Site (reduz POST cross-site trivial, não é rate limit), (4)
limite de tamanho de corpo (não é rate limit de frequência). Isso é
aceito como suficiente para **iniciar** a Fase 3 — não bloqueia. O item
que continua valendo a pena resolver, independente da Fase 3, é fechar o
E2E cross-serviço específico do `X-ToursFlow-Client-Key` assim que o
deploy coordenado com o NauticFlow acontecer — registrado como item de
acompanhamento (não bloqueador) em
[SECURITY.md](SECURITY.md#limitações-conhecidas-aceitas-não-resolvidas-nesta-etapa).

**Revisão (2026-08-28):** classificação original desta entrada era
"bloqueador a reavaliar antes da Fase 3". Corrigida no mesmo dia, depois
de revisar a documentação/testes históricos do `X-ToursFlow-Client-Key`
com mais rigor — a lacuna real é só o E2E cross-serviço, não a ausência
de proteção; o motivo acima reflete essa análise mais precisa.

---

## ADR-008 — `router.refresh()` em vez de novo endpoint para atualizar disponibilidade após `INSUFFICIENT_CAPACITY`

**Contexto:** ao receber `409 INSUFFICIENT_CAPACITY` na Fase 3, a UI
precisa refletir a disponibilidade real (`soldOut`) sem inventar um
comportamento (ex.: selecionar outra saída sozinha, que a instrução
explícita da fase proibiu).

**Decisão:** chamar `router.refresh()` (`next/navigation`) depois desse
erro específico, em vez de criar uma nova rota pública de leitura de
disponibilidade.

**Motivo:** a página do passeio (`src/app/passeios/[destino]/[slug]/page.tsx`)
já é um Server Component que busca `listDepartures` com `cache: 'no-store'`
(ADR-002/003) toda vez que renderiza. `router.refresh()` reexecuta esse
Server Component sem perder o estado do Client Component
(`BookingSelector` mantém `useState` intacto — só a prop `departures`
chega atualizada), sem precisar duplicar a lógica de busca de
disponibilidade num novo endpoint `GET` só para isso.

**Alternativas rejeitadas:**
- Novo endpoint `GET /api/departures/:id` só para a UI reconsultar depois
  de um erro — rejeitado por duplicar `listDepartures` (já existe e já é
  `no-store`) sem necessidade.
- Selecionar automaticamente outra saída disponível — rejeitado, a
  instrução da fase foi explícita: "não tentar automaticamente outra
  saída". O turista decide.

**Consequências:** o turista só vê a disponibilidade atualizada se voltar
ao step de seleção (`BookingReview` continua mostrando o erro na tela
atual, sem navegar sozinho) — comportamento aceito como correto: não
esconder o erro nem forçar navegação, só garantir que o dado, quando o
turista voltar a olhar, está fresco.

---

## ADR-009 — Nenhum E2E controlado contra produção na Fase 3 (sem mecanismo de cleanup)

**Contexto:** a Fase 3 conecta a UI a `POST /api/bookings` de verdade —
tecnicamente pronta para criar um hold real no NauticFlow. A instrução da
fase autorizava um E2E controlado contra produção, mas só se já existisse
uma saída seguramente destinada a teste **e** um mecanismo de
cleanup/cancelamento acessível; caso contrário, instruía a não executar.

**Decisão:** não executar nenhum E2E contra produção nesta fase.

**Motivo:** este repositório (ToursFlow) não tem nenhuma rota, script ou
mecanismo documentado para cancelar/expirar manualmente uma reserva criada
no NauticFlow — a única forma conhecida de "desfazer" um hold seria
esperar `holdExpiresAt` passar (15 min) sem confirmar pagamento. Criar uma
reserva real de teste sem um jeito confirmado de limpá-la imediatamente
violaria a própria condição que autorizava o E2E.

**Alternativas consideradas:**
- Criar mesmo assim e deixar o hold expirar sozinho em 15 min — rejeitado:
  a instrução foi explícita ("se não existir mecanismo de cleanup
  acessível, NÃO executar E2E"), e "esperar expirar" não é um mecanismo
  de cleanup, é só não fazer nada por 15 minutos enquanto uma reserva
  real (ainda que de teste) ocupa capacidade de verdade no passeio de
  integração.
- Pedir ao usuário confirmação pontual para criar+aguardar expirar —
  não solicitado; a instrução já cobria esse cenário e pedia para não
  executar.

**Consequências:** a validação desta fase ficou inteiramente em: (1) 209
testes automatizados com `fetch` mockado, cobrindo todo o contrato
observável de `submitBooking()`/`BookingSelector` (payload, normalização,
todos os `BookingErrorCode`, rede, double-submit, ciclo da Idempotency-Key,
preço do backend, PII); (2) verificação em browser real até o step de
revisão (sem clicar em "Confirmar reserva"). **Não há confirmação real,
em produção, de que o fluxo completo (clique em "Confirmar reserva" →
201/hold real → countdown correto) funciona ponta a ponta.** Registrado
como pendência não bloqueante em [SECURITY.md](SECURITY.md#planejado--não-implementado)
— só deve ser fechada quando existir um mecanismo de cleanup, ou com
autorização explícita para criar e aguardar expirar uma reserva de teste.

---

## ADR-010 — Pagamento preparado atrás de interface + feature flag, sem contrato confirmado do NauticFlow

**Contexto:** a preparação do checkout (Pix) foi pedida antes de existir
um contrato confirmado do NauticFlow para criação/consulta de pagamento
— `docs/PLANO-INTEGRACAO-NAUTICFLOW.md` marca isso como fase futura
própria, sem endpoint/payload definido. A instrução explícita foi "NÃO
inventar endpoints".

**Decisão:** construir a UI/lógica do lado ToursFlow (tipos, componentes,
testes) contra uma interface própria (`PaymentClient`), com a única
implementação "real" (`NotImplementedPaymentClient`) lançando um erro
explícito em vez de chamar qualquer URL — e atrás de uma feature flag
(`PAYMENTS_UI_ENABLED`, constante literal `false`) que mantém esses
componentes inatingíveis pela UI pública.

**Motivo:** isso separa duas coisas que a tarefa pedia ao mesmo tempo —
"preparar o fluxo completo" e "sem gerar cobrança real, sem inventar
endpoint" — sem comprometer nenhuma das duas. O trabalho de UI/estado
(QR Code, countdown, polling, os 5 estados de pagamento, tela de voucher)
é real e testado (220 testes no total do projeto), mas nenhuma linha de
código chama rede — confirmado por grep (zero `fetch` em qualquer arquivo
novo desta entrada). Quando o contrato real existir, o trabalho que resta
é só trocar `NotImplementedPaymentClient` por uma implementação real e
ligar a flag — não redesenhar a UI.

**Alternativas rejeitadas:**
- Adivinhar um endpoint plausível (`POST /api/marketplace/bookings/:id/payment`
  e formato de resposta) e já wireá-lo — rejeitado explicitamente pela
  instrução "não inventar endpoints"; um contrato errado custaria mais
  para desfazer depois do que vale a economia de não esperar a confirmação.
- Não preparar nada até o contrato existir — rejeitado: a interface
  `PaymentClient` deixa claro exatamente qual é o "buraco" (2 métodos,
  1 tipo de dado) que a integração real precisa preencher, sem exigir
  redesenho da UI depois.

**Consequências:** o formato de `PixPaymentData` (`src/types/payment.ts`)
é uma hipótese, marcada como tal — se o contrato real do NauticFlow tiver
campos diferentes, esse arquivo (e só ele, na maior parte) precisa mudar.
Nenhum risco de cobrança real: a única implementação existente sempre
falha explicitamente. Detalhe completo: [PAYMENTS.md](PAYMENTS.md).

**Revisão (2026-09-02):** o contrato real foi confirmado (endpoints,
headers, DTOs — ver [ADR-011](DECISIONS.md#adr-011--wiring-completo-do-contrato-real-de-pagamento-sem-chamada-real)).
A previsão deste ADR se confirmou: só foi preciso trocar o client e os
tipos, a UI (`PixPayment`/`BookingVoucher`) não precisou ser redesenhada.
`PixPaymentData` (hipotético) foi substituído por
`NauticFlowBookingPaymentView` (real); `manual_review`, que era um
estado hipotético, foi removido por não ser confirmado no contrato real.

---

## ADR-011 — Wiring completo do contrato real de pagamento, sem chamada real

**Contexto:** o contrato de pagamento do NauticFlow (confirmado
2026-09-02) tornou obsoleta a premissa do ADR-010 ("sem contrato
confirmado"). A tarefa pediu para conectar o wiring completo — tipos,
rota interna, client server-only, client do navegador, UI — mantendo
`PAYMENTS_UI_ENABLED = false` e zero chamada real ao NauticFlow.

**Decisão:** implementar todas as camadas contra o contrato real:

- `src/types/payment.ts` — tipos exatos (`PaymentStatus` com só os 5
  valores confirmados; `manual_review` removido).
- `src/lib/nauticflow-payments.ts` (`server-only`) — único módulo que
  chama o NauticFlow para pagamento, mesmo padrão de
  `nauticflow-bookings.ts`.
- `src/app/api/bookings/[bookingId]/payment/route.ts` — `POST`/`GET`,
  mesmo hardening de `/api/bookings` (Origin/Sec-Fetch-Site, Content-Type,
  limite real de corpo).
- `src/lib/payment-client.ts` — `ToursFlowPaymentClient` (real, chama só
  as rotas do próprio ToursFlow) substitui `NotImplementedPaymentClient`
  no wiring de `BookingSelector` (a classe continua existindo, só não é
  mais o que está em uso).
- Duas refatorações de suporte: `src/lib/http-guards.ts` (Origin/
  Content-Type/limite de corpo extraídos de `/api/bookings` para reuso,
  comportamento idêntico) e `getTrustedClientIp()` generalizada para
  receber `onUnavailable: () => never` em vez de lançar `BookingApiError`
  fixo — as duas rotas (`bookings` e `bookings/[id]/payment`) agora
  compartilham a mesma lógica sem se acoplarem ao tipo de erro uma da
  outra.

**Motivo:** com o contrato confirmado, manter o stub
(`NotImplementedPaymentClient`) como "proteção" deixaria de fazer
sentido — a proteção real e suficiente é `PAYMENTS_UI_ENABLED = false`
(nenhum componente que chama o client é alcançável pela UI). Usar o
client real, mas gated pela flag, é mais fiel ao que vai para produção
quando a flag ligar: exatamente este código, sem trocar nada.

**Alternativas rejeitadas:**
- Manter `NotImplementedPaymentClient` no wiring e só documentar o
  contrato real — rejeitado: a tarefa pediu explicitamente para
  "conectar" o fluxo, e adiar o wiring real geraria mais um passo (trocar
  o client) para revisar depois, sem necessidade.
- Duplicar a lógica de Origin/Content-Type/body-limit na nova rota em vez
  de extrair — rejeitado: a segunda rota precisando exatamente da mesma
  proteção é o sinal claro de que a duplicação já não vale a pena.

**Consequências:** `ToursFlowPaymentClient` é código real, testado,
pronto para produção — mas nunca executado de fato nesta entrega (zero
`fetch` para o NauticFlow, confirmado por grep e por verificação em
browser real sem clicar em nenhum botão de pagamento, que nem aparece).
O primeiro uso real desse caminho só vai acontecer quando
`PAYMENTS_UI_ENABLED` for ligada — nenhuma garantia adicional além dos
260 testes automatizados existe até lá. Detalhe completo:
[PAYMENTS.md](PAYMENTS.md).

**Revisão (2026-09-02, mesmo dia):** a afirmação acima ("nenhuma
garantia adicional além dos testes") estava incompleta — a única coisa
que impedia uma chamada real era a UI não oferecer o botão, e um
`curl`/`fetch` direto à rota **chegaria ao NauticFlow de verdade**.
Corrigido no [ADR-012](DECISIONS.md#adr-012--trava-server-side-da-rota-de-pagamento-ui-flag-não-é-security-boundary)
antes deste ADR ser dado como concluído.

---

## ADR-012 — Trava server-side da rota de pagamento (UI flag não é security boundary)

**Contexto:** revisão de segurança pós-ADR-011 identificou que
`POST/GET /api/bookings/[bookingId]/payment` não verificava
`PAYMENTS_UI_ENABLED` (nem nada equivalente) antes de processar a
requisição — a única coisa que impedia uma chamada real ao NauticFlow
era `BookingConfirmation` não renderizar o botão "Pagar com Pix" quando
a flag está `false`. Um `curl`/`fetch` direto à rota, com headers
corretos, chegaria a `createNauticFlowPayment()`/`getNauticFlowBookingStatus()`
de verdade — a ausência de UI nunca foi (e nunca deveria ter sido
tratada como) um controle de segurança.

**Decisão:** adicionar `throwIfPaymentsDisabled()` como a **primeira**
checagem de ambos os handlers (`POST` e `GET`) — antes de Origin,
Content-Type, parsing de corpo, ou qualquer outra validação — reusando
a mesma constante `PAYMENTS_UI_ENABLED` (`src/lib/feature-flags.ts`) já
usada para gating de UI. Resposta: `422 PAYMENT_PROVIDER_NOT_ENABLED`
(mesmo código que o NauticFlow usaria pelo motivo equivalente do lado
dele), sem tocar em `createNauticFlowPayment`/`getNauticFlowBookingStatus`.

**GET também foi travado**, apesar de não ter efeito financeiro (é só
leitura) — decisão deliberada, não reflexo: (1) com a flag off, nenhum
pagamento pode ter sido criado por este caminho, então não existe status
legítimo para consultar; (2) evita expor uma superfície de leitura
(status/`holdExpiresAt`/quantidade de qualquer `bookingId`) enquanto o
recurso inteiro está desligado, sem custo real — nenhum caminho legítimo
do produto depende de chamar este `GET` com a flag off hoje.

**Motivo:** defesa em profundidade real, não hipotética — o cenário que
a motivou é concreto: o NauticFlow pode ligar `MARKETPLACE_PAYMENTS_ENABLED`
antes do ToursFlow estar pronto para expor o fluxo publicamente (rollout
assíncrono dos dois lados é a norma neste projeto, não exceção — ver
histórico do `X-ToursFlow-Client-Key`). Sem uma trava própria, o
ToursFlow dependeria inteiramente do NauticFlow rejeitar a chamada — a
mesma lição já registrada para rate limit (ADR-007), agora aplicada a
"o recurso está ligado", não só "quantas vezes por minuto".

**Alternativas rejeitadas:**
- Confiar em `MARKETPLACE_PAYMENTS_ENABLED` do NauticFlow como única
  trava — rejeitado pelo motivo acima: os dois lados podem ficar
  dessincronizados, e a trava real (não a mensagem de erro) precisa
  existir nos dois.
- Criar uma variável de ambiente nova (`PAYMENTS_ENABLED` no ToursFlow)
  em vez de reaproveitar `PAYMENTS_UI_ENABLED` — rejeitado: adicionaria
  um segundo lugar para as duas travas ficarem dessincronizadas *dentro
  do próprio ToursFlow*; uma constante literal única, checada nos dois
  lugares (UI e rota), é mais simples e não há cenário legítimo em que
  UI e rota deveriam divergir.
- Deixar GET liberado (só bloquear POST) — considerado e rejeitado por
  não ter nenhum caso de uso real com a flag off, e por reduzir a
  superfície de leitura enquanto o recurso está desligado sem custo (ver
  "Decisão" acima).

**Consequências:** confirmado por 7 testes novos (`route.disabled.test.ts`,
sem nenhum mock de `feature-flags` — exercita o valor real `false` do
código-fonte) + verificação manual contra o dev server local (`curl`
direto à rota, `POST`/`GET` bem-formados, ambos `422
PAYMENT_PROVIDER_NOT_ENABLED` em <1s — tempo incompatível com uma
chamada real ao NauticFlow, que teria timeout de 8s se travasse). Os
testes do pipeline completo (`route.test.ts`) passaram a mockar
`PAYMENTS_UI_ENABLED: true` explicitamente, para continuar testando o
resto da lógica (Origin, whitelist, erros do NauticFlow) — documentado
no topo do próprio arquivo de teste para não confundir os dois papéis.

---

## PLANEJADO / NÃO IMPLEMENTADO

- Revalidação sob demanda (`revalidateTag`) para eliminar a janela de até
  5 min entre publicar/despublicar um passeio no NauticFlow e isso
  refletir no catálogo (ADR-002).
- Rate limit próprio do ToursFlow na rota `/api/bookings` — classificado
  como hardening/defesa em profundidade em ADR-007, não bloqueador; não
  implementado, revisitável se o volume de tráfego real justificar.
- E2E cross-serviço específico do `X-ToursFlow-Client-Key` contra o
  NauticFlow em produção — pendente de deploy coordenado dos dois lados.
- E2E controlado da criação real de reserva pela UI (ADR-009) — pendente
  de mecanismo de cleanup.
- Checkout, cartão, split visível ao ToursFlow, webhook (recebido só pelo
  NauticFlow, nunca pelo ToursFlow), voucher real — fora do escopo mesmo
  com o wiring de pagamento Pix (ADR-011) já implementado.
- Ligar `PAYMENTS_UI_ENABLED` — wiring completo já existe (ADR-011), mas
  a flag continua `false`; ligar exige `MARKETPLACE_PAYMENTS_ENABLED` em
  produção no NauticFlow **e** revisão explícita. Ver
  [PAYMENTS.md](PAYMENTS.md).
- Primeira chamada real ao endpoint de pagamento (E2E financeiro) —
  nenhuma foi feita; precisa de mecanismo de cleanup/estorno definido
  antes (mesma ressalva do booking, ADR-009).
