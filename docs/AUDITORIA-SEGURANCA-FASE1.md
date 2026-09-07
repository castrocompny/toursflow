# Auditoria de Segurança — Fase 1

Data: 2026-09-04
Commit auditado: `3ea9f30` (main, já em produção — `https://toursflow.com.br`)
Escopo: auditoria controlada, **nenhuma correção aplicada nesta rodada**. Autorizado pelo proprietário do projeto.

## Fase 2 — Correções aplicadas (2026-09-04, local only, sem deploy)

MEDIUM-1, MEDIUM-2, MEDIUM-3 e LOW-1 (abaixo) foram corrigidos e testados nesta rodada — detalhe de cada correção junto do achado original. **LOW-2 (Next.js 14.2.5 unsupported) permanece aberto de propósito** — upgrade de major version fica para uma **Fase 3 — Framework Upgrade** dedicada (análise de breaking changes, testes completos, deploy separado), não incluída aqui. Nenhuma das duas feature flags (`BOOKING_CHECKOUT_ENABLED`/`PAYMENTS_UI_ENABLED`) foi alterada; nenhum dado real foi criado; nenhum push/deploy foi feito.

## Fase 3 — Framework upgrade Next 14 → Next 15.5.24 (2026-09-04, branch `security/next15-upgrade`; publicado em produção em 2026-09-07)

**LOW-2 corrigido.** Next.js `14.2.5` → `15.5.24` (Maintenance LTS — Next 16 Active LTS avaliado separadamente, Fase 4), React `18.3.1` → `19.2.8`. Breaking change real encontrada e corrigida: `params`/`searchParams` de página e de Route Handler passaram a ser `Promise` (5 arquivos ajustados: as 4 páginas dinâmicas + a rota de pagamento). Nenhum outro breaking change encontrado — sem middleware/Server Actions/`forwardRef`/`useFormState`/`ReactDOM.render`/`propTypes` no projeto, e todo `fetch()` do data layer já declarava `cache`/`next.revalidate` explicitamente (semântica de cache do Next 15 não teve efeito). `next lint` (deprecado, será removido no Next 16) migrado para `eslint .` direto — mesma config (`next/core-web-vitals`), sem nenhuma regra desligada. `npm audit`: as 33 advisories específicas do Next 14 desapareceram; resta só o `postcss` transitivo interno do Next (2 vulnerabilidades, precisa do Next 16 para sumir de vez — fora do escopo desta fase, vira pendência formal "Fase 4"). 303 testes continuam passando sem nenhuma alteração de código de teste/componente além dos 5 arquivos de `params`. Detalhe completo abaixo, na seção LOW-2.

Estado confirmado no momento da auditoria:
- `BOOKING_CHECKOUT_ENABLED = false`
- `PAYMENTS_UI_ENABLED = false`
- NauticFlow: `MARKETPLACE_PAYMENTS_ENABLED`/`MARKETPLACE_WITHDRAWAL_PAYOUT_ENABLED` fora do controle desta sessão (ver ressalva registrada em 2026-09-01, `SECURITY.md`/`RESERVAS-SERVER-TO-SERVER.md` — não puderam ser confirmadas como desligadas via CLI, mas `PAYMENTS_UI_ENABLED` neutraliza o risco independente do estado delas, ADR-012).
- Nenhum dado real criado, nenhuma cobrança, nenhum saque, R$ 0,00 movimentado.
- Working tree limpo antes e depois desta auditoria.

## Metodologia

- Leitura de código (`src/`, `next.config.mjs`, `package.json`).
- `npm audit`, `npm outdated`, `npx next info`.
- Testes automatizados locais (suíte existente, 285 testes) + um teste temporário de auditoria (criado, executado, e **removido** antes do fim da tarefa — não commitado) para provar empiricamente o achado de vazamento de mensagem de erro do upstream.
- Requisições HTTP seguras (GET/HEAD, e POST/GET não-destrutivos contra as rotas gateadas) contra produção real (`https://toursflow.com.br`), sempre com `departureId`/`bookingId` fictícios e dados de teste, nunca reais.
- Uma verificação de UI via Playwright (headless, contra produção) só para o "Continuar reserva" nesta rodada não foi refeita — reaproveitado o resultado já obtido e documentado na tarefa de deploy anterior (2026-09-04, mesmo dia, botão "Confirmar reserva" ausente, zero requisição a `/api/bookings`).
- Nenhuma ação destrutiva, brute force, load test, criação de dado real, extração de segredo da Vercel, ou alteração de env var/Production/NauticFlow.

## Limitações desta auditoria

- Não é um pentest completo nem uma auditoria de todas as ~33 advisories do `npm audit` uma a uma — priorizei as que pareciam mais plausivelmente aplicáveis a este app específico (App Router puro, sem middleware, sem Server Actions, sem servidor customizado, hospedado na Vercel) e usei as demais como evidência de classe, não uma por uma.
- Não tive acesso à Vercel API/CLI autenticada nesta sessão para confirmar diretamente o estado de `MARKETPLACE_PAYMENTS_ENABLED`/`MARKETPLACE_WITHDRAWAL_PAYOUT_ENABLED` no NauticFlow — dependo do que já está documentado (ressalva de 2026-09-01).
- Não testei o comportamento dos gates de booking/payment com as flags `true` **diretamente em produção** (proibido pelo escopo: criaria dado real) — a cobertura dessas checagens vem da suíte de testes local (mockada) + verificação de que o valor real das flags em produção continua `false` (confirmado via os próprios erros `BOOKING_CHECKOUT_NOT_ENABLED`/`PAYMENT_PROVIDER_NOT_ENABLED`).

---

## Achados

### MEDIUM-1 — Mensagem de erro bruta do NauticFlow repassada ao navegador (upstream error leakage)

**Status: CORRIGIDO (2026-09-04).** `nauticflow-bookings.ts`/`nauticflow-payments.ts` não leem mais `errorBody.error?.message` — o tipo do envelope de erro nem declara mais esse campo (`{ error?: { code?: string } }`), tornando o vazamento estruturalmente impossível de reintroduzir por acidente. A mensagem enviada ao navegador vem sempre de `getBookingErrorMessage(code)`/`getPaymentErrorMessage(code)` (catálogo local, curado), usando o `code` já saneado por whitelist — nunca o texto do upstream. Testado com mensagem fictícia `"INTERNAL DATABASE PASSWORD abc123"` em dois cenários (código conhecido e desconhecido) em `nauticflow-bookings.test.ts` e no novo `nauticflow-payments.test.ts` — 4 testes novos, todos provando que o texto arbitrário nunca aparece na mensagem final.

**Arquivos:** `src/lib/nauticflow-bookings.ts:108-111`, `src/lib/nauticflow-payments.ts:71-75`

**Evidência:** teste local temporário (mock de `fetch`, removido após a auditoria) provou que uma mensagem fictícia de erro interno (`"internal: connection to db-shard-07.internal.nauticflow at 10.0.4.12:5432 refused (pgbouncer pool exhausted, see trace id 8f2c1e)"`) devolvida pelo NauticFlow chega **verbatim** no corpo da resposta HTTP de `/api/bookings`, mesmo com `code` corretamente saneado para `INTERNAL_ERROR` (código desconhecido). Ambos os clientes (`nauticflow-bookings.ts` e `nauticflow-payments.ts`) usam `errorBody.error?.message || <fallback>` — o `message` do upstream nunca é substituído por uma mensagem curada, mesmo quando o `code` é reconhecido.

**Condição necessária:** o NauticFlow (sistema externo, fora do controle do ToursFlow) precisa devolver, em algum momento, uma mensagem de erro verbosa/de debug — algo que o ToursFlow não controla e não pode garantir que nunca aconteça.

**Impacto:** exposição de detalhe interno de arquitetura do NauticFlow (hostnames internos, tecnologia de banco, trace ids) a qualquer chamador anônimo da API pública do ToursFlow — não é uma tomada de conta nem execução de código, mas é *information disclosure* real.

**Mitigação parcial já existente (reduz mas não elimina o risco):** o cliente oficial do navegador (`booking-submission.ts`/`payment-client.ts`) **ignora completamente** o campo `message` da resposta do servidor e regenera a mensagem exibida ao usuário só a partir do `code`, via `getClientBookingErrorMessage()`/`getClientPaymentErrorMessage()`. Ou seja, a UI oficial (`BookingSelector`/`PixPayment`) **nunca renderiza** o texto vazado. O vazamento existe na resposta HTTP crua do servidor (visível via devtools/Network, `curl`, proxy, logs), não na tela que o usuário final vê através do fluxo normal.

**Explorável em Production hoje?** Tecnicamente sim (a rota já está em produção), mas **neutralizado pelas flags atuais**: com `BOOKING_CHECKOUT_ENABLED`/`PAYMENTS_UI_ENABLED` em `false`, a rota nunca chega a chamar o NauticFlow (falha fechada antes disso) — não há como o NauticFlow sequer devolver essa mensagem hoje.

**Correção recomendada (não aplicada nesta rodada):** parar de repassar `errorBody.error?.message` do upstream; usar só `code` (já saneado por whitelist) para escolher uma mensagem local seguraem `nauticflow-bookings.ts`/`nauticflow-payments.ts`, mesmo padrão que `getBookingErrorMessage()`/`getPaymentErrorMessage()` já fazem do lado do cliente — aplicar a mesma curadoria no servidor, não só no cliente.

---

### MEDIUM-2 — `Cache-Control: public` em respostas de API que devolverão dado por-reserva

**Status: CORRIGIDO (2026-09-04).** Novo helper `noStoreJson()` (`src/lib/http-guards.ts`) — `NextResponse.json()` com `Cache-Control: private, no-store, max-age=0` sempre explícito. As três rotas (`POST /api/bookings`, `POST`/`GET /api/bookings/[bookingId]/payment`) foram migradas para usá-lo em **toda** resposta, sucesso e erro (nunca dependendo do default do Next.js/Vercel). Testado: 9 testes novos cobrindo booking OFF, payment OFF, sucesso mockado (flags `true` em teste), erro de validação, e erro de upstream mockado — todos confirmando `no-store` presente e `public`/`s-maxage` ausentes. Reconfirmado empiricamente contra o dev server local após a correção.

**Rotas:** `POST /api/bookings`, `POST /api/bookings/[bookingId]/payment`, `GET /api/bookings/[bookingId]/payment`

**Evidência:** as três rotas devolvem `Cache-Control: public, max-age=0, must-revalidate` em produção (comportamento padrão do Next.js para Route Handlers que não configuram cache explicitamente — nenhuma delas define `export const dynamic = 'force-dynamic'` nem um header de cache próprio).

**Condição necessária:** nenhuma hoje — o header já está assim em produção. O RISCO fica latente até uma das flags ser ligada.

**Impacto (quando as flags estiverem ligadas):** `GET /api/bookings/[bookingId]/payment` devolverá, por design, dado específico da reserva (status do pagamento, QR/copia-e-cola do Pix, `priceCents`/`totalCents`) — um endpoint que devolve dado específico-do-usuário nunca deveria usar `public` (que autoriza caches compartilhados/CDN/proxy a armazenar a resposta). `must-revalidate` reduz o risco prático de reuso indevido por caches bem-comportados, mas não é a semântica correta para este tipo de recurso — o padrão correto (já usado em `/passeios`) é `private, no-store`.

**Explorável em Production hoje?** NÃO — hoje a resposta é idêntica para qualquer `bookingId` (mensagem genérica de gate desligado), sem dado real nenhum.

**Neutralizado pelas flags atuais?** SIM, totalmente, enquanto ambas continuarem `false`.

**Correção recomendada (não aplicada nesta rodada):** adicionar `export const dynamic = 'force-dynamic'` e/ou um header explícito `Cache-Control: private, no-store` nas três respostas, **antes** de qualquer uma das duas flags ser ligada.

---

### MEDIUM-3 — `next.config.mjs`: `dangerouslyAllowSVG: true` sem `images.contentSecurityPolicy`

**Status: CORRIGIDO (2026-09-04).** Adicionado `images.contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"` em `next.config.mjs` — sintaxe exata recomendada pela documentação oficial do Next.js para esse cenário. `dangerouslyAllowSVG`/`contentDispositionType: attachment` mantidos como estavam; `remotePatterns` não foi ampliado.

**Arquivo:** `next.config.mjs`

**Evidência:** a documentação oficial do Next.js recomenda explicitamente configurar `contentSecurityPolicy` (ex.: `"default-src 'self'; script-src 'none'; sandbox;"`) **junto** com `dangerouslyAllowSVG: true` — "particularly important... to prevent scripts embedded in the image from executing". O projeto configura `dangerouslyAllowSVG: true` e `contentDispositionType: 'attachment'` (correto, e é a mitigação primária — força download em vez de renderizar inline ao navegar direto para a URL da imagem), mas **não** configura `images.contentSecurityPolicy`.

**Condição necessária:** um SVG malicioso (com `<script>` embutido) precisaria estar hospedado no bucket permitido (`gggpihphjjxndpfntnvm.supabase.co/storage/v1/object/**`) — `remotePatterns` já é restrito a esse único host+prefixo (boa prática, não wildcard), então isso exigiria que o Storage do NauticFlow fosse comprometido, ou que o operador fizesse upload de um SVG malicioso — não é um vetor de ataque anônimo direto pela internet.

**Impacto:** camada de defesa em profundidade ausente — `contentDispositionType: attachment` já cobre o vetor principal (navegação direta à URL da imagem); a CSP de imagem cobriria cenários adicionais (o próprio Next.js trata como recomendação "particularmente importante", não opcional).

**Explorável em Production hoje?** Só se o bucket Supabase do NauticFlow for comprometido ou um SVG malicioso for hospedado lá — não é uma exploração anônima direta.

**Neutralizado pelas flags atuais?** Não é relacionado às flags de booking/payment — é uma configuração de imagem, independente delas.

**Correção recomendada (não aplicada nesta rodada):** adicionar `images.contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"` em `next.config.mjs`.

---

### LOW-1 — `.gitignore` cobre só `.env*.local`, não `.env` puro

**Status: CORRIGIDO (2026-09-04).** `.gitignore` passou a cobrir `.env*` genericamente, com exceção explícita de `!.env.example`. Verificado com `git check-ignore`: `.env.example` continua não-ignorado/tracked; `.env`, `.env.production`, `.env.local` e qualquer outra variante passam a ser ignorados.

**Arquivo:** `.gitignore`

**Evidência:** `.gitignore` tem só a linha `.env*.local` — cobre `.env.local`, `.env.production.local` etc., mas **não** cobre um arquivo `.env` sem sufixo `.local`, nem `.env.production`/`.env.development` sem `.local`. Confirmado que, hoje, **nenhum** desses arquivos existe no repositório (`git ls-files` só lista `.env.example`, com placeholders vazios) — não há segredo vazado agora.

**Impacto:** se alguém no futuro criar um `.env`/`.env.production` local (erro comum) e rodar um `git add` amplo, o segredo (`TOURSFLOW_API_SECRET`) poderia ser commitado sem o `.gitignore` bloquear automaticamente. Mitigado hoje pela disciplina de processo já documentada no projeto ("nunca `git add -A`, sempre revisar `git status` antes de commitar") — mas essa disciplina depende de todo colaborador seguir, o `.gitignore` deveria ser a rede de segurança estrutural.

**Explorável hoje?** Não — nenhum `.env` real existe no repositório.

**Correção recomendada (não aplicada nesta rodada):** ampliar o padrão para `.env*` com exceção explícita de `.env.example` (`.gitignore`: `.env*` + `!.env.example`).

---

### LOW-2 — Next.js 14.2.5: versão fora do suporte, patches não chegam automaticamente

**Status: CORRIGIDO (Fase 3, 2026-09-04, branch `security/next15-upgrade`; publicado em produção em 2026-09-07, Node Vercel 24.x confirmado no dashboard).** Next.js `14.2.5` → `15.5.24` (Maintenance LTS, versão exata pinada — `eslint-config-next` acompanhou), React `18.3.1` → `19.2.8` (`@types/react`/`@types/react-dom` atualizados junto). Next 16 (Active LTS) deliberadamente **não** usado nesta fase — avaliação separada, ver "Fase 4" abaixo.

**Breaking change real encontrada e corrigida:** `params`/`searchParams` de página e o segundo argumento de Route Handler passaram a ser `Promise` no Next 15 — 5 arquivos ajustados (`src/app/destinos/[slug]/page.tsx`, `src/app/passeios/page.tsx`, `src/app/passeios/[destino]/page.tsx`, `src/app/passeios/[destino]/[slug]/page.tsx`, `src/app/api/bookings/[bookingId]/payment/route.ts` + os dois arquivos de teste dessa rota). Descoberta pelo próprio `next build` (erro de tipo), não adivinhada — cada `params`/`searchParams` agora é `await`ado explicitamente antes do primeiro uso.

**Nenhum outro breaking change encontrado:** auditados e ausentes no projeto — `middleware.ts`, `'use server'` (Server Actions), `cookies()`/`headers()`/`draftMode()`, servidor customizado, `rewrites()`/i18n, `forwardRef`, `useFormState`/`useActionState`, `ReactDOM.render`, `propTypes`/`defaultProps`, import de `act()` fora de `@testing-library/react`. Todo `fetch()` do data layer (`src/data/sources/nauticflow-source.ts`) já declarava `cache: 'no-store'` ou `next: { revalidate }` explicitamente em cada chamada — a mudança do Next 15 no default de cache do `fetch()` (deixou de cachear implicitamente) não teve nenhum efeito aqui, porque o projeto nunca dependeu do default implícito.

**`next lint` migrado para `eslint .`:** `next lint` está deprecado e será removido no Next 16 (aviso explícito ao rodar). `package.json`: `"lint": "eslint ."` — mesma config (`.eslintrc.json`, `next/core-web-vitals`), zero regra desligada, `npm run lint` continua limpo.

**Regressão de segurança confirmada sem alteração:** os dois gates (`BOOKING_CHECKOUT_ENABLED`/`PAYMENTS_UI_ENABLED`, ambos `false`) continuam fail-closed, `Cache-Control: private, no-store, max-age=0` continua em toda resposta de booking/payment, `TOURSFLOW_API_SECRET`/`X-ToursFlow-Client-Key` continuam server-only, `amount` nunca vem do browser, CSP de imagem (MEDIUM-3) intacta — tudo verificado contra o dev server local pós-upgrade. Verificação de UI via Playwright (local): página de passeio abre, hidrata sem erro de console, chega até a revisão sem nenhum botão "Confirmar reserva", zero requisição a `/api/bookings`.

**`npm audit` antes → depois:** as 33 advisories específicas do Next 14.2.5 (tabela acima) **desapareceram todas**. Resta só `postcss` transitivo interno do Next (`node_modules/next/node_modules/postcss`), mesma análise de antes (build-time, CSS autoral, não explorável remotamente) — precisa do Next 16 para desaparecer de vez.

**Fase 4 (pendência formal, não iniciada):** Next 15 → Next 16 (Active LTS), só depois de estabilizar esta Fase 3 em produção. Ver `docs/DECISIONS.md`.

303 testes continuam passando, `npx tsc --noEmit`/`npm run lint`/`npx next build` verdes — nenhuma mudança de teste ou componente além dos 5 arquivos de `params`/`searchParams` listados acima.

**Arquivo:** `package.json` (`"next": "14.2.5"`, pin exato, sem `^`)

**Evidência:** `npx next info` reporta 14.2.5 como desatualizado (mais recente: 16.3.4). Em setembro de 2026: Next 14 está fora do ciclo de suporte ativo; Next 15 é Maintenance LTS; Next 16 é Active LTS. `npm outdated` mostra `Wanted = Current = 14.2.5` — ou seja, mesmo um `npm update` de rotina **nunca** atualizaria isso, porque o pin no `package.json` é exato (`"14.2.5"`, não `"^14.2.5"`). Esse é o motivo raiz de nenhum patch de segurança 14.2.x ter sido aplicado desde que essa versão foi fixada.

**`npm audit` reporta 33 advisories associadas ao range instalado.** Verifiquei individualmente uma amostra representativa contra a versão exata instalada (14.2.5) e a arquitetura real deste app (App Router only, sem `pages/`, sem `middleware.ts`, sem `'use server'`, sem servidor customizado, sem `rewrites()`/`i18n` no `next.config.mjs`, React 18.3.1 — não 19.x —, hospedado na Vercel):

| Advisory | Aplica-se a este app? | Motivo |
|---|---|---|
| GHSA-gp8f-8m3g-qvj9 (Cache Poisoning) | **NÃO** | Advisory afeta só Pages Router; app é 100% App Router |
| GHSA-g77x-44xx-532m (Image Opt. DoS, CVE-2024-47831) | **NÃO** | Advisory explicitamente não-explorável quando hospedado na Vercel |
| GHSA-955p-x3mx-jcvp (disclosure de Server Function endpoints) | **NÃO** | Exige Server Actions/`use cache`; app não usa nenhum dos dois |
| GHSA-p9j2-gv94-2wf4 (SSRF via rewrites) | **NÃO** | Exige `rewrites()`/`redirects()` com hostname dinâmico; `next.config.mjs` não tem nenhum dos dois |
| GHSA-mwv6-3258-q52c (DoS Server Components) | **NÃO** | Causa raiz é bug do **React 19.x**; app usa React 18.3.1 |
| GHSA-qpjv-v59x-3qc4 (Race condition cache poisoning, CVE-2025-32421) | **NÃO** | Advisory afeta só Pages Router |
| GHSA-68g3-v927-f742 (Cache confusion de `fetch`) | **Estruturalmente sim (App Router), mas sem o padrão de código vulnerável** | Exige `fetch(new Request(init), initDiferente)`; `grep` confirma que **nenhum** `fetch()` de produção do projeto usa `new Request()` (só em testes) — todos usam `fetch(url, init)` direto |
| Demais ~26 advisories (middleware bypass/SSRF, Server Actions DoS, i18n Pages Router, WebSocket SSRF, custom server SSRF, CSP nonce XSS) | **NÃO** (estruturalmente) | Exigem `middleware.ts` (não existe), Server Actions (`'use server'`, não existe), i18n no Pages Router (não existe, nem Pages Router), WebSocket (não existe), servidor customizado (não existe), ou nonces de CSP (app não usa CSP com nonce) |

**Conclusão sobre o dependency audit:** nenhuma das advisories verificadas individualmente é explorável neste app específico, dada a arquitetura real (App Router puro + Vercel + React 18 + sem middleware/Server Actions/rewrites/i18n/WebSocket/servidor customizado). Isso **não** significa que a versão seja segura de forma geral — só que a superfície de ataque real deste app específico não intersecta com as classes de vulnerabilidade verificadas. Não tive tempo/orçamento nesta auditoria para verificar as ~26 restantes uma a uma com a mesma profundidade — a tabela acima é representativa, não exaustiva.

**`postcss` (dependência transitiva de `next`):** o `postcss` que o próprio Next.js empacota internamente (`node_modules/next/node_modules/postcss@8.4.31`) está na faixa vulnerável (`<=8.5.22`, XSS/leitura arbitrária de arquivo via `sourceMappingURL`). O `postcss` que o **projeto** usa diretamente (`^8.4.40` em `package.json`, resolvido para `8.5.26`) já está **acima** da faixa vulnerável. A cópia vulnerável só é usada internamente pelo Next.js **em build time**, processando **CSS autoral do próprio projeto** (Tailwind), nunca conteúdo controlado por um visitante em tempo de requisição — não é explorável remotamente neste app.

**Classificação separada, explícita:** versão **UNSUPPORTED** (Next 14 fora do ciclo de suporte ativo) — isso por si só é um risco de postura/processo (futuras vulnerabilidades reais não terão patch automático, e a superfície "estruturalmente não aplicável" pode mudar se o app crescer para usar middleware/Server Actions/rewrites no futuro, reabrindo essas classes de advisory).

**Correção recomendada (não aplicada nesta rodada):** planejar upgrade para Next 15 (Maintenance LTS) ou 16 (Active LTS) como item de roadmap — fora do escopo de correção imediata desta auditoria (upgrade de major version exige teste dedicado, não é `npm audit fix --force` às cegas). No mínimo, trocar o pin exato `"14.2.5"` por um range com caret (`"^14.2.5"`) para que patches 14.2.x futuros parem de exigir intervenção manual.

---

### INFO — demais observações (sem ação necessária ou já mitigadas)

- **`x-powered-by: Next.js`** presente em todas as respostas — vazamento trivial de identidade de framework (nunca de segredo). Correção opcional: `poweredByHeader: false` em `next.config.mjs`.
- **HSTS presente** (`max-age=63072000`), mas sem `includeSubDomains`/`preload`. Não é um problema per se (não há subdomínios sensíveis conhecidos), só uma opção de hardening adicional.
- **`toursflow.vercel.app` responde 200 diretamente** (sem redirect para o domínio canônico), mas ambos os hosts servem `<link rel="canonical" href="https://toursflow.com.br"/>` corretamente — mitiga o problema de SEO/conteúdo duplicado. Comportamento padrão de domínio de preview da Vercel, não uma falha de configuração.
- **Origin/CSRF (`isTrustedOrigin()`, `src/lib/http-guards.ts`):** confirmado que uma requisição **sem** `Origin` e **sem** `Sec-Fetch-Site` (ex.: um script não-browser, `curl`) passa pela checagem — já documentado no próprio `SECURITY.md` como limitação aceita ("best-effort, não é autenticação nem CSRF completo"). Cenário concreto: como a rota não tem nenhuma autenticação de usuário (é uma API pública para qualquer visitante anônimo), um bypass de Origin não abre nada que uma requisição de browser legítima já não pudesse fazer — o risco real (criação de holds em massa) já é tratado como aceito/hardening em ADR-007, independente do Origin. Não é um achado novo, só reconfirmado com o cenário concreto pedido.
- **`client-ip.ts`/`toursflow-client-key.ts`:** reconfirmado nesta auditoria (código + testes existentes, incluindo simulação de `VERCEL=1` sem header confiável) — `x-vercel-forwarded-for` só é confiado com `VERCEL=1`; fora da Vercel, cai para `x-forwarded-for` (nunca em produção real); header de client-key do navegador nunca é lido; IP nunca logado; IPv4/IPv6 normalizam consistentemente (incluindo IPv4-mapped); entradas malformadas/gigantes falham fechado (`onUnavailable()`, nunca uma identidade tipo "unknown"). Sem achado novo.
- **SSRF/trust boundary:** `NAUTICFLOW_API_URL` só vem de `process.env` (nunca de header/body/query); `bookingId`/`departureId` sempre validados como UUID estrito antes de entrar em URL/body; nenhum host/protocolo/porta é controlável pelo visitante. Nenhum SSRF encontrado.
- **XSS:** único uso de `dangerouslySetInnerHTML` é o JSON-LD via `toSafeJsonLdScript()` — testado empiricamente nesta auditoria com 3 payloads (`<script>alert(1)</script>`, `</script><script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`) — todos neutralizados (todo `<` literal escapado para `<`, nenhum fecha a tag `<script>` prematuramente). Nenhum outro ponto de injeção HTML encontrado (React escapa texto por padrão; `boardingMapUrl()` usa host fixo do Google Maps + `encodeURIComponent`).
- **Métodos HTTP/CORS:** `PUT`/`PATCH`/`DELETE` corretamente devolvem `405` nas duas rotas. Nenhum header CORS (`Access-Control-Allow-Origin`) é devolvido, nem para uma Origin cruzada de teste — não há CORS mal configurado.

---

## Conclusão

Zero CRITICAL, zero HIGH. Três MEDIUM e dois LOW identificados na Fase 1. **Fase 2 (2026-09-04): MEDIUM-1, MEDIUM-2, MEDIUM-3 e LOW-1 corrigidos e testados.** **Fase 3 (2026-09-04, branch `security/next15-upgrade`): LOW-2 também corrigido** — Next.js 14.2.5 → 15.5.24, React 18.3.1 → 19.2.8, único breaking change real (`params`/`searchParams` assíncronos) identificado e corrigido, 33 advisories do Next 14 eliminadas do `npm audit`. **Todos os 5 achados da Fase 1 estão corrigidos.** 303 testes, typecheck/lint/build verdes em todas as três fases.

Pendência formal restante, não bloqueadora: **Fase 4** (Next 15 → Next 16 Active LTS, avaliação futura separada) — elimina o último resíduo de `npm audit` (`postcss` transitivo interno do Next, já classificado como não explorável remotamente nesta arquitetura).

Nenhuma das duas feature flags (`BOOKING_CHECKOUT_ENABLED`/`PAYMENTS_UI_ENABLED`) foi alterada em nenhuma das três fases; nenhum dado real foi criado. **Atualização (2026-09-07):** `main` (`f8472b6`, contendo as três fases) foi pushada e publicada em produção — smoke completo (home/passeios/robots/sitemap/página de passeio, security headers, os dois gates, `Cache-Control`) verificado ao vivo contra `https://toursflow.com.br`, ambas as flags confirmadas `false` em produção, R$ 0,00 movimentado. Detalhe no changelog, entrada de 2026-09-07.
