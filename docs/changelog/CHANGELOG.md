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
