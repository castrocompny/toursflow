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

## 5. Proteção de origem (best-effort, documentada como tal)

`isTrustedOrigin()` em `src/app/api/bookings/route.ts` compara o host do
header `Origin` (quando o navegador o envia) com o host da própria
requisição, rejeitando com `403 INVALID_REQUEST` se divergir. **Isto não é
autenticação nem proteção CSRF completa** — não há sessão de usuário nesta
etapa para algo mais forte, e nem todo navegador envia `Origin` em todo
cenário (nesse caso a checagem deixa passar). É uma camada independente do
rate limit por `X-ToursFlow-Client-Key` — uma não substitui a outra.

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

## 9. Dependências

`npm audit` acusou vulnerabilidades conhecidas do Next.js 14.2.5 na
auditoria pré-integração de 2026-08-25 (ver
[AUDITORIA-PRE-INTEGRACAO.md](AUDITORIA-PRE-INTEGRACAO.md)). **Upgrade do
Next.js ainda não foi feito** — registrado como pendente, não como
resolvido.

## Testes de segurança relevantes

- `booking-validation.test.ts` — whitelist do payload, rejeição de campo
  extra, formato de `Idempotency-Key`.
- `client-ip.test.ts` — fonte de IP correta por ambiente, falha fechada
  sem header confiável.
- `toursflow-client-key.test.ts` — determinismo do HMAC, domain separation,
  nunca usa o IP em claro no output.
- `nauticflow-bookings.test.ts` (ou equivalente) — segredo nunca aparece em
  resposta de erro; sem fallback simulado em falha de rede/timeout.

`npm test` roda todos (86 testes ao todo no projeto, cobrindo também
catálogo/UI, não só segurança).

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

- Sem rate limit próprio na rota `/api/bookings` do lado do ToursFlow (o
  limite real mora no NauticFlow via `X-ToursFlow-Client-Key`); antes de
  conectar a UI publicamente vale reavaliar se uma camada própria é
  necessária — com estado compartilhado entre execuções serverless (ex.:
  Upstash Redis), nunca um limiter em memória (não protege nada na Vercel,
  onde cada invocação pode rodar numa instância diferente).
- Sem CAPTCHA.
- Proteção CSRF é best-effort (seção 5), não sessão-based.
- Next.js 14.2.5 com CVEs conhecidos, upgrade pendente.
- `X-ToursFlow-Client-Key` só validado localmente do lado do NauticFlow até
  o momento — deploy coordenado dos dois lados ainda não aconteceu, então
  o E2E real desta proteção específica está pendente (ver
  [RESERVAS-SERVER-TO-SERVER.md](RESERVAS-SERVER-TO-SERVER.md#o-que-ainda-não-existe)).

## PLANEJADO / NÃO IMPLEMENTADO

- Autenticação de usuário/sessão (turista) — inexistente hoje.
- Rate limit próprio no ToursFlow.
- CAPTCHA no fluxo de reserva.
- Upgrade do Next.js para resolver os CVEs da auditoria pré-integração.
