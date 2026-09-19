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

> **SUPERSEDED BY [ADR-014](#adr-014--atualização-em-tempo-real-do-catálogo-tabela-singleton-de-versão--postgres-changes-não-broadcast).** Mantido abaixo como registro histórico da decisão original — não reflete mais o código atual. `listTours()`/`getTour()` deixaram de usar ISR e hoje são `cache: 'no-store'` como `listDepartures()` já era; só `listDestinations()`/`listCategories()` (taxonomia) ainda usam `next: { revalidate: 300 }`. Ver ADR-014 para o motivo e o mecanismo que substituiu a janela de defasagem de 5 min (atualização em tempo real via Supabase Realtime).

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

## ADR-013 — Booking rollout gate (`BOOKING_CHECKOUT_ENABLED`)

**Contexto:** revisão de impacto pré-push (`1fc0d96..c290250`) identificou
que este range publicaria, pela primeira vez, um botão "Confirmar
reserva" **funcional** na UI pública — em `origin/main`, `BookingReview`
nunca teve esse botão funcional (a própria versão anterior do componente
dizia isso explicitamente no código). Isso significa que qualquer
visitante real do site passaria a poder criar um hold de verdade no
NauticFlow, sem `PAYMENTS_UI_ENABLED` estar ligada — ou seja, um hold sem
nenhum caminho de pagamento online, só o aviso "fale com o operador".
Tecnicamente seguro (sem risco financeiro, hold expira em 15 min sozinho,
proteção de capacidade/idempotência/rate-limit já existente e aceita
desde o ADR-007), mas é uma decisão de **prontidão operacional** — o
negócio precisa estar pronto para acompanhar holds manualmente — que não
deveria ser tomada implicitamente por um `git push`.

**Decisão:** criar `BOOKING_CHECKOUT_ENABLED` (`src/lib/feature-flags.ts`),
mesmo padrão de `PAYMENTS_UI_ENABLED` (constante literal, não lê env var
nem header) — travada em `false`. Enquanto `false`:

- `BookingReview` não recebe `onConfirm` de `BookingSelector` — mostra o
  mesmo aviso "Reserva online chega em breve... fale com o operador para
  confirmar" de antes da Fase 3, sem nenhum botão funcional. `BookingSelector` não
  passa o callback simplesmente porque a flag está off — mesmo padrão já
  usado para `onPayWithPix` em `BookingConfirmation`.
- **A rota `POST /api/bookings` falha fechada por conta própria** —
  `throwIfBookingCheckoutDisabled()` é a primeira checagem do handler,
  antes de Origin, Content-Type, parsing, ou qualquer chamada ao
  NauticFlow. Resposta: `422 BOOKING_CHECKOUT_NOT_ENABLED`. Mesma lição do
  ADR-012: a ausência do botão na UI nunca é, sozinha, uma proteção — um
  `curl`/`fetch` direto à rota, mesmo com headers corretos, precisa ser
  rejeitado pela própria rota.

`BOOKING_CHECKOUT_ENABLED` e `PAYMENTS_UI_ENABLED` são independentes, com
responsabilidades diferentes: a primeira controla se existe reserva/hold
público; a segunda, se existe checkout Pix público (e logicamente só faz
sentido depois da primeira — não há pagamento sem reserva). As duas
continuam `false` nesta entrega.

**Motivo:** permite publicar TODA a infraestrutura pronta (rotas
reconhecidas no build, código testado, documentação atualizada) sem
tornar nenhum fluxo transacional acessível ao público — separa "o deploy
técnico está seguro" (responsabilidade desta revisão) de "o negócio está
pronto para receber holds/pagamentos reais" (decisão de quem opera o
produto, não de quem escreve o código). Mesmo espírito do ADR-010
(construir atrás de uma trava explícita em vez de decidir por omissão).

**Alternativas rejeitadas:**
- Não publicar nada até a decisão de negócio estar tomada — rejeitado:
  atrasaria a validação da infraestrutura em produção (build, rotas,
  configuração) sem necessidade, já que essa validação não exige o fluxo
  estar acessível ao público.
- Confiar só na ausência do botão na UI (sem trava na rota) — rejeitado
  pelo mesmo motivo do ADR-012: um `curl` direto bypassaria a "proteção".
- Reaproveitar `PAYMENTS_UI_ENABLED` para gatear também a reserva —
  rejeitado: são decisões de negócio genuinamente diferentes (a operação
  pode querer receber reservas por hold-e-confirmação-manual antes de
  oferecer pagamento online) — uma flag só cobrindo os dois casos forçaria
  ligar as duas coisas juntas mesmo quando a intenção é só uma delas.

**Consequências:** confirmado por testes novos — `route.disabled.test.ts`
(`/api/bookings`, sem nenhum mock de `feature-flags`, mesmo padrão do
par já existente na rota de pagamento) e uma nova suíte em
`BookingSelector.test.tsx` provando que a revisão não oferece o botão
funcional e nunca chama `fetch`. Os testes do pipeline completo de
`/api/bookings` (`route.test.ts`) e o glue de `BookingSelector` que
depende de reserva bem-sucedida (`BookingSelector.booking.test.tsx`,
`BookingSelector.payment.test.tsx`) passaram a mockar
`BOOKING_CHECKOUT_ENABLED: true` explicitamente — documentado no topo de
cada arquivo para não confundir os papéis. Verificação adicional fora dos
testes automatizados: `curl` real contra o dev server local, `POST`
bem-formado (Origin correto, todos os headers certos) — `422
BOOKING_CHECKOUT_NOT_ENABLED` em menos de 1 segundo, tempo incompatível
com uma tentativa real de rede ao NauticFlow (timeout configurado é 8s).

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
- Ligar `BOOKING_CHECKOUT_ENABLED` (ADR-013) — infraestrutura de
  reserva/hold já pronta e testada, mas a flag continua `false`; ligar é
  decisão de negócio (prontidão operacional para acompanhar holds), não
  técnica. Ver [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md).
- ~~**SECURITY HARDENING FASE 3 — FRAMEWORK UPGRADE**~~ **Feito e publicado
  em produção (2026-09-04 local, 2026-09-07 em produção — `main`
  `f8472b6`, Node Vercel 24.x confirmado no dashboard)** — Next.js
  14.2.5 → 15.5.24 (Maintenance LTS), React 18.3.1 → 19.2.8. Único
  breaking change real: `params`/`searchParams` de página e Route
  Handler viraram `Promise` (5 arquivos ajustados). `npm audit`: as 33
  advisories do Next 14 desapareceram. Detalhe completo em
  [AUDITORIA-SEGURANCA-FASE1.md](AUDITORIA-SEGURANCA-FASE1.md).
- **SECURITY HARDENING FASE 4 — NEXT 16 (ACTIVE LTS)** (pendência formal,
  não iniciada): migrar de Next 15.5.24 para Next 16 — a Fase 3 já está
  estabilizada em produção. Elimina o último resíduo do `npm audit`
  (`postcss` transitivo interno do Next, já classificado como não
  explorável remotamente nesta arquitetura). Mesma exigência da Fase 3:
  análise dedicada de breaking changes, suíte completa, deploy separado —
  não usar `npm audit fix`/`npm update next`/`npm install next@latest` às
  cegas.
- **REAL PAYMENT E2E** (pendência formal, não iniciada): primeira chamada
  real ao endpoint de pagamento — condicionada a mecanismo de
  cleanup/estorno definido antes (mesma ressalva do booking, ADR-009) e a
  decisão explícita de negócio para ligar `BOOKING_CHECKOUT_ENABLED`/
  `PAYMENTS_UI_ENABLED`. Infraestrutura já pronta e publicada; falta só a
  decisão e o mecanismo de segurança operacional.
- **CONFIGURAR `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL`/`NEXT_PUBLIC_
  NAUTICFLOW_SUPABASE_ANON_KEY` em Production (Vercel)** (pendência
  formal) — sem isso, `CatalogRefresh` (ADR-014) simplesmente não assina
  nada (retorno antecipado silencioso, sem erro), o site funciona 100%
  normal, só sem o empurrão automático de aba já aberta. Ver ADR-014.

---

## ADR-014 — Atualização em tempo real do catálogo: tabela singleton de versão + Postgres Changes, não Broadcast

**Contexto:** `listTours()`/`getTour()` usavam `next: { revalidate: 300 }`
(ISR) — publicar/despublicar/editar um passeio no NauticFlow podia levar
até 5 minutos pra aparecer no ToursFlow. Precisávamos de duas garantias
separadas: (A) nenhuma requisição NOVA pode receber catálogo velho; (B)
uma aba já aberta deve atualizar sozinha quando algo for publicado.

**Decisão -- parte 1 (garantia A):** `listTours()`/`getTour()` passaram a
usar `cache: 'no-store'` em vez de `revalidate: 300`. `listDestinations()`/
`listCategories()` continuam em 300s (taxonomia muda raramente).
`listFeaturedTours()` herda `no-store` por chamar `listTours()` por
dentro. Isso já torna `/`, `/passeios`, `/passeios/[destino]` e
`/destinos` dinamicamente renderizadas por requisição, sem precisar de
`export const dynamic = 'force-dynamic'` em nenhuma delas.

**Decisão -- parte 2 (garantia B):** um componente client global
(`CatalogRefresh`, `src/components/realtime/CatalogRefresh.tsx`, montado
no `RootLayout`) assina `UPDATE` via Supabase Realtime (Postgres Changes,
não Broadcast) numa tabela mínima do NauticFlow --
`public.marketplace_catalog_state` (só `id`/`version`/`updated_at`,
NENHUM dado de passeio/operador/cliente/pagamento) -- e chama
`router.refresh()` (debounce de 400ms) quando a versão muda. O bump da
versão é feito por triggers SQL no NauticFlow (não por uma chamada
explícita em cada Server Action) -- ver ADR/DOCUMENTACAO do NauticFlow,
migration `0069_marketplace_catalog_realtime_state.sql`.

**Motivo de Postgres Changes, NÃO Broadcast:** a primeira ideia avaliada
foi Supabase Realtime Broadcast com canal privado (`config.private =
true` + policy de Authorization pra `anon`) -- descartada ANTES de
implementar, porque Broadcast privado exige cliente autenticado (JWT de
sessão), e o visitante do ToursFlow nunca tem sessão nenhuma no Supabase
do NauticFlow (é sempre `anon` puro, sem login). Sem prova de que isso
funcionaria de ponta a ponta pra um cliente `anon` sem sessão, a decisão
foi trocar pra Postgres Changes (o MESMO mecanismo que o NauticFlow já
usa em produção pra `vessels`/`clients`/`partners`/`departures`/
`reservations`/`tours`, só que sempre pra `authenticated` com RLS por
empresa -- este é o primeiro uso pra `anon` puro) sobre uma tabela nova,
mínima, com RLS deliberadamente simples (`for select to anon, authenticated
using (true)`, nenhum INSERT/UPDATE/DELETE liberado pra ninguém fora do
próprio banco).

**Prova real, antes de escrever este componente (pedido explícito):** um
script Node usando `@supabase/supabase-js` com SÓ a anon key (sem
nenhuma sessão) assinou `postgres_changes` em `marketplace_catalog_state`
contra o Supabase de STAGING do NauticFlow e recebeu o evento real
(`version: 0 -> 1`) depois de um bump disparado via SQL puro -- ver
DOCUMENTACAO.md do NauticFlow. Só depois dessa prova real o componente
`CatalogRefresh` foi escrito.

**Secrets:** `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL`/`NEXT_PUBLIC_
NAUTICFLOW_SUPABASE_ANON_KEY` NÃO são segredos novos -- são os MESMOS
dois valores já públicos no bundle do navegador do próprio NauticFlow
(prefixo `NEXT_PUBLIC_`, protegidos por RLS/policy no banco, nunca por
sigilo). `TOURSFLOW_API_SECRET` não entra nesta arquitetura em nenhum
momento -- não existe endpoint HTTP novo entre os dois projetos, o sinal
inteiro trafega pelo Realtime do Supabase do NauticFlow.

**Alternativas rejeitadas:**
- Broadcast privado com Authorization pra `anon` -- ver motivo acima
  (exige sessão, visitante nunca tem).
- Broadcast público (sem Authorization nenhuma) -- rejeitado por deixar
  qualquer cliente com a anon key (pública por natureza) capaz de emitir
  um evento de "catálogo mudou" arbitrário nesse canal (não vazaria dado
  nenhum, mas violaria o requisito explícito de "nenhum cliente arbitrário
  pode forçar refresh").
- Webhook NauticFlow -> endpoint do ToursFlow + Server-Sent Events --
  rejeitado por exigir estado (quais navegadores estão conectados) num
  runtime serverless (Vercel) sem um broker externo -- teria reinventado
  o que o Supabase Realtime já faz, ou exigido um serviço pago novo
  (Redis pub/sub, por exemplo), contra a preferência explícita de não
  adicionar infraestrutura paga só pra isso.
- Polling do navegador -- rejeitado, pedido explícito de não usar.

**Consequências:** a garantia B (aba já aberta) depende de o navegador
conseguir abrir uma conexão websocket direta com o Supabase do
NauticFlow -- se isso falhar (rede instável, Realtime fora do ar), o
componente simplesmente não atualiza a aba sozinha; a garantia A (nunca
mostrar dado velho numa requisição nova) continua 100% intacta
independente disso, porque não depende do Realtime en nada. Falta de
`NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL`/`_ANON_KEY` em Production
(pendência registrada acima) tem o mesmo efeito -- degrada pra "site
normal, sem auto-refresh de aba aberta", nunca pra "mostra dado errado".

---

## ADR-015 — Destinos são data-driven; nenhuma cidade nova exige alteração de código

**Contexto:** hoje o catálogo real do NauticFlow tem poucos destinos (na
prática, só Búzios em produção). O plano comercial é expandir para
Arraial do Cabo, Cabo Frio, Angra dos Reis, Recife e outras cidades à
medida que operadores forem cadastrados no NauticFlow. Antes de qualquer
expansão de cidade, era preciso confirmar (e onde necessário, corrigir)
que o frontend público não tem nenhuma lista fixa de destinos escondida
em componentes — porque isso obrigaria a um deploy manual por cidade
nova, o oposto do que o negócio precisa.

**Decisão:** Destinos do ToursFlow são data-driven. A entrada de uma
nova cidade no catálogo não deve exigir alteração funcional no
frontend. Fluxo desejado: novo destino entra no NauticFlow → `listDestinations()`
devolve → home/`/destinos`/`/destinos/[slug]`/busca/footer/sitemap
mostram → passeios aparecem. Nenhuma etapa lê uma lista de cidades
escrita em código.

**O que a auditoria confirmou já estar correto (nenhum código mudou):**
- `listDestinations()` (`src/data/repository.ts`) já é a única fonte de
  destinos para home, `/destinos`, `/destinos/[slug]`, `SearchBar` e
  `sitemap.ts` — não existe uma segunda lista manual em nenhum desses
  pontos.
- O mecanismo de vitrine (`src/data/vitrine/destinations.ts`,
  `destinationsVitrine` + `genericDestinationVitrine`, usado dentro de
  `mapDestinationDTO` em `nauticflow-source.ts`) já garante que um slug
  sem copy editorial específica (ex.: `recife`, ainda não escrito) cai
  num fallback genérico e honesto — tagline/descrição citam o nome real
  da cidade, sem inventar fato específico do lugar, com uma imagem de
  fallback (`/img/mock/destinations/generic.svg`) que já existe em
  disco. Nenhum destino novo quebra a UI por falta de metadado
  editorial. Coberto por `src/data/vitrine/destinations.test.ts`
  (novo).
- `/destinos/[slug]` já usa `generateStaticParams`/`generateMetadata`
  dinâmicos a partir de `listDestinations()`, com `EmptyState` genérico
  em vez de conteúdo hardcoded por cidade.
- `/passeios/[destino]/[slug]` já gera metadata dinamicamente, sem regra
  por cidade.
- `sitemap.ts` já é inteiramente dinâmico (`listDestinations()` +
  `listTourPaths()`), sem lista fixa.

**O que foi corrigido nesta rodada:**
- **Copy institucional regional removida:** o eyebrow da home dizia
  "Região dos Lagos e Costa Verde" — posicionamento que deixa de ser
  verdade assim que o catálogo tiver destinos fora dessa região. Trocado
  por "Descubra destinos e experiências" (`src/app/page.tsx`).
- **Bug de filtro de categoria no footer:** os links "Passeios
  privativos"/"Passeios compartilhados" usavam `routes.category('privativo')`/
  `routes.category('compartilhado')` — valores do MOCK, não da integração
  real (`categoriesVitrine` usa `passeio_privativo`/`passeio_compartilhado`).
  Em produção (fonte real), esses links gerariam um filtro inválido/vazio.
  Corrigido em `src/components/layout/Footer.tsx`.
- **Footer preparado para muitos destinos:** a coluna "Destinos" agora usa
  `FOOTER_DESTINATION_LIMIT = 6` (só um teto visual — a lista continua
  vindo inteira via prop `destinations`, sem cidade fixa) e sempre mostra
  um link "Ver todos os destinos →" para `routes.destinations()`,
  independente de quantos destinos existirem (1, 6 ou 50).
- **Home preparada para muitos destinos:** a seção "Para onde você vai"
  agora usa `HOME_DESTINATION_LIMIT = 10` pelo mesmo motivo (2 linhas
  cheias em `lg:grid-cols-5`), mantendo o link "Ver todos os destinos"
  para a página completa.
- Descrição da marca no footer trocada de "Passeios náuticos de
  operadores locais, reunidos em um só lugar." para "Passeios e
  experiências em diferentes destinos, reunidos em um só lugar." — menos
  amarrada a uma leitura regional, sem reabrir comunicação com operador.
- Adicionado link "Como funciona" (`routes.howItWorks()`) na coluna
  Explorar do footer.

**Fora de escopo, deliberadamente não tocado:** categorias da home
(decisão já fechada numa rodada anterior), qualquer comunicação
direta com operador (não reaberta), NauticFlow/backend/API/banco,
`BOOKING_CHECKOUT_ENABLED`/`PAYMENTS_UI_ENABLED` (continuam `false`).

**Performance:** zero requisições novas — todas as mudanças são
fatiamento (`slice`) e formatação de dados que a página/layout já
recebiam via `listDestinations()`; nenhum fetch por cidade, por card ou
no footer.

---

## ADR-016 — Política de cancelamento exibida ao turista é do marketplace, não do operador

**Contexto:** a página do passeio renderizava `tour.cancellationPolicy`
diretamente — um texto livre que vem do NauticFlow e varia por operador
(mock/dados reais mostram redações e prazos diferentes passeio a
passeio: "grátis até 24h", "até 48h", "até 12h", etc.). Decisão de
produto: o turista que reserva pelo ToursFlow não deve ver uma política
de cancelamento/reembolso escrita livremente por cada operador — o
marketplace terá sua própria política, padronizada, igual para qualquer
passeio/operador/destino.

**Decisão:** `tour.cancellationPolicy` deixou de ser a fonte da política
pública exibida no marketplace. Criado
`src/lib/marketplace-cancellation-policy.ts`, com um único objeto
`MARKETPLACE_CANCELLATION_POLICY` (`id`, `version`, `title`, `summary`)
como fonte central, testável e versionada — testado em
`marketplace-cancellation-policy.test.ts`. `src/app/passeios/[destino]/[slug]/page.tsx`
passou a renderizar `MARKETPLACE_CANCELLATION_POLICY.title`/`.summary`
na seção "Cancelamento e reembolso", em vez de `tour.cancellationPolicy`.

**O que NÃO foi feito (fora de escopo/sem autorização ainda):**
- Nenhum número financeiro/prazo foi inventado (ex.: "grátis até 24h",
  "50% após X horas", "sem reembolso em Y horas") — sem aprovação de
  produto para isso. `summary` é só a copy transitória e factual pedida:
  informa que a política é do marketplace e será apresentada antes da
  confirmação, sem prometer reembolso, gratuidade ou prazo, e sem
  instruir a falar com o operador.
- `tour.cancellationPolicy` continua existindo no tipo `Tour` e sendo
  mapeado de `dto.cancellationPolicy` em `nauticflow-source.ts` — o
  NauticFlow ainda envia o campo e ele pode ter uso fora da vitrine
  pública do marketplace no futuro; só a exibição pública nesta página
  parou de usá-lo. Nenhum contrato/tipo/mapper foi alterado.
- NauticFlow, banco, migrations: intocados. Booking/pagamento continuam
  desligados (`BOOKING_CHECKOUT_ENABLED`/`PAYMENTS_UI_ENABLED` = `false`).

**Próximo passo (fora desta tarefa):** quando o negócio decidir a regra
financeira real (prazo de cancelamento grátis, percentual de multa,
prazo de estorno etc.), ela vira uma nova versão do mesmo objeto
(`id` estável, `version` nova) — não uma reescrita ad-hoc espalhada pela
UI.

---
