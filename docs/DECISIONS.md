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
- Checkout, pagamento, Asaas, PIX, cartão, split, webhook, voucher, QR
  Code — fora do escopo mesmo com a UI de reserva (Fase 3) já criando
  hold real.
