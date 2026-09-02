# Segurança

Estado real da postura de segurança do ToursFlow até o commit `a11424a`.
Não é um relatório de pentest — é o inventário do que existe, por quê, e o
que é limitação conhecida e aceita (não "esquecida"). Detalhe de
implementação de cada item vive no arquivo correspondente; este documento
consolida a visão geral.

## 1. Segredos

| Segredo | Onde vive | Nunca aparece em |
|---|---|---|
| `TOURSFLOW_API_SECRET` | Só server-side (`src/lib/nauticflow-bookings.ts`, `src/lib/toursflow-client-key.ts`), lido via `process.env` | Nenhuma resposta HTTP, nenhum log, nenhum Client Component, nenhuma variável `NEXT_PUBLIC_*` |

Ambos os módulos que leem o segredo importam `import 'server-only'` no
topo — importar qualquer um deles de um Client Component **quebra o build**
(erro do bundler), não vaza o segredo em runtime. Essa é a proteção
estrutural, não uma convenção de nome de arquivo.

`.env.example` documenta a existência e o propósito de cada variável, nunca
um valor real (ver [ENVIRONMENT.md](ENVIRONMENT.md)). `.env.local` está no
`.gitignore` (checado antes de cada commit deste projeto via `git status`
+ leitura de conteúdo, nunca `git add -A`).

## 2. Identidade do visitante no rate limit (nunca o IP em claro)

O NauticFlow aplica rate limit global e por visitante usando
`X-ToursFlow-Client-Key`, um HMAC-SHA256 do IP calculado **só no
ToursFlow**:

```
X-ToursFlow-Client-Key = HMAC-SHA256(TOURSFLOW_API_SECRET, "rate-limit:v1:" + ip_normalizado)
```

- **Fonte do IP em produção:** `x-vercel-forwarded-for` — garantido pela
  própria Vercel no edge, não forjável pelo cliente. Fora da Vercel (dev
  local), fallback controlado para `x-forwarded-for`, só quando
  `process.env.VERCEL !== '1'`.
- **Falha fechada:** sem IP confiável, a rota responde `503
  CLIENT_IP_UNAVAILABLE` — nunca cria uma identidade compartilhada tipo
  `"unknown"` para todo mundo (isso zeraria o rate limit por visitante na
  prática).
- **O navegador não controla a própria identidade de rate limit.** Um
  header `X-ToursFlow-Client-Key` enviado pelo cliente é ignorado — a rota
  nunca o lê, sempre recalcula a partir do IP da requisição atual.
- **Nada persistido.** IP e HMAC existem só em memória, por requisição.
- **Domain separation:** o prefixo `"rate-limit:v1:"` garante que este HMAC
  nunca pode ser reaproveitado como o Bearer de autenticação, mesmo
  reusando o mesmo segredo.

**O que está comprovado hoje, e como:** toda a implementação do lado
ToursFlow — fonte de IP confiável em produção (`client-ip.test.ts`),
cálculo do HMAC (`toursflow-client-key.test.ts`), rota sempre recalculando
a key a partir do IP real e nunca lendo um header vindo do navegador
(`route.test.ts`, testes "envia X-ToursFlow-Client-Key calculada
server-side" e "IGNORA X-ToursFlow-Client-Key enviado pelo navegador" —
este último manda um header forjado de 64 hex e prova que a key enviada
ao NauticFlow é sempre a recalculada, nunca a forjada) — está coberta por
teste automatizado real (HMAC calculado de verdade nos testes, não
mockado).

**O que NÃO está comprovado:** nenhum E2E cross-serviço confirma que o
NauticFlow, do lado dele, de fato aplica o rate limit usando esta key ou
ignora um header equivalente forjado na chamada dele. A documentação
histórica (`RESERVAS-SERVER-TO-SERVER.md`, `CHANGELOG.md`, entrada de
2026-08-27) registra isso como pendente desde a implementação original —
"o NauticFlow só tem a validação... no ambiente local dele... o E2E desta
parte específica está pendente" — e não há nenhum commit, teste ou
entrada de changelog posterior que feche essa lacuna. Revisado nesta
entrada (2026-08-28): a lacuna continua real, não foi fechada por engano
nem por omissão de registro.

Detalhe completo: [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md#rate-limit-por-visitante-identidade-pseudônima).

## 3. Whitelist de payload (nunca confiar em campo do cliente)

`validateBookingInput()` (`src/lib/booking-validation.ts`) extrai **só**
`departureId`, `quantity`, `customer.{name,email,phone,cpf}` do corpo da
requisição. Preço, total, `companyId`, `tourId`, `status`, `source` — mesmo
que presentes no JSON recebido — nunca chegam ao objeto validado nem são
repassados ao NauticFlow. O preço é sempre resolvido pelo NauticFlow a
partir do `departureId`; o ToursFlow nunca é autoridade de preço.

## 4. Idempotência

`/api/bookings` exige `Idempotency-Key` (formato UUID) e repassa **sem
alteração** ao NauticFlow — nunca gera nem substitui uma key em nome do
cliente. Isso é o que permite ao NauticFlow tratar um duplo-clique ou
retry de timeout como a mesma operação, sem duplicar reserva. Detalhe:
[RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md#idempotency-key--ponta-a-ponta).

## 5. Proteção de origem (best-effort, documentada como tal) — reforçada na Fase 2

`isTrustedOrigin()` em `src/app/api/bookings/route.ts` usa dois sinais, nessa ordem:

1. **`Sec-Fetch-Site`** — header enviado automaticamente por navegadores
   modernos em toda requisição `fetch`, não pode ser forjado por JS de
   página nenhuma. Se o valor for `cross-site`, a requisição é rejeitada
   sempre, mesmo que o `Origin` bata com o `Host` por algum outro motivo.
2. **`Origin` vs. `Host`/allowlist** — sem sinal decisivo de
   `Sec-Fetch-Site` (ausente, ou navegador antigo/cliente não-browser),
   cai para a checagem anterior: host do `Origin` precisa bater com o
   `Host` da própria requisição (cobre produção, cada preview deploy e dev
   local automaticamente) **ou** estar em `ALLOWED_ORIGIN_HOSTS`
   (`toursflow.com.br`, `toursflow.vercel.app` — nomes de domínio
   públicos, não segredo, hardcoded em vez de env var por não terem
   necessidade real de configuração).

**Isto não é autenticação nem proteção CSRF completa** — não há sessão de
usuário nesta etapa para algo mais forte, e `Origin` continua ausente em
alguns cenários legítimos (nesse caso a checagem deixa passar, na falta de
um sinal melhor — testado explicitamente, comportamento atual mantido de
propósito). É uma camada independente do rate limit por
`X-ToursFlow-Client-Key` — uma não substitui a outra.

**Casos testados explicitamente** (`route.test.ts`, describe "política de
Origin"): aceita `https://toursflow.com.br` e `https://toursflow.vercel.app`
(em qualquer combinação de Host/Origin entre os dois); rejeita
`https://toursflow.com.br.attacker.example` (prova que a comparação é por
host **exato**, não por `includes`/substring — um domínio que só contém o
nome oficial como prefixo não passa); rejeita `https://attacker.example`;
rejeita `Sec-Fetch-Site: cross-site` mesmo com `Origin` batendo; em
produção (Host de produção), `Origin: http://localhost:3000` é **rejeitado**
— `localhost` nunca está na allowlist estática, só passa via a regra
"mesmo host da própria requisição" quando o `Host` da requisição também é
`localhost` (cenário de dev local, testado à parte).

## 6. Erros nunca vazam detalhe interno

Toda resposta de erro de `/api/bookings` é um `{ error: { code, message } }`
com um dos códigos tipados (`BookingErrorCode`) — nunca stack trace, nome
de variável de ambiente, ou detalhe de implementação. Erro não mapeado cai
em `INTERNAL_ERROR` genérico (`console.error` só no servidor). Falha de
comunicação com o NauticFlow (timeout, rede, resposta inválida) vira
`BOOKING_SERVICE_UNAVAILABLE` — nunca um fallback que simula sucesso (ver
["Nenhum fallback mock"](RESERVAS-SERVER-TO-SERVER.md#nenhum-fallback-mock)).

## 7. Imagens

`next.config.mjs` libera `remotePatterns` só para o host exato do Storage
Supabase do NauticFlow (`gggpihphjjxndpfntnvm.supabase.co`,
`/storage/v1/object/**`) — nunca wildcard, mesmo que outros projetos
Supabase usem o mesmo domínio-base. `dangerouslyAllowSVG: true` está
ativo (o NauticFlow pode servir SVG de logo/foto) combinado com
`contentDispositionType: 'attachment'`, que força o navegador a baixar em
vez de renderizar inline um SVG malicioso fora do componente `<Image>` do
Next — mitigação padrão do próprio Next.js para XSS via SVG.

## 8. JSON-LD (dado externo embutido em `<script>`) — corrigido e ativo em produção

`src/app/passeios/[destino]/[slug]/page.tsx` injeta o `TouristTrip`
structured data via `dangerouslySetInnerHTML`. Os valores (`tour.name`,
`tour.summary`, nome do operador, nomes de categoria) vêm do catálogo do
NauticFlow — conteúdo que o ToursFlow não controla na origem (é o
operador quem cadastra). `JSON.stringify()` sozinho **não escapa**
`</script>`: um valor contendo essa substring fecharia a tag `<script>`
prematuramente e permitiria injetar HTML/script arbitrário na página —
XSS armazenado, mediado por dado de catálogo. Corrigido nesta auditoria
(2026-08-28) escapando todo caractere de abre-tag no JSON (`.replace(/</g,
'\\u003c')`) antes de embutir — mitigação padrão recomendada
para este padrão exato (JSON-LD/scripts inline com dado dinâmico).

## 9. Content-Type e tamanho do corpo (novo, Fase 2)

`/api/bookings` rejeita, antes de aceitar o payload:

- **Content-Type diferente de `application/json`** (com ou sem `charset`)
  → `415 INVALID_REQUEST`, verificado pelo header antes de tocar no corpo.
- **Corpo acima de 10KB** (`MAX_BODY_BYTES`, generoso para um payload de
  reserva — nome/e-mail/telefone/CPF/departureId/quantity) → `413
  INVALID_REQUEST`.

**A proteção de tamanho é sobre os bytes REALMENTE recebidos, não só
sobre o header `Content-Length`** (`readBodyWithLimit()` em `route.ts`):
o corpo é lido em streaming, contando bytes chunk a chunk, e a leitura é
abortada assim que o total ultrapassa o limite — antes de `JSON.parse`
rodar. Isso cobre os quatro cenários reais:

| Cenário | Resultado |
|---|---|
| Corpo normal, dentro do limite | Processa normalmente |
| `Content-Length` declarado acima do limite | `413`, rejeitado sem ler nenhum byte do corpo (fast path) |
| Corpo real acima do limite, **sem** `Content-Length` | `413` — a contagem real de bytes recebidos pega isso |
| `Content-Length` mentiroso/menor que o corpo real, corpo real acima do limite | `413` — o header nunca é usado para *permitir* passagem, só para a rejeição antecipada quando ele mesmo já admite ser grande demais |

`Content-Length` continua útil só como *fast path* (rejeita sem gastar
ciclo lendo nada, quando o próprio cliente já declara um valor grande) —
nunca é a fonte de verdade sobre se um corpo pode ser aceito. Testes:
`route.test.ts`, describe "limite real de tamanho do corpo".

**Limitação que permanece, documentada:** o limite de 10KB é sobre o
corpo desta requisição especificamente; não existe (nem faz sentido
existir aqui) proteção contra volume de requisições simultâneas — isso é
rate limiting (seção 2 acima + [ADR-007](DECISIONS.md#adr-007--rate-limit-próprio-do-toursflow-classificado-como-hardening-não-bloqueador)), uma preocupação diferente.

## 10. Headers de segurança de resposta (novo, Fase 2)

`next.config.mjs` define, para todas as rotas: `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(),
geolocation=(), interest-cohort=()`. Todos de baixo risco — não dependem
do fluxo de reserva e não têm como quebrar imagem/hidratação/fonte.

**Deliberadamente fora desta etapa: Content-Security-Policy.** O site usa
hidratação padrão do Next (scripts inline gerados pelo framework), JSON-LD
inline via `dangerouslySetInnerHTML` (seção 8) e Google Fonts — uma CSP
correta exigiria nonce/hash por request e investigação própria para não
quebrar nada disso. Colocar uma policy incorreta seria pior que não ter
nenhuma (falsa sensação de proteção ou site quebrado); fica para uma etapa
dedicada.

## 11. PII do formulário do comprador (Fase 2, submissão real desde a Fase 3)

A partir do `CustomerForm`/`BookingReview`/`BookingConfirmation`
(`src/components/tours/`, lógica em `src/lib/customer-form.ts` e
`src/lib/booking-submission.ts`), o navegador manipula dado pessoal
(nome, e-mail, telefone, CPF opcional) — e, desde a Fase 3, envia esse
dado de verdade a `POST /api/bookings` ao clicar "Confirmar reserva".

- **Nunca persistido no navegador.** Estado só em memória do componente
  React (`useState` em `BookingSelector`) — nunca `localStorage`,
  `sessionStorage`, cookie, ou query string/URL, em nenhum step, inclusive
  depois de sucesso/erro. Recarregar a página perde os dados (aceito: não
  existe rascunho "salvo" no navegador).
- **Nunca logado no navegador.** Nenhum `console.log`/`console.error` do
  formulário, revisão ou confirmação manipula o objeto `customer` inteiro
  nem campo individual.
- **Mascarado na revisão.** `maskEmail`/`maskPhone`/`maskCpf`
  (`customer-form.ts`) — e-mail mostra só a primeira letra do usuário,
  telefone só DDD + 4 últimos dígitos, CPF só os 2 dígitos verificadores.
  O nome não é mascarado (não há razão de segurança para isso — é o único
  campo que o próprio turista já vê por completo em qualquer formulário
  de reserva real).
- **CPF: normalizado + checksum validado no cliente**
  (`isCpfChecksumValid` em `customer-form.ts` — algoritmo padrão dos 2
  dígitos verificadores, mais rejeição de sequência repetida tipo
  `111.111.111-11`). Continua opcional — o contrato do NauticFlow
  (`BookingCustomerInput.cpf?`) não exige, então a UI também não torna
  obrigatório.
- **Normalizado antes de enviar** (`buildBookingPayload()` em
  `booking-submission.ts`): `name`/`email` com trim, `phone`/`cpf` só
  dígitos — nunca a máscara visual de digitação. `cpf` vazio nem aparece
  como chave no payload.
- **Depois de sucesso, só o subconjunto seguro fica em memória**
  (`BookingConfirmationData`: `bookingId`, `status`, `holdExpiresAt`,
  `priceCents`, `totalCents`, `quantity`) — a resposta bruta inteira do
  NauticFlow (que inclui `tour`/`departure`) não é guardada além do
  necessário para renderizar a tela.
- **Testado de ponta a ponta:** payload é sempre a whitelist exata (nunca
  campo extra), `Idempotency-Key` correta, nenhuma PII na URL depois de
  sucesso ou erro, `localStorage`/`sessionStorage` vazios depois do fluxo
  completo (`BookingSelector.test.tsx`, describe "confirmação de reserva").

## 12. Ciclo de vida da Idempotency-Key (enviada desde a Fase 3)

`resolveIdempotencyKey()` (`src/lib/idempotency-key.ts`) decide reaproveitar
ou gerar uma key nova, comparando o fingerprint da tentativa atual
(`departureId`+`quantity`+dados do comprador) com o da última vez. Regras,
cobertas por teste unitário puro (`idempotency-key.test.ts`) **e** por
teste de integração do fluxo real (`BookingSelector.test.tsx`):

- Sem key existente → sempre gera uma nova (primeira tentativa).
- Fingerprint igual ao armazenado (re-render, retry da mesma tentativa) →
  reaproveita a key existente, **nunca** chama o gerador de novo — testado
  contra um erro transitório real (`503` seguido de retry: mesma key nos
  dois `fetch`).
- Fingerprint diferente (qualquer dado relevante mudou) → gera key nova —
  testado (mudar o e-mail antes de reenviar gera key diferente).
- **Depois de um sucesso definitivo:** `BookingSelector` reseta o estado
  para `{ key: null, fingerprint: null }` assim que `submitBooking()`
  retorna sucesso (201 ou 200 replay) — a próxima tentativa de reserva
  (mesmo com dados idênticos) sempre recebe key nova.
- **Depois de `IDEMPOTENCY_CONFLICT` (409):** mesmo reset — reusar uma key
  que o servidor já rejeitou por conflito só repetiria o mesmo erro.

## 13. Double-submit e estados de submissão (Fase 3)

`BookingSelector` usa um `useRef` (`isSubmittingRef`), além do state
`submissionStatus` (`idle`/`submitting`/`error`), como guarda síncrona
contra clique duplo — o botão "Confirmar reserva" também fica desabilitado
enquanto `submitting`. Testado com 3 cliques seguidos no mesmo botão:
exatamente 1 chamada a `/api/bookings`.

## 14. Dependências

`npm audit` acusou vulnerabilidades conhecidas do Next.js 14.2.5 na
auditoria pré-integração de 2026-08-25 (ver
[AUDITORIA-PRE-INTEGRACAO.md](AUDITORIA-PRE-INTEGRACAO.md)). **Upgrade do
Next.js ainda não foi feito** — registrado como pendente, não como
resolvido.

## 15. Rota de pagamento falha fechada server-side — não só ausência de botão (ADR-012)

**A UI escondida (ausência de botão "Pagar com Pix" quando
`PAYMENTS_UI_ENABLED === false`) nunca foi, e nunca deve ser tratada
como, um controle de segurança.** Até 2026-09-02,
`POST`/`GET /api/bookings/[bookingId]/payment` não verificavam essa flag
— um `curl`/`fetch` direto à rota, com headers corretos, chegaria ao
NauticFlow de verdade. Corrigido: `throwIfPaymentsDisabled()` é a
**primeira** checagem de ambos os handlers, antes de Origin, Content-Type
ou qualquer parsing — reusa a mesma constante `PAYMENTS_UI_ENABLED`, mas
agora verificada onde precisa estar (no servidor, na própria rota), não
só onde é conveniente (no componente React).

Cadeia de defesa em profundidade real:

```
Browser -> ToursFlow (feature gate, PRIMEIRA linha da rota)
        -> ToursFlow (Origin/Content-Type/IP confiável -> HMAC/Bearer)
        -> NauticFlow (feature gate próprio, independente)
        -> Asaas
```

`GET` também travado (sem efeito financeiro, mas sem caso de uso
legítimo com a flag off — decisão registrada, não reflexo). Confirmado
por 7 testes sem mock de `feature-flags` (`route.disabled.test.ts`) e
por `curl` real contra o dev server local — `422
PAYMENT_PROVIDER_NOT_ENABLED` em <1s, tempo incompatível com uma
tentativa real de rede ao NauticFlow. Detalhe completo:
[PAYMENTS.md](PAYMENTS.md), [ADR-012](DECISIONS.md#adr-012--trava-server-side-da-rota-de-pagamento-ui-flag-não-é-security-boundary).

## Testes de segurança relevantes

- `booking-validation.test.ts` — whitelist do payload, rejeição de campo
  extra, formato de `Idempotency-Key`.
- `client-ip.test.ts` — fonte de IP correta por ambiente, falha fechada
  sem header confiável.
- `toursflow-client-key.test.ts` — determinismo do HMAC, domain separation,
  nunca usa o IP em claro no output.
- `nauticflow-bookings.test.ts` (ou equivalente) — segredo nunca aparece em
  resposta de erro; sem fallback simulado em falha de rede/timeout.
- `route.test.ts` (Fase 2) — Content-Type inválido (415); limite real de
  corpo nos 4 cenários (normal, `Content-Length` grande, corpo grande sem
  `Content-Length`, `Content-Length` mentiroso); JSON malformado sem
  vazar stack trace; Origin de host oficial aceito e host
  parecido/atacante rejeitado (comparação por host exato, não substring);
  `Sec-Fetch-Site: cross-site` rejeitado mesmo com Origin batendo;
  `localhost` rejeitado em produção, aceito só quando Host também é
  `localhost`; strings acima do limite.
- `customer-form.test.ts` (Fase 2) — validação de nome/e-mail/telefone/CPF,
  checksum de CPF, máscaras de exibição nunca revelam o dado completo.
- `idempotency-key.test.ts` (Fase 2/3) — ciclo de vida completo de
  `resolveIdempotencyKey()`: reaproveita em re-render/retry, regenera em
  mudança relevante, sempre regenera depois de um reset pós-sucesso.
- `booking-submission.test.ts` (Fase 3) — payload whitelisted e
  normalizado, todos os `BookingErrorCode` mapeados corretamente,
  `NETWORK_ERROR` quando o `fetch` rejeita, corpo de resposta malformado
  não lança.
- `hold-countdown.test.ts` (Fase 3) — cálculo nunca fica negativo,
  formatação do countdown, expiração.
- `BookingSelector.test.tsx` (Fase 1–3) — fluxo completo: seleção, dados
  inválidos não avançam, válidos avançam, estado preservado ao voltar;
  desde a Fase 3, submissão real mockada cobrindo 201, 200 replay, os 6
  códigos de erro relevantes (`IDEMPOTENCY_CONFLICT`,
  `INSUFFICIENT_CAPACITY` com `router.refresh()`,
  `PRICE_TYPE_NOT_SELLABLE`, `RATE_LIMITED`,
  `BOOKING_SERVICE_UNAVAILABLE`, rede), double-submit (3 cliques = 1
  chamada), retry com mesma key, mudança de dado gera key nova, preço
  exibido sempre do backend, PII nunca em URL/`localStorage`/
  `sessionStorage`.
- `BookingConfirmation.test.tsx` (Fase 3) — countdown com fake timers,
  preço real do backend, estado de expirado.
- `route.test.ts`/`route.disabled.test.ts` do pagamento (`/api/bookings/[bookingId]/payment`)
  — pipeline completo (Origin, Content-Type, idempotência, whitelist,
  ausência de `amount`, client-key forjada ignorada, todos os
  `PaymentErrorCode` relevantes incluindo `PAYMENT_PROVIDER_NOT_ENABLED`
  e `CUSTOMER_DOCUMENT_REQUIRED`) **e**, sem nenhum mock de
  `feature-flags`, o comportamento real de produção — `PAYMENTS_UI_ENABLED`
  `false` faz `POST` e `GET` falharem fechados antes de tocar no
  NauticFlow, mesmo com headers/Origin corretos.
- `idempotency-key.test.ts` — `resolvePaymentIdempotencyKey()`: mesma
  garantia de `resolveIdempotencyKey()` (reaproveita em re-render/retry,
  nunca chama o gerador à toa) para a tentativa de pagamento.
- `BookingSelector.payment.test.tsx` (2026-09-02, achado MEDIUM da revisão
  final fechado) — glue real do fluxo de pagamento dentro de
  `BookingSelector` (`PAYMENTS_UI_ENABLED` mockada `true`, arquivo
  separado de `BookingSelector.test.tsx` pelo mesmo motivo do par
  `route.test.ts`/`route.disabled.test.ts`): `bookingResult` existe antes
  de `payment-pix`, um único `POST .../payment` com `Idempotency-Key`
  válida, um `rerender()` do pai não gera novo `POST` nem nova key, e o
  voucher só aparece depois do polling confirmar `paid`.

`npm test` roda todos (274 testes ao todo no projeto, cobrindo também
catálogo/UI, não só segurança).

**Achado de integridade dos testes (2026-08-28, corrigido nesta fase):**
`vitest.config.ts` incluía só `src/**/*.test.ts` — nunca `*.test.tsx`. Na
prática, **nenhum teste de componente React (`BookingSelector.test.tsx`,
existente desde a Fase 1) rodava de fato via `npm test`**, apesar de
relatórios de fases anteriores terem reportado esses testes como parte de
uma suíte "toda verde". `vitest run` saía com sucesso porque simplesmente
não descobria esses arquivos — não porque eles passavam. Corrigido para
`src/**/*.test.{ts,tsx}` (mais `oxc: { jsx: { runtime: 'automatic' } }`,
necessário para o parser JSX do Vite 8/rolldown nos arquivos de teste). Ao
rodar de verdade pela primeira vez, apareceram 3 bugs reais nos próprios
testes (nunca no código de produção): duas queries ambíguas
(`getByLabelText`/`getByText` casando mais de um elemento por engano) e
uma asserção de máscara de e-mail com contagem de asteriscos errada —
todos corrigidos, e a suíte inteira (209 testes) agora roda e passa de
verdade.

## Achados desta auditoria (2026-08-28)

- **[Corrigido, versionado e ativo em produção] XSS armazenado via JSON-LD
  sem escape de `</script>`** — seção 8 acima. Único achado com
  exploração real possível. Revisado: segredos, whitelist de payload,
  rate limit/HMAC, idempotência, proteção de origem, `next.config.mjs`
  (imagens), `.gitignore`, ausência de `eval`/`new Function`, e os outros
  usos de `dangerouslySetInnerHTML` no projeto (só este um existe).
  Nenhum outro problema encontrado nesta passada — o que não significa
  auditoria exaustiva de todo o código, só desta superfície (segredos,
  rota de escrita, rate limit, injeção de dado externo em HTML/script).
  Commit `9594cec`, pushado em `main` e confirmado em produção
  (`toursflow.com.br` e `toursflow.vercel.app`) via smoke test HTTP real
  no mesmo dia — Vercel faz deploy automático a partir de `main` (ver
  [DEPLOYMENT.md](DEPLOYMENT.md)), então o fix ficou ativo assim que o
  push completou. Sem prova estrutural via inspeção HTTP de que o
  registro real (`teste-integracao-toursflow-90f2bc`) exercitou o caminho
  de escape (o nome/descrição desse passeio não contém `<`) — a garantia
  de que o código correto está no ar vem do commit em `main` +
  confirmação do deployment no dashboard da Vercel, não de uma exploração
  ativa contra produção (deliberadamente não tentada).

## Limitações conhecidas (aceitas, não resolvidas nesta etapa)

- **Sem rate limit próprio na rota `/api/bookings` do lado do ToursFlow —
  classificado como HARDENING/defesa em profundidade, não bloqueador,
  em [ADR-007](DECISIONS.md#adr-007--rate-limit-próprio-do-toursflow-classificado-como-hardening-não-bloqueador)
  (revisado em 2026-08-28).** O NauticFlow já é a autoridade real de
  proteção: rate limit global + por visitante (contrato documentado),
  hold de capacidade e idempotência — estes dois últimos **comprovados em
  E2E real contra produção** (criação, replay, conflito de idempotência,
  `soldOut` refletido). Implementar uma camada própria no ToursFlow
  exigiria armazenamento compartilhado entre execuções serverless (ex.:
  Upstash Redis) — uma dependência SaaS nova, fora de escopo sem
  autorização explícita — para proteger contra um risco que já tem
  cobertura real a jusante. Não bloqueia o início da Fase 3; vale
  reavaliar a decisão se o volume de tráfego real justificar depois.
- Sem CAPTCHA.
- Proteção CSRF é best-effort (seção 5) — reforçada na Fase 2 com
  `Sec-Fetch-Site` e testada explicitamente contra hosts oficiais/hosts
  atacantes, mas continua não sessão-based.
- Next.js 14.2.5 com CVEs conhecidos, upgrade pendente.
- **`X-ToursFlow-Client-Key`: implementação e comportamento do lado
  ToursFlow comprovados por teste automatizado real (seção 2 acima); o
  que continua sem comprovação é o lado NauticFlow — nenhum E2E
  cross-serviço confirma que o NauticFlow aplica o limite usando esta key
  ou ignora um header forjado do lado dele.** Documentado como pendente
  desde a implementação original (2026-08-27); revisado nesta entrada
  (2026-08-28) e confirmado que a lacuna continua real — nenhum commit
  ou teste posterior fechou isso (ver
  [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md#o-que-ainda-não-existe)).
- Sem Content-Security-Policy (seção 10) — deferida para etapa própria.
- **Nenhum E2E controlado contra produção foi executado na Fase 3**
  (criação real de reserva pela UI, replay, conflito, `holdExpiresAt`,
  `priceCents`/`totalCents` reais) — decisão deliberada: não existe
  mecanismo de cancelamento/cleanup de reserva acessível neste
  repositório, e a regra desta fase foi explícita em não criar hold real
  sem um jeito seguro de desfazê-lo depois. Toda a validação desta fase
  veio de testes automatizados (mock de `fetch`, 209 testes) e de
  verificação em browser real **até o step de revisão**, sem clicar em
  "Confirmar reserva" contra o NauticFlow de produção.

## PLANEJADO / NÃO IMPLEMENTADO

- Autenticação de usuário/sessão (turista) — inexistente hoje.
- Rate limit próprio no ToursFlow — classificado como hardening
  (ADR-007), não implementado; pode ser revisitado se o volume de
  tráfego justificar.
- E2E cross-serviço específico do rate limit por `X-ToursFlow-Client-Key`
  contra o NauticFlow em produção (deploy coordenado dos dois lados ainda
  não aconteceu).
- E2E controlado da criação real de reserva pela UI (Fase 3) — bloqueado
  por falta de mecanismo de cleanup; avaliar antes de publicar este
  fluxo.
- CAPTCHA no fluxo de reserva.
- Upgrade do Next.js para resolver os CVEs da auditoria pré-integração.
- Content-Security-Policy.
- Checkout (cartão), split visível ao ToursFlow, webhook (recebido só
  pelo NauticFlow), voucher real — fora do escopo. **Pix já tem contrato
  real confirmado e wiring completo** (tipos, rota interna
  `/api/bookings/[bookingId]/payment`, client server-only, client do
  navegador, UI) — mas `PAYMENTS_UI_ENABLED = false` mantém tudo isso
  inatingível pela UI pública, e nenhuma chamada real foi feita (zero
  `fetch` ao NauticFlow para pagamento, confirmado por grep e por
  verificação em browser real). Ver [PAYMENTS.md](PAYMENTS.md) (ADR-010/
  ADR-011/ADR-012 em [DECISIONS.md](DECISIONS.md)).
