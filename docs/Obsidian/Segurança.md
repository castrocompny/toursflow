# Segurança

Resumo da postura de segurança atual, a partir de `docs/SECURITY.md`
(587 linhas, 17 seções) e `docs/AUDITORIA-SEGURANCA-FASE1.md`.

## Nota de staleness (não é uma divergência de fato, só de data)

`docs/SECURITY.md` cita "312/313 testes passando" com validação datada de
16/09/2026 e baseline no commit `a11424a`. O changelog mais recente
(22/09/2026) já registra 470 testes em 39 arquivos, depois de trabalho
adicional (fluxo de reserva/pagamento, voucher, WhatsApp, responsividade
do seletor de data). **Isso é crescimento esperado ao longo do tempo, não
uma contradição** — `SECURITY.md` é um retrato de um ponto no tempo
(04/09 a 16/09/2026), não desatualizado no sentido de estar errado, só
desatualizado no sentido de não incluir trabalho posterior. Vale
atualizar a contagem de testes em `SECURITY.md` na próxima revisão de
segurança, mas isso está fora do escopo desta tarefa (só documentação em
`docs/Obsidian/`).

## Pontos centrais confirmados

- **Secrets só no servidor**: `import 'server-only'` onde aplicável.
- **Identidade de rate limit por HMAC**: ver [[Reservas e Pagamentos (Pix)]].
- **Whitelist de payload de reserva** (ADR-005): nunca repassa campos
  arbitrários do cliente.
- **Idempotência**: lifecycle documentado, ver [[Reservas e Pagamentos (Pix)]].
- **Proteção de origem**: `Sec-Fetch-Site` + allowlist de Origin/Host —
  best-effort, explicitamente **não** um CSRF completo.
- **Mensagens de erro nunca vazam detalhe interno** — corrigido um
  vazamento upstream classificado MEDIUM-1 na auditoria.
- **`remotePatterns` de imagem restrito** ao host exato do Supabase
  Storage do NauticFlow + CSP para SVG.
- **JSON-LD sanitizado contra XSS**: `toSafeJsonLdScript`, escapa `<`
  para `<`.
- **Content-Type / tamanho de corpo**: limite real de 10KB, contado em
  bytes de verdade (não estimado).
- **Headers de segurança de resposta**: `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` —
  deliberadamente **sem CSP ainda** (limitação conhecida e aceita, não
  um esquecimento).
- **PII**: nunca persistido/logado no navegador; mascarado na revisão da
  reserva; normalizado antes de enviar.
- **Guarda de duplo-submit**: `useRef` + botão desabilitado, testado com
  3 cliques rápidos = 1 chamada só.
- **Postura de dependências**: Next 15.5.24 resolveu as 33 advisories do
  Next 14; só resta `postcss` transitivo, classificado como não
  explorável.
- **Rotas de reserva e pagamento falham fechadas** independente da UI —
  ver [[Feature Flags]], a lição central de ADR-012/ADR-013.

## Linha do tempo de auditoria (`docs/AUDITORIA-SEGURANCA-FASE1.md`, 04/09/2026)

- **Fase 1** (achados): 5 findings (MEDIUM-1, MEDIUM-2, MEDIUM-3, LOW-1,
  LOW-2).
- **Fase 2** (correções, mesmo dia): todos os 5 corrigidos.
- **Fase 3** (mesmo dia, deploy em 07/09/2026): upgrade Next.js 14 → 15.5.24
  (essa é a própria correção do LOW-2).
- **Fase 4** (upgrade para Next.js 16): **pendente formal**, ainda não
  feita.

## `docs/AUDITORIA-PRE-INTEGRACAO.md` (25/08/2026) — tratar como histórico

Esta auditoria é anterior à integração real com o NauticFlow e a maior
parte dos seus achados críticos já foi resolvida desde então (Next.js
atualizado além do recomendado, estratégia de cache decidida via
ADR-002/ADR-014, XSS de JSON-LD corrigido, headers de segurança
adicionados, tipos de preço confirmados, integração real de
reserva/pagamento construída). Alguns itens seguem **NÃO CONFIRMADOS**
como resolvidos ou não nesta rodada — notavelmente páginas legais
(Termos/Privacidade, confirmado ausentes hoje, ver
[[Estado Atual do Produto]]) e a página `/operadores/[slug]`
(confirmado ausente hoje, era classificado como 🟠 importante mas não
obrigatório). Não usar este documento como retrato do estado atual sem
cruzar com o código — é um retrato do estado de 25/08/2026.

## Limitações conhecidas, aceitas e não resolvidas (citadas de `SECURITY.md`)

- Ausência de CSP completa (só os headers pontuais listados acima).
- Proteção de origem é best-effort, não CSRF completo.
- Fase 4 (Next.js 16) pendente.

Ver [[Decisões Arquiteturais (ADRs)]] para o racional completo por trás
de cada decisão de segurança citada aqui.
