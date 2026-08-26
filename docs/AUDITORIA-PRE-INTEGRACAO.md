# Auditoria completa do ToursFlow — antes da integração com o NauticFlow

Data: 2026-08-25
Escopo: código-fonte completo do repositório `toursflow` no estado atual (mock data, sem integração, sem pagamento, sem reservas).
Método: leitura direta de todas as rotas (`src/app`), todos os componentes (`src/components`), toda a camada de dados (`src/data`), todas as libs (`src/lib`), tipos (`src/types`), configuração (`next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `.eslintrc.json`) e `npm audit` real das dependências instaladas.

**Este documento é só diagnóstico.** Nenhuma alteração de código foi feita nesta etapa. Nada aqui foi implementado — é a base para decidirmos juntos o que corrigir antes da integração.

---

## 1. Resumo executivo

O ToursFlow está em um estado **estruturalmente muito bom** para um projeto pré-integração: a separação entre UI e dados é real (não só documentada), os tipos são consistentes, o SEO técnico já está à frente da maioria dos MVPs, e o código segue um padrão de qualidade uniforme em todo o projeto — não há partes "improvisadas" ou incompletas por descuido.

Os problemas encontrados não são de "código malfeito". São, em sua maioria, **decisões que ainda não foram tomadas** e que ficam mais caras de tomar depois que a integração começar:

- Como o site vai lidar com dados vindos de rede (cache/revalidação) em vez de memória.
- Como representar **saídas** (horários) de um passeio, hoje inexistente no modelo de dados — e que é pré-requisito de qualquer fluxo de compra.
- Um vulnerabilidade **crítica** de segurança na versão exata do Next.js usada (não é código do projeto, é a dependência).
- Ausência total de páginas legais (Termos, Privacidade), que se torna obrigatória assim que o site passar a coletar dado pessoal (login, reserva).
- Duas lacunas de UX mobile relevantes (CTA de preço não fica visível ao rolar a página, e a galeria de fotos não abre em tela cheia) — relevantes porque o público é majoritariamente mobile.

Nada disso bloqueia começar a *planejar* a integração. Mas a recomendação central deste relatório é: **decidir a modelagem de "saída" e a estratégia de cache/ISR antes de escrever `nauticflow-source.ts`**, porque são as duas coisas que, se decididas tarde, forçam retrabalho em várias camadas ao mesmo tempo (tipos, mock, contrato, páginas, componentes).

---

## 2. O que está muito bom

🟢 **Camada de dados genuinamente desacoplada.** Nenhum componente importa `mock-source.ts` ou os arquivos de `src/data/mock/` diretamente — tudo passa por `ToursDataSource` (`src/data/source.ts`) e pelo `repository.ts`. Trocar por `nauticflow-source.ts` é, de fato, trocar uma linha, como o README promete.

🟢 **Todas as funções do repositório já são assíncronas**, mesmo operando em memória. Isso é o que torna a troca por chamadas de rede transparente para a UI.

🟢 **Tipagem forte e `strict: true`** no TypeScript, sem `any` nos arquivos lidos, com contratos de domínio (`src/types/index.ts`) bem desenhados — inclusive já modelando corretamente campos opcionais que dependem do operador (`rating`, `latitude/longitude`, `maxPeople`).

🟢 **Honestidade de produto já implementada em código**, não só em intenção: nota nunca é inventada (`Rating` retorna `null` sem avaliação), filtro de data avisa que não filtra em vez de fingir que filtra, mapa cai para busca por endereço quando não há coordenadas.

🟢 **SEO técnico consistente e centralizado**: `pageMetadata()` único, canonical correto em todas as páginas, `noindex` correto nas páginas de filtro, sitemap e robots gerados a partir dos dados reais (não de lista hardcoded), JSON-LD `TouristTrip` com `aggregateRating` condicional.

🟢 **Separação Server/Client Component correta.** Só três componentes são `'use client'` (`SearchBar`, `FilterBar`, `TourGallery`) e todos têm motivo real (interatividade). O resto é Server Component, o que mantém o JS enviado ao navegador pequeno.

🟢 **Acessibilidade de base bem cuidada**: skip link, `:focus-visible` visível, `aria-hidden` correto em ícones decorativos, alt text descritivo em todas as imagens do mock, `prefers-reduced-motion` respeitado, um único `<h1>` por página com hierarquia de headings coerente.

🟢 **Design system consistente** via `tailwind.config.ts` (cores, radius, sombra, largura de shell), sem inline styles soltos nem valores mágicos espalhados pelos componentes.

🟢 **Configuração de imagens já pensando em segurança**: `remotePatterns: []` (nenhum host externo liberado por padrão) e a combinação `dangerouslyAllowSVG: true` + `contentDispositionType: 'attachment'`, que é exatamente a mitigação recomendada pelo próprio Next.js para servir SVG sem abrir brecha de XSS armazenado.

🟢 **Sem segredos no repositório.** `.env.example` só expõe uma URL pública. Não há chave, token ou string de conexão em lugar nenhum do código.

---

## 3. O que precisa melhorar antes da integração

Lista consolidada — detalhamento de cada item nas seções 4, 5 e 6, e aprofundamento temático nas seções 7 a 16.

| # | Item | Prioridade |
|---|---|---|
| 1 | Vulnerabilidade crítica na versão pinada do Next.js (14.2.5) | 🔴 |
| 2 | Nenhuma estratégia de cache/revalidação (ISR) definida para dados vindos de rede | 🔴 |
| 3 | Modelo de dados não representa "Saída" (horário/data/capacidade/preço) | 🔴 |
| 4 | Ausência de páginas legais (Termos, Privacidade) | 🔴 |
| 5 | CTA primário (laranja + texto branco) não passa em contraste WCAG AA | 🟠 |
| 6 | Mobile: preço/CTA não ficam visíveis ao rolar a página do passeio | 🟠 |
| 7 | Página do passeio não tem canal de contato com o operador (etapa 3 do próprio fluxo prometido na home) | 🟠 |
| 8 | Não existe página de operador, embora `Operator.slug` já exista no tipo | 🟠 |
| 9 | Contrato de dados não força consultas indexadas na futura fonte NauticFlow | 🟠 |
| 10 | JSON-LD da página do passeio vulnerável a quebra de tag com conteúdo do operador | 🟠 |
| 11 | `/passeios` sem paginação nem ordenação | 🟠 |
| 12 | Galeria de fotos sem visualização em tela cheia no mobile | 🟠 |
| 13 | `BoardingPoint` sem campo de CEP | 🟠 |
| 14 | `Operator` sem logo/descrição | 🟠 |
| 15 | Fontes carregadas via `<link>` em vez de `next/font` | 🟡 |
| 16 | Sem `loading.tsx`/`error.tsx` em nenhuma rota | 🟡 |
| 17 | Ícones de categoria são emoji cru, inconsistente com o resto do sistema (lucide-react) | 🟡 |
| 18 | Selo "verificado" sem explicação do que significa | 🟡 |
| 19 | Sem monitoramento (analytics, erros, Web Vitals) | 🟡 |
| 20 | Vulnerabilidades de dependências de dev (glob, minimatch) | 🟡 |
| 21 | "A partir de" em preço fixo por embarcação é levemente incoerente | 🟡 |
| 22 | Sem `BreadcrumbList` em JSON-LD (só visual) | 🟡 |

---

## 4. Problemas críticos 🔴

### 4.1 Vulnerabilidade crítica na versão do Next.js

- **Problema:** `package.json` fixa `"next": "14.2.5"` (sem `^`). O `npm audit` real do projeto acusa 1 vulnerabilidade **crítica** e 3 altas na cadeia do Next.js, incluindo cache poisoning, bypass de autorização em Middleware, SSRF via rewrites/Server Actions e DoS em Server Components — todas corrigidas em `next@14.2.35`, uma versão **patch da mesma major**, sem breaking change conhecido.
- **Por que importa:** são CVEs públicos, com exploit conhecido documentado no advisory, em um framework que vai virar a porta de entrada de um marketplace público com tráfego pago (seção 19 do pedido original).
- **Impacto:** exposição a cache poisoning e bypass de autorização não depende de nenhum código escrito pelo time — é uma falha no próprio Next.js instalado.
- **Recomendação:** atualizar para `next@14.2.35` (ou mais recente da 14.x) e trocar o pin exato por `^14.2.5` no `package.json`, para não repetir esse problema a cada novo CVE de patch. Rodar `npm audit` de novo depois.
- **Prioridade:** 🔴 Crítico — não depende da integração, deveria ser corrigido independentemente dela.

### 4.2 Nenhuma estratégia de cache/revalidação definida

- **Problema:** Hoje `listTours`, `getTour`, etc. leem um array em memória — são instantâneos e determinísticos, então o Next.js consegue gerar tudo estático em build (`generateStaticParams` em `/passeios/[destino]/[slug]` e `/destinos/[slug]`) sem nenhuma configuração extra de cache. Quando `nauticflow-source.ts` fizer chamadas de rede reais ao Supabase, esse comportamento muda de forma que **nenhum código hoje decide**: sem `revalidate` explícito, o Next.js pode servir dados desatualizados indefinidamente (com SSG) ou refazer a build inteira a cada publicação de passeio.
- **Por que importa:** um preço ou disponibilidade errados publicados por engano — mesmo que só por causa de cache desatualizado — é o tipo de erro que gera reclamação de cliente e prejuízo direto ao operador.
- **Impacto:** sem decisão explícita, a primeira versão integrada terá comportamento de cache **acidental**, não escolhido.
- **Recomendação:** decidir, antes de escrever `nauticflow-source.ts`, entre (a) ISR com `revalidate` curto por página, (b) revalidação sob demanda (`revalidateTag`/`revalidatePath`) disparada pelo próprio NauticFlow quando o operador publica/edita um passeio, ou (c) renderização dinâmica pura nas páginas mais sensíveis a preço (a página do passeio). A opção (b) é a mais alinhada ao modelo "NauticFlow é a fonte oficial".
- **Prioridade:** 🔴 Crítico — é uma decisão de arquitetura, não um detalhe de implementação; decidir depois força reescrever páginas já publicadas.

### 4.3 Modelo de dados não representa "Saída" (horário do passeio)

- **Problema:** `Tour` (em `src/types/index.ts`) tem exatamente um `durationMinutes`, um `priceFrom` e um `maxPeople` — ou seja, o modelo assume implicitamente que um passeio tem **uma** capacidade e **um** preço. Mas o próprio README do projeto descreve o NauticFlow como o sistema que gerencia "embarcações, **saídas** e reservas" — ou seja, a fonte de dados oficial já vai te entregar passeios com múltiplos horários, cada um com sua própria disponibilidade e (potencialmente) seu próprio preço.
- **Por que importa:** é o gap estrutural mais caro de descobrir tarde. Ele toca: `types/index.ts`, `src/data/mock/*`, o contrato `ToursDataSource`, o componente `Price`, a página do passeio (o bloco de preço/CTA lateral inteiro pressupõe um preço único), `SearchBar`/`FilterBar` (o filtro de data não tem o que filtrar), e é pré-requisito direto do fluxo de compra (seção 15).
- **Impacto:** se a integração começar sem esse tipo definido, a primeira versão integrada vai "achatar" saídas em um preço único (perdendo informação real do NauticFlow) e alguém vai precisar redesenhar a página do passeio de novo assim que o checkout entrar em pauta.
- **Recomendação:** definir agora — mesmo sem implementar — o formato de um tipo `Departure`/`Saida` (data, horário, capacidade, vagas disponíveis, preço da saída) e decidir como ele se relaciona com `Tour` (um passeio tem N saídas). Não precisa aparecer na UI ainda, mas precisa existir no vocabulário do time antes do mapeamento com o NauticFlow começar.
- **Prioridade:** 🔴 Crítico — é a peça que mais páginas e componentes tocam quando chegar.

### 4.4 Ausência de páginas legais (Termos de Uso, Política de Privacidade)

- **Problema:** Não existe nenhuma rota `/termos`, `/privacidade` ou equivalente, nem link para elas no `Footer`. O site hoje não coleta dado pessoal (busca e filtros só navegam por querystring), então não há exposição legal imediata — mas login, reserva e checkout (próximas fases, fora de escopo aqui) vão coletar CPF, e-mail, telefone e dado de pagamento.
- **Por que importa:** sob a LGPD, um serviço que trata dado pessoal precisa informar a base legal e a política de tratamento **antes** de coletar o dado, não depois.
- **Impacto:** não bloqueia a integração de catálogo em si, mas bloqueia (ou expõe legalmente) qualquer lançamento real que inclua login/reserva sem essas páginas prontas.
- **Recomendação:** não precisa ser feito nesta etapa, mas deveria entrar na lista de pré-requisitos da fase de reservas/pagamento, junto com a definição de quem (ToursFlow ou operador) é o controlador dos dados do turista perante a LGPD.
- **Prioridade:** 🔴 Crítico **para a fase de reservas**, não bloqueante para a integração de catálogo em si — incluído aqui para não ser esquecido.

---

## 5. Problemas importantes 🟠

### 5.1 Contraste do botão primário não passa em WCAG AA

- **Problema:** `.btn-primary` (classe usada em quase todos os CTAs do site: "Buscar passeios", "Ver no mapa", CTAs de estado vazio, CTA da home) é `bg-sun` (`#FF6A2B`) com `text-white`. A razão de contraste calculada entre branco e `#FF6A2B` é **≈2,86:1**. O WCAG 2.1 AA exige 4.5:1 para texto normal e 3:1 para texto grande/negrito — este botão fica abaixo dos dois limiares.
- **Por que importa:** é o botão mais repetido do site e o texto sobre ele é literalmente ilegível para uma parte real de usuários com baixa visão, não é uma questão teórica de auditoria.
- **Impacto:** risco de acessibilidade concreto em elementos de conversão (o próprio botão de busca e o de "ver no mapa" do embarque).
- **Recomendação:** escurecer o laranja usado atrás de texto branco (ex.: usar `sun-dark` — `#E85614` — como cor base do botão, não só do hover) ou usar texto escuro sobre o laranja atual. Validar com uma ferramenta de contraste antes de fechar a cor final.
- **Prioridade:** 🟠 Importante.

### 5.2 Mobile: preço e CTA somem ao rolar a página do passeio

- **Problema:** Em `src/app/passeios/[destino]/[slug]/page.tsx`, o bloco de preço + botão "Ver local de embarque" usa `lg:sticky lg:top-24` — ou seja, só fica fixo na tela em telas grandes. No mobile, esse bloco rola junto com o resto do conteúdo.
- **Por que importa:** o próprio pedido desta auditoria (seção 15) afirma que o ToursFlow será usado majoritariamente no celular. Um usuário lendo o roteiro ou o checklist no mobile perde de vista o preço e o CTA, e precisa rolar de volta.
- **Impacto:** fricção de conversão justamente no momento em que o usuário está mais perto de decidir.
- **Recomendação:** adicionar uma barra inferior fixa (`fixed bottom-0`) no mobile com preço resumido + CTA, no padrão já usado por Booking/Airbnb/GetYourGuide — sem copiar o layout deles, só a lógica de manter a decisão sempre acessível.
- **Prioridade:** 🟠 Importante.

### 5.3 A página do passeio não entrega a etapa 3 do próprio fluxo que promete

- **Problema:** A home descreve o fluxo em 3 passos, e o passo 3 é literalmente "**Fale com o operador**". Mas a página do passeio não expõe nenhum contato do operador (telefone, WhatsApp, e-mail) — só nome e badge de verificado. O único CTA da página ("Ver local de embarque") leva a um endereço, não a um canal de contato.
- **Por que importa:** é uma promessa que a própria home faz ao usuário e que a página de produto não cumpre — o usuário convencido a comprar não tem para onde ir.
- **Impacto:** ponto de abandono no fim do funil, justamente onde o produto deveria estar mais forte.
- **Recomendação:** decidir, antes da integração, se o contato do operador vai aparecer nesta fase (mesmo sem reserva online) ou se isso é conscientemente adiado para quando o NauticFlow entrar. Se for adiado, ajustar a copy da home para não prometer o que a página ainda não entrega.
- **Prioridade:** 🟠 Importante.

### 5.4 Não existe página de operador

- **Problema:** `Operator.slug` já existe no tipo (`src/types/index.ts`), mas não há nenhuma rota `/operadores/[slug]`. O nome do operador aparece como texto simples (não é link) tanto no `TourCard` quanto na página do passeio.
- **Por que importa:** em qualquer marketplace de referência (Airbnb, Booking, GetYourGuide), o perfil de quem vende é parte da decisão de confiança — e aqui não há como o turista saber "quem mais esse operador atende" ou ver os outros passeios dele a partir do próprio operador.
- **Impacto:** perda de sinal de confiança e de uma rota de descoberta natural (hoje só dá pra achar outro passeio do mesmo operador por acaso, via "outros passeios no destino").
- **Recomendação:** decidir se uma página `/operadores/[slug]` simples (nome, descrição, badge, lista de passeios) entra nesta fase ou fica para logo depois da integração — o campo `slug` já sinaliza que a intenção sempre existiu.
- **Prioridade:** 🟠 Importante.

### 5.5 O contrato de dados não impede uma implementação ineficiente do NauticFlow

- **Problema:** `ToursDataSource` (`src/data/source.ts`) define *o quê* cada função retorna, mas não *como*. Nada impede que `nauticflow-source.ts` seja implementado como "buscar todas as linhas da tabela e filtrar em JavaScript" — que é exatamente o que o `mock-source.ts` faz hoje, porque com 10 passeios em memória isso é irrelevante.
- **Por que importa:** replicar essa mesma abordagem contra o Supabase real, com centenas ou milhares de passeios, funciona perfeitamente em desenvolvimento e degrada silenciosamente em produção.
- **Impacto:** risco de performance que só aparece depois que já tem tráfego real — o pior momento para descobrir.
- **Recomendação:** ao escrever `nauticflow-source.ts`, tratar os filtros de `listTours` (destino, categoria, pessoas, busca) como cláusulas de query no Supabase (`.eq()`, `.ilike()`, índices), não como filtro em memória depois de um `select *`. Vale registrar isso como requisito não-funcional do arquivo antes de escrevê-lo.
- **Prioridade:** 🟠 Importante — não é um bug hoje, é uma armadilha de implementação futura.

### 5.6 JSON-LD da página do passeio pode ser quebrado por conteúdo do operador

- **Problema:** Em `src/app/passeios/[destino]/[slug]/page.tsx`, o JSON-LD é injetado com `dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}`. `JSON.stringify` escapa aspas e caracteres de controle, mas **não** escapa a sequência `</script>`. Hoje os dados vêm do mock (controlado pelo dev), então não é explorável — mas assim que `tour.name`/`tour.description`/`operator.name` vierem do NauticFlow (texto digitado por operadores), um valor contendo `</script><script>...` quebraria para fora da tag.
- **Por que importa:** é uma vulnerabilidade de XSS armazenado clássica em implementações de JSON-LD, bem documentada no ecossistema React/Next — só não é explorável **hoje** porque o conteúdo ainda não é controlado por terceiros.
- **Impacto:** baixo agora, alto assim que o conteúdo passar a vir de operadores sem esse tratamento.
- **Recomendação:** escapar `<` antes de serializar (`JSON.stringify(structuredData).replace(/</g, '\\u003c')`) — mudança pequena, mas deveria entrar **junto** com a integração, não depois.
- **Prioridade:** 🟠 Importante — baixo risco agora, mas fácil de esquecer depois que a integração já estiver no ar.

### 5.7 `/passeios` sem paginação nem ordenação

- **Problema:** `listTours()` retorna todo o catálogo filtrado de uma vez, e `TourGrid` renderiza tudo em uma única grade. Não existe controle de ordenação (preço, avaliação, duração) em `FilterBar`.
- **Por que importa:** com 10 passeios no mock isso é invisível. Com dezenas/centenas de operadores publicando, vira uma página gigante, lenta de rolar e sem forma de o usuário priorizar "mais barato" ou "melhor avaliado".
- **Impacto:** UX e performance de listagem se degradam junto com o próprio sucesso da plataforma.
- **Recomendação:** definir a estratégia de paginação (paginação numérica, "carregar mais" ou infinite scroll) e adicionar um controle de ordenação antes ou logo após a integração — não precisa ser nesta etapa, mas precisa estar no roadmap imediato pós-integração.
- **Prioridade:** 🟠 Importante (ligado à seção 16, Escalabilidade).

### 5.8 Galeria de fotos sem visualização em tela cheia no mobile

- **Problema:** `TourGallery` troca a imagem principal ao tocar em uma miniatura, mas a imagem principal nunca abre em tela cheia/lightbox — fica sempre no mesmo frame de tamanho fixo.
- **Por que importa:** a decisão de qual passeio escolher é fortemente visual (é literalmente a segunda coisa avaliada no pedido desta auditoria, seção 10), e o mobile é o dispositivo principal (seção 15). Sem zoom/tela cheia, o turista não consegue examinar detalhes da embarcação ou do local antes de decidir.
- **Impacto:** experiência de decisão mais fraca do que a de qualquer concorrente direto (Booking, GetYourGuide e Airbnb têm esse padrão).
- **Recomendação:** adicionar um lightbox simples (tela cheia, swipe entre fotos, fechar) acionado ao tocar na imagem principal.
- **Prioridade:** 🟠 Importante.

### 5.9 `BoardingPoint` sem campo de CEP

- **Problema:** o tipo `BoardingPoint` (`src/types/index.ts`) tem nome, endereço, bairro, cidade, estado, referência, instruções e coordenadas — mas não tem CEP.
- **Por que importa:** é um dado padrão de endereço brasileiro, útil tanto para exibição quanto para fallback de geocodificação quando não há lat/lng.
- **Impacto:** baixo isoladamente, mas é o tipo de campo que, se faltar no contrato, obriga um ajuste de tipo + mock + UI assim que o NauticFlow (que provavelmente tem CEP cadastrado) começar a alimentar dados reais.
- **Recomendação:** adicionar `zipCode?: string` ao tipo agora, mesmo sem uso imediato na UI — é uma mudança de tipo isolada e barata de fazer cedo.
- **Prioridade:** 🟠 Importante (barato de resolver agora, mais caro de descobrir faltando durante o mapeamento de campos do NauticFlow).

### 5.10 `Operator` sem logo nem descrição

- **Problema:** o tipo `Operator` tem id, nome, slug, cidade, estado, ano de operação e `verified` — não tem campo de logo/imagem nem de descrição/bio.
- **Por que importa:** liga diretamente com 5.4 (não existe página de operador) e com a seção 14 (confiança): hoje é estruturalmente impossível mostrar um logo do operador em lugar nenhum do site, mesmo que se quisesse, porque o tipo não carrega essa informação.
- **Impacto:** limita qualquer melhoria futura de confiança/branding do operador sem antes mexer no tipo.
- **Recomendação:** adicionar `logoUrl?: string` e `description?: string` ao tipo `Operator` (opcionais, como o resto dos campos "quando existir"), preparando o terreno mesmo que a UI que os consome venha depois.
- **Prioridade:** 🟠 Importante.

---

## 6. Melhorias recomendadas 🟡

| Item | Recomendação |
|---|---|
| Fontes via `<link>` | Migrar para `next/font/google` — evita round-trip extra de DNS/TLS e melhora LCP/CLS de forma mensurável, sem mudar a fonte escolhida. |
| Sem `loading.tsx`/`error.tsx` | Adicionar ao menos em `/passeios/[destino]/[slug]` e `/destinos/[slug]` antes da integração, para não deixar o usuário olhando pra uma tela travada quando uma consulta ao NauticFlow demorar ou falhar. |
| Ícones de categoria em emoji | Trocar por ícones `lucide-react` (já é dependência, já é usado em todo o resto do site) para consistência visual entre SOs. |
| Selo "verificado" sem explicação | Adicionar um `title`/tooltip curto explicando o critério de verificação — hoje é um ícone de check sem contexto. |
| Sem monitoramento | Antes de investir em anúncios/tráfego (fora de escopo aqui, mas mencionado no pedido), planejar Web Vitals + rastreamento de erro (algo como Sentry) — hoje não existe nenhum. |
| Vulnerabilidades de devDependencies | `glob`/`minimatch` (via `eslint-config-next`) só afetam tooling de lint, não o app em produção — `npm audit fix` resolve o `minimatch` sem breaking change; o `glob` exige `--force` (major do eslint-config-next), avaliar com calma, não é urgente. |
| "A partir de" em preço fixo | Para `priceType: 'per_boat'` com preço único, considerar remover o prefixo "A partir de" (ele já implica variação que não existe no caso de embarcação privativa com preço fechado). |
| `BreadcrumbList` em JSON-LD | Como o breadcrumb visual já existe e já reflete a hierarquia real da URL, gerar o `BreadcrumbList` JSON-LD é praticamente gratuito e ajuda a exibição do link no Google. |
| Horizontal scroll do `FilterBar` no mobile | Adicionar uma sugestão visual (gradiente na borda) de que há mais filtros fora da tela. |

---

## 7. UX/UI

**Primeira impressão (home, "5 segundos"):** título, subtítulo e busca aparecem no primeiro viewport, sem precisar rolar — a pergunta "em até 5 segundos o turista entende o que é o ToursFlow" tem resposta **sim**: "Encontre seu próximo passeio" + subtítulo + busca de destino/data/pessoas comunica a proposta rápido. Os três selos abaixo da busca (operadores verificados, tipos de embarcação, local de embarque sempre no anúncio) reforçam exatamente os diferenciais que o marketplace quer passar.

**Hierarquia visual da home:** boa progressão — hero → destinos → passeios em destaque → categorias → CTA para operador → "como funciona". A seção "para operadores" no meio do funil do turista é um ponto de atenção: pode ser lida como ruído por quem só quer comprar um passeio (não é um problema grave, mas vale observar taxa de clique real quando houver analytics).

**Excesso de cliques:** o caminho home → resultado → passeio → embarque (âncora, não nova página) é enxuto. Não há fricção de navegação desnecessária.

**CTAs pouco claros:** os CTAs em geral são claros em texto ("Buscar passeios", "Ver local de embarque", "Ver no mapa"). O ponto fraco não é clareza, é **completude** — como descrito em 5.3, falta o CTA de contato com o operador que o próprio site promete.

**Informações repetidas/escondidas:** não foi encontrada duplicação problemática. `SearchBar` e `FilterBar` têm listas de opções (destinos/categorias) mantidas em componentes separados, mas isso é esperado dado que atendem contextos diferentes (hero vs. listagem).

**Navegação:** `Header` só tem 2 links (Passeios, Destinos) + "Sou operador" — simples e direto, sem menu escondido em mobile porque não há itens suficientes para justificar um. Ponto de atenção: se o menu crescer (login, categorias, etc.), vai precisar de um drawer mobile que hoje não existe.

---

## 8. Mobile

O layout é responsivo em todas as páginas verificadas (grids com breakpoints `sm`/`lg` consistentes, `SearchBar` empilha em coluna única no mobile, `FilterBar` vira scroll horizontal de pills). Dois problemas reais, já detalhados nas seções 5.2 e 5.8:

- 🟠 Preço/CTA da página do passeio não ficam fixos ao rolar no mobile (só em `lg:`).
- 🟠 Galeria de fotos sem tela cheia/zoom no mobile.

Pontos positivos específicos de mobile:
- 🟢 Inputs usam o tipo certo (`type="number"` para pessoas, `type="date"` para data) — teclado nativo correto em cada campo.
- 🟢 Alvos de toque (`px-6 py-3` em botões, ≈48px de altura) são adequados.
- 🟢 A galeria ajusta proporção por breakpoint (`aspect-[16/10] sm:aspect-[16/9]`), pensando explicitamente na diferença de formato entre celular e desktop.

---

## 9. SEO

Tecnicamente, esta é a área mais madura do projeto — já documentado em `docs/ARCHITECTURE.md`, seção 11. Reforçando com foco nas buscas-alvo citadas no pedido ("passeios em búzios", "passeio de lancha em búzios", etc.):

- 🟢 Title da página de destino: `Passeios de barco em {name}` — combina quase literalmente com "passeios em búzios" / "passeios em arraial do cabo".
- 🟢 Title da página do passeio: `{nome do passeio} em {destino}` — como os nomes dos passeios no mock já incluem o tipo de embarcação ("Escuna Roteiro Clássico de Búzios", "Passeio de Lancha pelas Ilhas"), o title casa bem com buscas como "passeio de lancha em búzios".
- 🟢 `/passeios?...` corretamente fora do índice (`noindex, follow`), evitando canibalização com `/destinos/[slug]`.
- 🟢 Sitemap/robots gerados a partir da própria camada de dados — nunca ficam desatualizados manualmente.
- 🟡 Falta `BreadcrumbList` em JSON-LD (só existe visual) — ver seção 6.
- 🟡 Sem verificação de propriedade (Search Console) ainda — natural, porque o domínio de produção ainda não está no ar publicamente com este conteúdo.
- **Atenção para a integração:** o texto de `description`/`summary` de cada passeio hoje é escrito à mão no mock, pensando em SEO. Quando vier do operador via NauticFlow, não há garantia de que o operador escreva um resumo otimizado — vale considerar, na integração, um fallback/gerador de meta description quando o campo do operador for muito curto ou vazio.

---

## 10. Performance

- 🟢 Server Components por padrão, `'use client'` restrito a 3 componentes realmente interativos — o HTML enviado já vem praticamente pronto, com JS mínimo no cliente.
- 🟢 `sizes` de `<Image>` configurado com atenção em todos os componentes que usam imagem (`TourCard`, `DestinationCard`, `TourGallery`) — evita baixar imagem maior do que o necessário por breakpoint.
- 🟡 Fontes carregadas via `<link>` do Google Fonts em vez de `next/font/google` (ver seção 6) — hoje isso já custa uma conexão externa extra a cada carregamento de página.
- 🟡 Sem `loading.tsx` em nenhuma rota — hoje irrelevante (dados em memória são instantâneos), mas relevante assim que existir latência de rede real.
- ⚠️ Não avaliável ainda: Core Web Vitals reais, porque não há dado de campo (nenhum monitoramento) nem imagens reais (as do mock são SVG leve, não representam o peso de fotos JPG/WEBP de operador). Recomenda-se medir CWV de novo assim que fotos reais e dados reais entrarem.

---

## 11. Segurança

- 🔴 **Next.js 14.2.5 com CVE crítico** — detalhado na seção 4.1. Este é o achado de segurança mais importante do relatório.
- 🟠 **JSON-LD sem escape de `</script>`** — detalhado na seção 5.6. Não explorável hoje (dados só do dev), torna-se relevante assim que operadores controlarem o conteúdo.
- 🟢 `remotePatterns: []` no `next.config.mjs` — nenhum host de imagem externo liberado por padrão. Ao integrar o Storage do NauticFlow/Supabase, liberar **o host específico**, nunca um wildcard amplo.
- 🟢 `dangerouslyAllowSVG` combinado corretamente com `contentDispositionType: 'attachment'` — mitigação correta contra XSS via SVG servido pelo otimizador de imagem do Next. Atenção: essa proteção vale só para imagens que passam pelo `next/image`; se no futuro qualquer upload de operador for servido por outra rota (não pelo otimizador), essa mitigação não se aplica automaticamente lá.
- 🟢 Nenhum segredo, chave ou string de conexão no repositório — `.env.example` só tem uma URL pública.
- 🟢 Superfície de ataque hoje é mínima por design: não há formulário que envie dado a lugar nenhum (busca e filtro só navegam via querystring), não há autenticação, não há banco de dados conectado.
- 🟡 8 vulnerabilidades reportadas por `npm audit` no total; as de `glob`/`minimatch` são de devDependency (toolchain de lint/eslint), não entram no bundle de produção — risco real baixo, mas vale corrigir as que não quebram nada (`npm audit fix`, sem `--force`).
- 🟡 Sem headers de segurança configurados (`next.config.mjs` não define `headers()`) — sem CSP, `X-Content-Type-Options`, `Referrer-Policy`, etc. Não é urgente hoje (sem dado sensível trafegando), mas deveria entrar antes da fase de pagamento.

---

## 12. Arquitetura

Resumo (aprofundado em `docs/ARCHITECTURE.md`): a arquitetura de dados é o ponto mais forte do projeto para os fins desta auditoria — existe uma fronteira real entre UI e origem de dados (`ToursDataSource`), e trocar a implementação é, de fato, uma mudança pequena e isolada.

O que falta **na arquitetura**, especificamente pensando na integração:

1. Nenhuma decisão de cache/revalidação (seção 4.2) — a arquitetura de dados está pronta para receber uma fonte de rede, mas o comportamento de cache dessa fonte ainda não foi desenhado.
2. Nenhuma modelagem de "Saída" (seção 4.3) — o contrato de tipos precisa crescer antes do mapeamento de campos do NauticFlow começar.
3. O contrato `ToursDataSource` não expressa contrato de erro (o que `getTour` deve fazer se a rede falhar? retornar `null`, como "não encontrado", ou lançar? hoje os dois casos — não encontrado e erro de rede — colapsariam no mesmo `null` se a implementação futura não distinguir, escondendo falhas reais como se fossem 404). Vale decidir isso explicitamente na assinatura ou na documentação do contrato antes de implementar `nauticflow-source.ts`.
4. Nenhuma rota de API própria do ToursFlow existe hoje (nem deveria, nesta etapa) — mas quando o fluxo de reserva chegar, vale decidir cedo se o ToursFlow terá rotas de API (`route.ts`) ou se tudo continua Server Component + Server Actions.

---

## 13. Dados mock

Os mocks (`src/data/mock/*`) estão com boa qualidade de conteúdo (textos realistas, coordenadas reais da Região dos Lagos e Costa Verde, variedade proposital de casos: passeio sem rating, operador não verificado, preço por pessoa/grupo/embarcação) e já vêm comentados como temporários, com a regra de que campos simulados (`rating`, `latitude/longitude`, `maxPeople`, `priceFrom`, disponibilidade) não devem ser tratados como definitivos — isso está certo e bem sinalizado no próprio código.

**Campos que faltam no modelo e que esta auditoria identificou como necessários** (detalhados nas seções 5.9, 5.10 e 4.3):
- `BoardingPoint.zipCode` (CEP).
- `Operator.logoUrl` e `Operator.description`.
- Alguma representação de **Saída** (data, horário, capacidade, preço, disponibilidade) — hoje inexistente mesmo como tipo não usado.

**Campos que podem precisar virar estrutura, não texto livre, antes do checkout:**
- `Tour.cancellationPolicy` é uma string livre hoje (correto para exibição). Quando o checkout precisar *calcular* reembolso programaticamente, vai precisar de uma versão estruturada (ex.: lista de `{ horasAntes, percentualReembolso }`). Não é urgente agora.

**Nenhum campo mockado parece desnecessário** — inclusive `Operator.externalId`, comentado como o futuro `company_id` do NauticFlow, já é o gancho de integração pensado com antecedência.

---

## 14. Preparação para integração

O que já está pronto para receber dados reais sem mudança de UI:
- Toda a UI que consome `Tour`, `Destination`, `Category`, `Operator` via `TourWithRelations` — como definido hoje.
- Roteamento, SEO, sitemap — já derivam dos dados, não de listas fixas.

O que precisa ser decidido **antes** de escrever `nauticflow-source.ts` (ordem de dependência, não de importância):
1. Modelagem de "Saída" (seção 4.3) — porque muda o formato de `Tour` que o `nauticflow-source.ts` vai devolver.
2. Contrato de erro da fonte de dados (seção 12, item 3) — porque muda a assinatura das funções.
3. Estratégia de cache/revalidação (seção 4.2) — porque muda como as páginas chamam essas funções (`fetch` options, `revalidate`, Server Actions de revalidação).
4. Estratégia de consulta indexada vs. "trazer tudo e filtrar em JS" (seção 5.5) — requisito não-funcional da implementação, não do contrato.
5. Quais campos do NauticFlow mapeiam 1:1 para os tipos atuais e quais exigem os campos novos (CEP, logo do operador, descrição do operador) identificados nesta auditoria.

---

## 15. Futuro fluxo de compra

O fluxo completo pedido (Passeio → Data → Horário → Pessoas → Disponibilidade → Preço → Checkout → Pagamento → Reserva → Voucher) **não está implementado, como esperado nesta etapa**. A avaliação aqui é só: a interface atual deixa esse caminho mais fácil ou mais difícil de construir depois?

- 🔴 O maior obstáculo já identificado é a ausência de "Saída" no modelo (seção 4.3) — sem isso, não há "Data → Horário → Disponibilidade" para o usuário escolher, porque o dado não existe nem na camada de tipos.
- 🟠 O bloco de preço lateral da página do passeio (`aside` em `passeios/[destino]/[slug]/page.tsx`) hoje assume um preço único e estático — vai precisar virar um seletor de data/horário com preço variável por saída. Vale desenhar esse componente pensando nisso desde já, mesmo que o dado ainda não exista.
- 🟢 O texto "Reserva online em breve. Por enquanto, confira o ponto de encontro e fale com o operador no local." já prepara o usuário para a ausência de checkout — é uma decisão de UX honesta que evita frustração, e não vai precisar ser "desfeita" quando o checkout chegar, só substituída pelo fluxo real.
- 🟠 Decisão de UX a tomar agora (mesmo sem implementar): quando o checkout existir, o CTA da página vai deixar de ser "Ver local de embarque" e passar a ser algo como "Reservar" — o texto "Ver local de embarque" precisa continuar acessível (como âncora secundária), não desaparecer, porque é informação que o turista ainda vai precisar depois de reservar.

---

## 16. Escalabilidade

Projetando o crescimento de 10 → 1.000 operadores:

| Área | Hoje (10 tours mock) | Em 1.000 operadores | Ação necessária |
|---|---|---|---|
| Busca/filtros | Filtro em memória, síncrono | Precisa de query indexada no Supabase | Ver seção 5.5 |
| `/passeios` | Grade única, sem paginação | Página gigante, lenta, ruim para SEO (crawl budget) | Ver seção 5.7 |
| Cards | Renderização direta, sem lazy/virtualização | Ainda ok com paginação — grid de 12-24 itens por página não precisa de virtualização | Nenhuma, se a paginação for resolvida |
| Imagens | SVG local em `public/` | Precisa de CDN/Storage (Supabase Storage) + `remotePatterns` configurado | Já antecipado no comentário do `next.config.mjs`; falta só o host real |
| Destinos/categorias | Listas fixas pequenas | Continuam pequenas (dezenas, não milhares) — sem risco | Nenhuma |
| Sitemap | Um array único em `sitemap.ts` | Limite técnico de 50.000 URLs por arquivo de sitemap | Sem ação agora; monitorar quando o total de URLs (passeios + destinos) se aproximar da casa dos milhares |
| Build estático | `generateStaticParams` gera tudo em build | Build cresce linearmente com o catálogo | Ligado à decisão de ISR/revalidação sob demanda (seção 4.2) |

---

## 17. Checklist pré-integração

Itens que a equipe deveria fechar (ou conscientemente adiar, com dono e prazo) antes de começar a escrever `nauticflow-source.ts`:

- [ ] Atualizar `next` para `14.2.35`+ e trocar o pin exato por range (`^14.2.5`) — 🔴
- [ ] Definir e documentar a estratégia de cache/revalidação (ISR vs. on-demand vs. dinâmico) — 🔴
- [ ] Definir o tipo `Departure`/`Saida` (mesmo sem implementar a UI ainda) — 🔴
- [ ] Definir o contrato de erro de `ToursDataSource` (rede falhou vs. não encontrado) — 🟠
- [ ] Decidir a exigência de consulta indexada para `nauticflow-source.ts` (não "buscar tudo e filtrar em JS") — 🟠
- [ ] Adicionar `zipCode?` a `BoardingPoint` — 🟠
- [ ] Adicionar `logoUrl?`/`description?` a `Operator` — 🟠
- [ ] Decidir se `/operadores/[slug]` entra nesta fase ou na seguinte — 🟠
- [ ] Decidir se um canal de contato do operador aparece na página do passeio nesta fase — 🟠
- [ ] Corrigir o escape do JSON-LD antes de conteúdo de operador fluir pela página — 🟠
- [ ] Corrigir o contraste do botão primário — 🟠
- [ ] Resolver o preço/CTA sticky no mobile — 🟠
- [ ] Planejar Termos de Uso/Privacidade para a fase de reserva/login (não bloqueia catálogo) — 🔴 (fase seguinte)

---

## 18. Ordem recomendada das próximas etapas

Sem implementar nada agora — só a sequência sugerida de decisão/trabalho, para aprovação:

1. **Corrigir a vulnerabilidade do Next.js** (item isolado, sem dependência de nada, pode ser feito a qualquer momento, inclusive antes de decidir o resto).
2. **Fechar o desenho do tipo `Departure`/`Saida`** junto com quem conhece o modelo de dados do NauticFlow — é a decisão que mais influencia todas as outras.
3. **Fechar a estratégia de cache/revalidação**, já pensando em como o NauticFlow vai avisar o ToursFlow quando algo mudar (webhook, revalidação sob demanda, ou polling).
4. **Fechar os campos que faltam nos tipos** (`zipCode`, `logoUrl`, `description` do operador) e mapear 1:1 com os campos reais do NauticFlow.
5. **Só então** escrever `src/data/sources/nauticflow-source.ts`, já nascendo com consulta indexada, contrato de erro definido e estratégia de cache decidida.
6. Em paralelo (não bloqueia a integração de catálogo): corrigir contraste do botão, sticky mobile, JSON-LD, e decidir sobre página de operador e canal de contato.
7. Antes de qualquer fase de reserva/login/pagamento: Termos de Uso, Política de Privacidade e definição de responsabilidade de dado pessoal (LGPD).

---

*Fim da auditoria. Nenhuma alteração de código foi feita. Aguardando aprovação para decidir o que entra em qual etapa.*
