# Notas da Auditoria Documental

## Escopo da tarefa

Tarefa exclusivamente de análise e documentação: transformar
`docs/Obsidian/` em uma memória técnica real, organizada e confiável do
ToursFlow. Nenhum código, comportamento de aplicação, backend,
NauticFlow, banco de dados, Supabase, migração, Vercel, env ou
infraestrutura foi alterado. Nenhum commit, push ou deploy foi feito.
Apenas arquivos Markdown dentro de `docs/Obsidian/` foram criados ou
modificados nesta tarefa.

## Correção registrada em 24/09/2026: seção 7 não estava truncada

Uma versão anterior desta nota afirmava que a seção 7 da instrução
original ("FEATURE FLAGS — MUITO IMPORTANTE") teria sido cortada ao ser
colada na conversa e nunca reenviada. **Isso estava incorreto** — o
usuário confirmou que a seção 7 original estava completa desde o início,
e reenviou o texto exato para conferência. A afirmação de truncamento foi
removida desta nota e de [[Feature Flags]]. O conteúdo de
[[Feature Flags]] foi revisado nesta correção para seguir explicitamente
os pontos exigidos pela seção 7 real: função de cada flag, onde atua,
proteção de UI, proteção server-side, consequência de ativação, e a
distinção entre código preparado e funcionalidade habilitada — sem
inferir o estado do NauticFlow em produção a partir do ToursFlow (marcado
**NÃO CONFIRMADO EM PRODUÇÃO** onde aplicável).

## Hierarquia de confiança aplicada

Para "o que está implementado hoje": código atual → configs atuais →
testes atuais → documentação atual → histórico/changelog. Para "por que
uma decisão foi tomada": ADRs, docs históricos, changelog. Sempre que
possível, afirmações de "estado atual" nas notas deste cofre foram
verificadas por leitura direta do código (ex.: valores exatos das duas
feature flags, montagem de `CatalogRefresh` em `layout.tsx`, ausência de
rotas legais/operador), não só inferidas da documentação.

## O que foi lido nesta rodada

Documentação: `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/PAYMENTS.md`,
`docs/PLANO-INTEGRACAO-NAUTICFLOW.md`, `docs/PRICE-TYPES.md`,
`docs/RESERVAS-SERVER-TO-SERVER.md`, `docs/AUDITORIA-PRE-INTEGRACAO.md`,
`docs/AUDITORIA-SEGURANCA-FASE1.md`, `docs/DEPLOYMENT.md`,
`docs/ENVIRONMENT.md`, os primeiros ~150 de 849 linhas de
`docs/changelog/CHANGELOG.md`, e o `docs/Obsidian/Bem-vindo.md` original
(nota padrão do Obsidian, agora substituída).

Código: `package.json`, `src/lib/feature-flags.ts` (leitura completa,
duas vezes, para confirmar os valores exatos das flags), `src/types/index.ts`
(início), `src/app/layout.tsx` (montagem do `CatalogRefresh`), inventário
completo de diretórios de `src/app`, `src/components`, `src/lib`,
`src/data`, `src/types`, e checagem direcionada de rotas legais/operador
e de arquivos `loading.tsx`/`error.tsx`/`not-found.tsx`/`sitemap.ts`/`robots.ts`.

## O que ficou fora do escopo desta rodada (não confundir com "verificado e ok")

- As ~700 linhas restantes de `docs/changelog/CHANGELOG.md` (entradas
  mais antigas) não foram lidas linha a linha nesta rodada. Boa parte do
  racional que elas conteriam já está capturado via `docs/DECISIONS.md`
  e os docs por tópico, então o valor marginal é menor, mas não é zero.
- Verificação campo a campo do plano de integração original
  (`docs/PLANO-INTEGRACAO-NAUTICFLOW.md`) contra o código atual — foi
  feito um cruzamento no nível de "a peça existe e tem uma ADR/doc
  própria", não uma comparação exaustiva seção por seção.
- Configuração real de variáveis de ambiente na Vercel Produção — não
  verificável a partir desta sessão local; marcado **NÃO CONFIRMADO**
  onde relevante (`NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL`/`_ANON_KEY`).
- Contagem real de testes passando na branch atual — não foi executada
  a suite de testes nesta rodada; a nota [[Segurança]] cita a última
  contagem documentada (470 testes / 39 arquivos, 22/09/2026) com uma
  ressalva explícita de que é um retrato datado, não uma execução nova.

## Divergências encontradas

Nenhuma divergência factual entre documentação e código foi encontrada
nos pontos verificados diretamente nesta rodada (ver lista em
[[Estado Atual do Produto]], seção final). A única discrepância notada é
de **data, não de fato**: `docs/SECURITY.md` cita uma contagem de testes
mais antiga que o changelog mais recente — tratado como staleness
esperada, não como erro (ver [[Segurança]]).

## Sobre `docs/Obsidian/Bem-vindo.md`

O arquivo original era a nota de boas-vindas padrão do Obsidian
("Este é o seu novo Cofre..."), sem conteúdo real do projeto. Foi
reescrito como o índice/porta de entrada deste cofre, em vez de deixado
ao lado do conteúdo novo, para evitar duas portas de entrada conflitantes
no mesmo cofre.
