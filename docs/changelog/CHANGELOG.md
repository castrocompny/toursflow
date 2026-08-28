# Changelog do ToursFlow

Registro de tudo o que é feito no projeto: setup, correções, features, decisões.
Ordem cronológica, mais recente no topo. Formato de cada entrada:

```
## AAAA-MM-DD — Título curto

O que foi feito, por quê, e o que mudou de fato (arquivos/áreas afetadas).
```

Para arquitetura e como o projeto funciona hoje, ver [../ARCHITECTURE.md](../ARCHITECTURE.md).
Para o diagnóstico completo pré-integração com o NauticFlow, ver [../AUDITORIA-PRE-INTEGRACAO.md](../AUDITORIA-PRE-INTEGRACAO.md).

---

## 2026-08-28 — Correções na Fase 2 antes do commit: limite de corpo real, reconciliação do histórico do rate limit, testes de Origin/idempotência

Revisão do relatório da Fase 2 encontrou dois pontos a corrigir antes de commitar, nenhum deles um problema de segurança novo — os dois eram sobre a rota já estar mais forte ou mais bem documentada do que o relatório anterior deixava claro.

**1. Limite de corpo passou a contar bytes reais, não só `Content-Length`.** `readBodyWithLimit()` (`src/app/api/bookings/route.ts`) lê o corpo em streaming, contando bytes chunk a chunk, e aborta com `413` assim que ultrapassa 10KB — antes o limite dependia só do header `Content-Length`, que um cliente pode omitir ou declarar errado. `Content-Length` continua servindo como rejeição antecipada (sem ler nada) quando ele mesmo já admite um valor grande demais, mas nunca mais é usado para *permitir* passagem. 6 testes novos cobrindo os 4 cenários reais (corpo normal, `Content-Length` grande, corpo grande sem `Content-Length`, `Content-Length` mentiroso) + JSON malformado + maior payload legítimo possível ainda bem abaixo do limite.

**2. Reconciliado o histórico real do `X-ToursFlow-Client-Key` — não foi encontrada evidência de E2E cross-serviço já concluído.** Revisão de `RESERVAS-SERVER-TO-SERVER.md`, `CHANGELOG.md` (entrada de 2026-08-27) e do histórico de commits confirmou que a implementação do lado ToursFlow (fonte de IP, HMAC, rota ignorando header forjado, servidor sempre gerando a própria key) está correta e comprovada por teste automatizado real — mas nenhum documento, commit ou teste registra um E2E que tenha confirmado o NauticFlow, do lado dele, aplicando o limite ou ignorando um header forjado equivalente. A documentação de 2026-08-27 já registrava isso como pendente ("o NauticFlow só tem a validação... no ambiente local dele... o E2E desta parte específica está pendente") e nada mudou isso desde então — a lacuna é real, não uma suposição.

Como consequência dessa reconciliação, **a decisão de não implementar rate limit próprio do ToursFlow (ADR-007) foi reclassificada de "bloqueador" para "hardening/defesa em profundidade"**: o risco mais grave (overbooking, reserva duplicada) já é protegido por hold + idempotência do NauticFlow, comprovados em E2E real contra produção antes desta fase — o que falta é só a confirmação E2E específica da granularidade por visitante, não a ausência de proteção. Análise completa em [docs/DECISIONS.md](../DECISIONS.md) (ADR-007, com nota de revisão).

**3. Testes de Origin explícitos** (`route.test.ts`): aceita `toursflow.com.br`/`toursflow.vercel.app` em qualquer combinação Origin/Host; rejeita `toursflow.com.br.attacker.example` (prova comparação por host exato, não substring) e `attacker.example`; rejeita `Sec-Fetch-Site: cross-site` mesmo com Origin batendo; confirma que `localhost` não é liberado em produção e só é aceito quando o Host da própria requisição também é `localhost` (dev local).

**4. Ciclo de vida da Idempotency-Key extraído para função pura testável** (`resolveIdempotencyKey()` em `src/lib/idempotency-key.ts`, usada agora por `BookingSelector`): reaproveita a key em re-render/retry da mesma tentativa, regenera quando departure/quantidade/dados do comprador mudam, e — regra nova, documentada para a Fase 3 — sempre gera key nova depois de um reset pós-sucesso (`key: null`), mesmo que os dados da próxima tentativa sejam idênticos aos da reserva já concluída.

**5. Auditoria de PII confirmada limpa** no diff inteiro da Fase 2: nenhum `console.log`/`console.error`/`localStorage`/`sessionStorage`/`analytics`/`URLSearchParams`/`router.push` toca em `cpf`/`email`/`phone`/`customer` fora do já documentado (máscaras na revisão, nada persistido, nada enviado).

19 testes novos nesta correção (145 no total). `npm run typecheck`, `lint`, `test`, `build` verificados, todos verdes. Documentado em [docs/SECURITY.md](../SECURITY.md), [docs/DECISIONS.md](../DECISIONS.md), [docs/RESERVAS-SERVER-TO-SERVER.md](../RESERVAS-SERVER-TO-SERVER.md). **Ainda não commitado.**

## 2026-08-28 — Fase 2 do fluxo de reserva: dados do comprador + hardening de /api/bookings

Substituído o placeholder "Dados do comprador" (Fase 1) por um formulário real: `CustomerForm` (nome, e-mail, telefone, CPF opcional) → `BookingReview` (resumo com e-mail/telefone/CPF mascarados). `BookingSelector` agora orquestra 3 steps (seleção → formulário → revisão), com departure/quantidade/dados do comprador preservados ao navegar entre eles (estado só em memória, nunca localStorage/URL). **Nenhum `fetch` acontece em nenhum step** — confirmado por teste (spy em `global.fetch`) e por verificação em browser real (Playwright).

Lógica pura nova, testável sem DOM:
- `src/lib/customer-form.ts` — validação de nome/e-mail/telefone (regras de UX do ToursFlow, não do contrato — o backend só exige string não vazia dentro do limite de tamanho), validação de CPF com checksum real + rejeição de sequência repetida (CPF continua opcional, como já era em `BookingCustomerInput`), máscaras de digitação e de exibição (`maskEmail`/`maskPhone`/`maskCpf` — nunca o dado completo no step de revisão).
- `src/lib/idempotency-key.ts` — gera e mantém uma `Idempotency-Key` por tentativa lógica de reserva (regenerada só quando `departureId`/`quantity`/dados do comprador mudam), preparada para a Fase 3. **Não enviada ainda.**
- `src/lib/booking-error-messages.ts` — mensagem segura em português para cada um dos 14 `BookingErrorCode`, preparada para a Fase 3. **Não usada ainda.**

Hardening de `/api/bookings` (`src/app/api/bookings/route.ts`), antes de a rota receber tráfego real da UI:
- Content-Type restrito a `application/json` (415 caso contrário).
- Limite de corpo via `Content-Length` (10KB, 413 se exceder) — limitação documentada: não protege contra corpo grande sem esse header.
- `isTrustedOrigin()` reforçada: `Sec-Fetch-Site: cross-site` rejeita sempre (sinal que o navegador não deixa a página forjar); sem esse sinal, cai para `Origin` vs. `Host`/allowlist de hosts oficiais (`toursflow.com.br`, `toursflow.vercel.app`).

Decisão formal registrada em [ADR-007](../DECISIONS.md#adr-007--sem-rate-limit-próprio-no-toursflow-nesta-fase): **não** implementar rate limit próprio do ToursFlow nesta fase — exigiria uma dependência SaaS nova (ex.: Upstash Redis) para funcionar de verdade em serverless, fora de escopo sem autorização; o NauticFlow continua sendo a autoridade real de rate limit. Continua um bloqueador a revisitar antes da Fase 3.

Headers de segurança de baixo risco adicionados em `next.config.mjs` (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`). CSP deliberadamente fora de escopo — exigiria investigação própria para não quebrar hidratação do Next/JSON-LD inline/Google Fonts.

37 testes novos (customer-form, idempotency-key, booking-error-messages, hardening da rota, componente do novo fluxo) — total 126. `npm run typecheck`, `lint`, `test` e `build` verificados, todos verdes. Fluxo completo (seleção → formulário com erro → formulário válido → revisão mascarada → editar → voltar) verificado em browser real (Playwright) contra o passeio de integração — zero requisições de rede, zero erro de console.

Documentado em [docs/SECURITY.md](../SECURITY.md) (seções 5, 9, 10, 11 novas/atualizadas), [docs/DECISIONS.md](../DECISIONS.md) (ADR-007), [docs/ARCHITECTURE.md](../ARCHITECTURE.md) e [docs/RESERVAS-SERVER-TO-SERVER.md](../RESERVAS-SERVER-TO-SERVER.md).

**Não commitado nesta entrada** — mudança entregue para revisão antes do commit (ver instrução da tarefa).

## 2026-08-28 — Deploy automático confirmado: fix de XSS ativo em produção

Commit `9594cec` (fix de XSS no JSON-LD + documentação) foi pushado em `main` e apareceu como Production Deployment `READY` no dashboard da Vercel sem nenhum `vercel --prod` manual — confirmado que a integração GitHub → Vercel do ToursFlow faz deploy automático a cada push em `main`. Isso corrige uma suposição incorreta registrada antes em `docs/DEPLOYMENT.md` (de que o deploy seria sempre manual); a suposição nunca tinha sido verificada contra a configuração real da conta Vercel.

Smoke test HTTP real contra produção (sem dado malicioso, sem tentativa de exploração): `https://toursflow.com.br/` (200), `/passeios` (200), `https://toursflow.vercel.app/` (200), e a página real de integração `/passeios/buzios/teste-integracao-toursflow-90f2bc` (200) — `BookingSelector` presente ("Continuar reserva" renderizado), 2 saídas reais carregadas (R$150,00 e R$180,00), JSON-LD (`TouristTrip`) presente e válido. Nenhuma reserva ou pagamento criado.

Documentado em [docs/DEPLOYMENT.md](../DEPLOYMENT.md) (seção reescrita sobre auto-deploy + histórico de deploys confirmados) e [docs/SECURITY.md](../SECURITY.md) (seção 8 marcada como ativa em produção).

## 2026-08-28 — Auditoria de segurança: correção de XSS armazenado no JSON-LD

Auditoria de segurança revisou segredos (`TOURSFLOW_API_SECRET` e seu isolamento via `server-only`), whitelist do payload de reserva, rate limit por HMAC (`X-ToursFlow-Client-Key`), idempotência, proteção de origem, configuração de imagens e uso de `dangerouslySetInnerHTML` no projeto.

Encontrado e corrigido: `src/app/passeios/[destino]/[slug]/page.tsx` embutia o JSON-LD (`TouristTrip`) com `JSON.stringify(structuredData)` sem escapar `</script>`. Os campos usados (`tour.name`, `tour.summary`, nome do operador, nomes de categoria) vêm do catálogo do NauticFlow — dado que o ToursFlow não controla na origem. Um valor de catálogo contendo a substring `</script>` fecharia a tag prematuramente e injetaria HTML/script arbitrário na página: XSS armazenado. Corrigido escapando todo caractere de abre-tag do JSON antes de embutir (`.replace(/</g, '\\u003c')`, mitigação padrão para este padrão exato). `npm run typecheck`, `lint`, `test` (86 testes) e `build` verificados depois da correção, todos verdes.

Documentado em [docs/SECURITY.md](../SECURITY.md) (nova seção 8 + "Achados desta auditoria").

## 2026-08-28 — Regra permanente de documentação obrigatória + atualização geral da documentação

A partir de agora, toda entrega neste projeto (feature, bug, segurança, arquitetura, contrato, integração, env var, decisão de produto, limitação conhecida, deploy) precisa vir com a documentação correspondente atualizada — tarefa com código alterado e documentação desatualizada não é considerada concluída.

Auditoria da documentação existente encontrou `docs/ARCHITECTURE.md` e `README.md` desatualizados desde 2026-08-25 (fase pré-integração): ainda descreviam o projeto como rodando "inteiramente sobre dados mockados", listavam "reserva" como fora do escopo, e a seção "Trocar MOCK por dados reais" descrevia como futuro algo que já estava implementado. Ambos reescritos para refletir o estado real (catálogo real via NauticFlow, backend de reserva existente mas não conectado à UI, rate limit por visitante, `BookingSelector`).

Documentos novos criados (conteúdo real, nada especulativo — futuro marcado como PLANEJADO/NÃO IMPLEMENTADO):
- [docs/PRICE-TYPES.md](../PRICE-TYPES.md) — contrato de price types extraído para arquivo próprio (antes duplicado dentro de `RESERVAS-SERVER-TO-SERVER.md`, que agora só referencia).
- [docs/SECURITY.md](../SECURITY.md) — consolida a postura de segurança já implementada (segredos, rate limit por HMAC, whitelist de payload, idempotência, proteção de origem, imagens, limitações conhecidas).
- [docs/ENVIRONMENT.md](../ENVIRONMENT.md) — tabela completa das 3 variáveis de ambiente do projeto.
- [docs/DEPLOYMENT.md](../DEPLOYMENT.md) — onde/como o deploy acontece, checklist pré-deploy.
- [docs/DECISIONS.md](../DECISIONS.md) — 6 ADRs retroativos das decisões de arquitetura já tomadas (fonte de dados por env var, cache dividido, rota dinâmica, HMAC do rate limit, whitelist do payload, tipos de reserva separados dos de catálogo).

`BOOKING.md`/`INTEGRATION-NAUTICFLOW.md` deliberadamente **não** criados como arquivos separados — o conteúdo já está consolidado em `RESERVAS-SERVER-TO-SERVER.md`/`PLANO-INTEGRACAO-NAUTICFLOW.md`; criar duplicata violaria a própria regra de não criar arquivo redundante.

## 2026-08-28 — Fase 1 do fluxo de reserva: seleção real + contrato de price types fechado

Substituído `DeparturesList` (só exibia saídas) por `BookingSelector` (`src/components/tours/BookingSelector.tsx`): seleção de saída → quantidade de pessoas (stepper acessível, sem teto inventado) → preço/total estimado → "Continuar reserva". O clique em "Continuar" só avança para um placeholder de "Dados do comprador" — **nenhuma chamada a `/api/bookings` nesta fase**. Lógica pura extraída para `src/lib/booking-selection.ts` (testável sem DOM).

Duas correções de honestidade de regra de negócio, feitas antes de fechar a fase:
- **Removido o limite fictício de `quantity <= 50`** (existia em `booking-validation.ts` desde a fase anterior e foi copiado sem verificar para a UI nova) — não há teto oficial no contrato do NauticFlow; só `quantity >= 1` inteiro é uma regra real.
- **Contrato de price types alinhado ao real, confirmado por quem opera o NauticFlow**: `per_person`/`per_group` são vendáveis (`per_group` com preço fixo, quantidade não multiplica — antes era suposição, agora confirmado); `starting_from` (`a_partir_de`, catálogo) e `per_boat` (sem equivalente no NauticFlow hoje) são bloqueados na UI antes de chegar em "Continuar" — nunca calculam total, nunca chamam o backend. `mapPriceType()` em `nauticflow-source.ts` também passou a tratar `price_type` desconhecido como não vendável por padrão (antes caía em "por pessoa", o lado errado para errar).

Primeiro uso de teste de componente React no projeto: `@testing-library/react` + `jsdom` instalados, ambiente configurado por arquivo (`// @vitest-environment jsdom`) sem afetar os testes de lógica pura existentes. 86 testes no total.

Documentado em [docs/RESERVAS-SERVER-TO-SERVER.md](../RESERVAS-SERVER-TO-SERVER.md) (nova seção "Contrato de price types").

## 2026-08-27 — Rate limit por visitante (X-ToursFlow-Client-Key)

Implementada a identidade pseudônima do visitante exigida pelo rate limit do NauticFlow: `src/lib/client-ip.ts` (IP confiável — `x-vercel-forwarded-for` em produção Vercel, fallback controlado para `x-forwarded-for` fora dela, falha fechada com `CLIENT_IP_UNAVAILABLE` se nenhum IP confiável existir) e `src/lib/toursflow-client-key.ts` (HMAC-SHA256 do IP com o mesmo `TOURSFLOW_API_SECRET`, domain-separated com `rate-limit:v1:`). `nauticflow-bookings.ts` passou a enviar `X-ToursFlow-Client-Key` no header; a rota nunca lê esse header vindo do navegador — sempre recalcula. Novo código de erro `CLIENT_IP_UNAVAILABLE`. +26 testes (client-ip, toursflow-client-key, e casos novos na rota), total 57.

Antes desta mudança, validado em E2E real contra produção (dados de teste isolados, removidos ao final): criação (201), replay idempotente (200 + `Idempotency-Replayed: true`), conflito de idempotência (409), `soldOut` refletido no catálogo após o hold.

**O NauticFlow só tem a validação de `X-ToursFlow-Client-Key` no ambiente local dele** — não deployado nos dois lados ainda, então o E2E desta parte específica está pendente. Interface pública continua não conectada.

## 2026-08-27 — Camada server-side de reservas (ToursFlow → NauticFlow)

Implementada a integração server-to-server que inicia uma reserva no NauticFlow: `POST /api/bookings` (novo, `src/app/api/bookings/route.ts`), cliente dedicado `server-only` (`src/lib/nauticflow-bookings.ts`), validação com whitelist explícita (`src/lib/booking-validation.ts`), erro tipado preservando os 12 códigos do NauticFlow (`src/lib/booking-errors.ts`), tipos próprios (`src/types/booking.ts`). Novo `TOURSFLOW_API_SECRET` documentado em `.env.example`, nunca exposto ao cliente.

Instalado `vitest` (nenhum framework de teste existia antes) e escritos 31 testes cobrindo validação, whitelist, preservação de erro/status do NauticFlow, ausência de fallback mock em falha de rede/timeout, e ausência do segredo em qualquer resposta.

**A interface pública não foi conectada** — nenhum botão chama `/api/bookings` ainda; a seleção de saída em `DeparturesList` continua só visual. Teste E2E real contra produção bloqueado por não haver `TOURSFLOW_API_SECRET` configurado (próximo passo, fora desta etapa).

Detalhes: [docs/RESERVAS-SERVER-TO-SERVER.md](../RESERVAS-SERVER-TO-SERVER.md).

## 2026-08-26 — Plano de execução da integração com o NauticFlow

Transformada a análise da auditoria em plano de arquitetura completo para a integração futura: fonte de verdade por etapa, modelo conceitual de `Departure` (saída), regras de preço/disponibilidade, estratégia de cache dividida (conteúdo vs. disponibilidade), contrato de erro, segurança de leitura (view pública + RLS), fotos, dados públicos/privados do operador, SEO de URLs estáveis, performance em escala, fluxo futuro de compra, estratégia de degradação se o NauticFlow ficar offline, proteções contra overbooking/duplicidade, e plano em 10 fases (0 a 10).

Resultado: [docs/PLANO-INTEGRACAO-NAUTICFLOW.md](../PLANO-INTEGRACAO-NAUTICFLOW.md). Só planejamento — nenhum código escrito, nenhum arquivo de app alterado, nenhuma conexão com Supabase feita. Aguardando aprovação antes de iniciar a Fase 0.

## 2026-08-25 — CEP no local de embarque e logo/descrição do operador

Implementados os dois primeiros itens aprovados da auditoria pré-integração (seções 5.9 e 5.10).

- `src/types/index.ts`: `BoardingPoint` ganhou `zipCode?: string`; `Operator` ganhou `logoUrl?: string` e `description?: string`.
- `src/data/mock/tours.mock.ts`: CEP adicionado aos 10 pontos de embarque do mock (um por passeio), com valores plausíveis por cidade.
- `src/data/mock/operators.mock.ts`: `logoUrl` e `description` preenchidos para os 6 operadores mockados.
- `scripts/generate-placeholders.mjs`: novo gerador de logo (badge quadrado com iniciais), agora também gera `public/img/mock/operators/*.svg`.
- `src/lib/maps.ts`: `fullAddress()` passou a incluir o CEP quando existe; `boardingMapUrl()` passou a incluir o CEP na busca de endereço (melhora o fallback do mapa quando não há latitude/longitude).
- `src/components/tours/TourCard.tsx`: avatar do operador (16px) ao lado do nome, nos cards de listagem.
- `src/app/passeios/[destino]/[slug]/page.tsx`: avatar do operador no resumo lateral de preço; nova seção **"Sobre o operador"** (logo, nome, badge verificado, cidade/estado, ano de operação, descrição), logo após a política de cancelamento.

Verificado: `npm run typecheck` e `npm run lint` sem erros; navegação real via Playwright na listagem e na página do passeio, sem erro de console, CEP e logo renderizando corretamente.

Não alterado nesta entrada (fora de escopo, itens da auditoria ainda pendentes de decisão): upgrade do Next.js, estratégia de cache/ISR, tipo de "Saída", páginas legais, contraste do botão primário, CTA fixo no mobile, página de operador dedicada.

## 2026-08-25 — Auditoria completa pré-integração com o NauticFlow

Análise completa do projeto (todas as rotas, componentes, camada de dados, SEO, segurança, acessibilidade, performance, mobile, escalabilidade) para levantar o que precisa ser resolvido antes de conectar o ToursFlow ao NauticFlow. Nenhum código alterado nesta etapa — só diagnóstico.

Resultado: [docs/AUDITORIA-PRE-INTEGRACAO.md](../AUDITORIA-PRE-INTEGRACAO.md), com 4 problemas críticos (CVE crítico no Next.js 14.2.5, ausência de estratégia de cache/ISR, ausência do conceito de "Saída"/horário no modelo de dados, ausência de páginas legais), problemas importantes (contraste do botão primário, CTA não fixo no mobile, ausência de página de operador, etc.) e checklist priorizado.

## 2026-08-25 — Documentação técnica da arquitetura

Criada a documentação técnica de como o projeto funciona hoje: stack, rotas do App Router, camada de dados (contrato → repositório → mock, e como trocar por dados reais), tipos de domínio, mapa de componentes, regras de conteúdo já aplicadas em código, SEO e design tokens.

Resultado: [docs/ARCHITECTURE.md](../ARCHITECTURE.md), com link a partir do `README.md`.

## 2026-08-25 — Setup e verificação do site local

Projeto ainda não tinha `node_modules` instalado. Rodado `npm install`, `npm run typecheck` (sem erros) e o servidor de desenvolvimento (`npm run dev`), com verificação real no navegador via Playwright: home, `/passeios`, `/destinos` e uma página de passeio, todas HTTP 200 e sem erro de console.

`npm audit` na primeira instalação já acusava as vulnerabilidades do Next.js registradas depois na auditoria (entrada acima).
