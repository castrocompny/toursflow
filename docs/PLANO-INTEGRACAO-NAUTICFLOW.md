# Plano de execução — integração ToursFlow ↔ NauticFlow

Data: 2026-08-26
Status: **planejamento — nenhuma linha de código foi escrita, nenhum arquivo alterado, nenhuma conexão feita.**
Este documento é a continuação de [AUDITORIA-PRE-INTEGRACAO.md](AUDITORIA-PRE-INTEGRACAO.md). A auditoria disse *o quê* precisa ser resolvido; este documento explica *como* cada peça deve funcionar e em que ordem implementar. **Aguardando aprovação antes de qualquer implementação.**

---

## 1. Arquitetura geral

```
NAUTICFLOW (sistema do operador)
  operador cadastra passeio (conteúdo)
  operador cadastra saídas (data, horário, capacidade)
  operador define preço por saída
  operador publica (status → published)
        │
        │  leitura pública (read-only, nunca escrita)
        ▼
TOURSFLOW (vitrine)
  turista descobre e compara passeios
  turista escolhe data / saída / pessoas
        │
        │  [fase futura, fora deste plano de catálogo]
        ▼
  checkout → Asaas (cobrança) → webhook de pagamento confirmado
        │
        │  escrita da reserva (nunca feita pelo ToursFlow diretamente na tabela operacional)
        ▼
NAUTICFLOW
  reserva registrada, vaga decrementada de forma atômica
  voucher gerado
  operador vê a reserva no próprio painel, como já vê hoje
```

**Fonte de verdade por etapa** — este é o princípio que organiza todo o resto do documento:

| Dado | Fonte de verdade | ToursFlow pode... |
|---|---|---|
| Conteúdo do passeio (nome, descrição, fotos, roteiro, checklist, política) | NauticFlow | ler e exibir |
| Saída (data, horário, capacidade) | NauticFlow | ler e exibir |
| Preço de cada saída | NauticFlow | ler e exibir — **nunca definir** |
| Disponibilidade/vagas | NauticFlow | ler (sempre fresco, nunca cache longo) |
| Destino / Categoria | a decidir — seção 6 | — |
| Escolha do turista (data/saída/pessoas antes de reservar) | ToursFlow | manter em estado efêmero de UI, não persistido |
| Cobrança / status de pagamento | Asaas | nada — só inicia o checkout |
| Reserva confirmada | NauticFlow | nada — só exibe/linka o resultado |
| Voucher | NauticFlow | exibir/entregar ao turista |

Regra geral: **o ToursFlow é read-only sobre catálogo e disponibilidade, e é apenas o ponto de originação da intenção de compra — nunca o sistema de registro de nada.** O NauticFlow é o sistema de registro de tudo que é operação (passeio, saída, reserva, manifesto). O Asaas é o sistema de registro de pagamento. Essa distinção resolve sozinha boa parte das perguntas de segurança e de "quem decide o quê" nas seções seguintes.

---

## 2. Departure / Saída

Hoje `Tour` (`src/types/index.ts`) modela um único `durationMinutes`, `priceFrom` e `maxPeople` — como se todo passeio tivesse uma saída só. Isso precisa virar uma entidade própria.

### Campos propostos

| Campo | Necessário? | Origem | Público? |
|---|---|---|---|
| `id` | sim | NauticFlow (PK) | sim |
| `tourId` | sim | NauticFlow (FK) | sim |
| `date` | sim | NauticFlow | sim |
| `startTime` | sim | NauticFlow | sim |
| `endTime` | opcional | NauticFlow, se existir; senão **calculado** (`startTime + Tour.durationMinutes`) | sim |
| `price` | sim | NauticFlow | sim |
| `capacity` (vagas totais da saída) | interno | NauticFlow | **não precisa ser público** — ver nota abaixo |
| `availableSeats` | sim | **calculado e exposto pelo NauticFlow**, nunca calculado pelo ToursFlow | sim |
| `status` (`scheduled \| full \| cancelled \| completed`) | sim | NauticFlow | sim |
| `boardingPoint` | opcional | NauticFlow, quando a saída usa um ponto diferente do padrão do Tour; senão herda `Tour.boardingPoint` | sim |

**Nunca públicos, mesmo que existam na tabela real:** quem reservou (passageiros), lista de reservas daquela saída, dados de contato de quem reservou, comissão/repasse do operador sobre aquela saída.

**Nota sobre `capacity`:** o turista não precisa saber a capacidade máxima da embarcação, só se há vaga. Expor `availableSeats` (e um status derivado tipo "poucas vagas"/"lotado") é suficiente para a experiência; `capacity` bruta é informação operacional que pode ficar de fora da view pública. Isso não é uma exigência de segurança rígida, é uma recomendação de produto — mas simplifica a superfície pública.

**`availableSeats` tem que vir pronto do NauticFlow, calculado lá.** O ToursFlow nunca deve tentar inferir vagas a partir de reservas (ele não tem — e não deve ter — acesso a reservas). Isso também é o que evita a condição de corrida da seção 16: quem decrementa vagas é sempre o mesmo sistema que grava a reserva.

### Como o ToursFlow consome

`TourWithRelations` ganha `departures: Departure[]` (resolvido do mesmo jeito que `operator`/`destination`/`categories` são resolvidos hoje). E o campo hoje estático `Tour.priceFrom` deixa de ser digitado à parte e passa a ser **derivado**:

```
priceFrom = min(departures.filter(d => d.status === 'scheduled' && d.availableSeats > 0 && d.date >= hoje).map(d => d.price))
```

Isso mantém o texto "A partir de" que já existe na UI (`Price.tsx`) semanticamente correto — hoje ele já diz "a partir de" sem de fato ter mais de um preço; com Departure, passa a ser verdade.

---

## 3. Preço

Continua suportando os três tipos já modelados (`per_person`, `per_group`, `per_boat`) — isso não muda. O que muda é onde o preço vive: deixa de ser um valor único do `Tour` e passa a ser um valor por `Departure`, podendo variar por data (feriado, alta temporada, etc.), com `Tour.priceFrom` como derivado (seção 2).

**Como impedir que o frontend manipule o preço**, quando o checkout existir:

1. O client nunca envia um valor de preço para o servidor em nenhuma etapa que resulte em cobrança — ele envia `departureId` + quantidade de pessoas.
2. O servidor (Server Action ou rota interna do ToursFlow) busca o preço **atual** daquela saída específica direto na fonte (NauticFlow) no momento do checkout e recalcula o total — o preço que apareceu na tela antes é só um preview, nunca o valor usado para cobrar.
3. O valor enviado ao Asaas para criar a cobrança é sempre o recém-calculado no servidor, nunca um campo vindo do payload do navegador.
4. Isso é a mesma regra que já está na auditoria (seção 11): "o ToursFlow nunca determina o preço" — aqui é o mecanismo concreto que garante isso na prática, não só na intenção.

---

## 4. Disponibilidade

Por saída, o ToursFlow precisa saber, a partir dos campos da seção 2, sem calcular nada por conta própria:

- **Existe?** — está presente na resposta da consulta.
- **Disponível?** — `status === 'scheduled' && availableSeats > 0 && date >= hoje`.
- **Quantas vagas?** — `availableSeats`, já pronto.
- **Lotada?** — `availableSeats === 0`.
- **Cancelada?** — `status === 'cancelled'`.
- **No passado?** — `date < hoje` — filtrado tanto na query (não trazer saídas passadas do banco) quanto revalidado na exibição, como segunda camada de proteção.

Este é o dado que **não pode** seguir a mesma regra de cache do conteúdo (ver seção 7) — é o que muda com mais frequência e o que tem consequência financeira se estiver errado.

---

## 5. Publicação

`draft → published → ToursFlow`: quando o `status` de um Tour no NauticFlow é `published`, ele passa a aparecer na consulta/view pública que o ToursFlow lê. Ao voltar para `draft`/`paused`, some da consulta automaticamente — não é um "aviso" que o NauticFlow precisa mandar, é consequência direta da query, assim que ela for refeita (o *quando* disso é definido pela estratégia de cache da seção 7).

O que acontece em cada ação do operador:

| Ação do operador | Efeito no ToursFlow |
|---|---|
| Edita conteúdo (nome, descrição, checklist...) | Reflete na próxima revalidação de **conteúdo** |
| Pausa o passeio | Some da listagem/busca; a URL antiga passa a responder 404/410 (seção 12); sai do sitemap na próxima geração |
| Cancela o passeio | Mesmo efeito da pausa, mas definitivo |
| Altera preço de uma saída | Reflete imediatamente — preço é dado de **disponibilidade**, sempre fresco |
| Altera fotos | Reflete na próxima revalidação de conteúdo |
| Altera capacidade de uma saída | Reflete imediatamente em `availableSeats` — mesma urgência de disponibilidade |

---

## 6. Destinos e categorias

**Opção A — existir só no NauticFlow:** operador escolhe de lista fechada ao cadastrar. Garante consistência (sem "Búzios" vs "Armação dos Búzios" digitados diferente), mas obriga o NauticFlow a manter um conceito que, para a operação dele, não importa — ele não precisa de "tagline" ou "highlights" de destino.

**Opção B — existir só no ToursFlow:** o ToursFlow tenta inferir destino a partir da cidade que o operador digitou livremente no NauticFlow. Risco real de inconsistência de texto quebrando o agrupamento por destino (a mesma cidade escrita de duas formas vira dois destinos diferentes na vitrine).

**Opção C — estrutura compartilhada:** a lista fechada de destinos/categorias mora no banco do NauticFlow (porque é lá que a associação com o Tour é criada, no cadastro), mas os metadados de vitrine (tagline, descrição longa, highlights, imagem de capa do destino — coisas que só importam para SEO/exibição) vivem numa tabela separada, de responsabilidade conceitual do ToursFlow, ligada só pelo `slug`/`id` compartilhado.

**Recomendação: Opção C.** Categoria já tem, no próprio mock atual, um comentário deixado pelo desenvolvedor original dizendo exatamente isso ("categorias devem virar tabela de referência compartilhada... para que o operador escolha de uma lista fechada ao publicar"). Destino se beneficia do mesmo raciocínio pelo mesmo motivo (o filtro por destino do ToursFlow depende de slugs consistentes), com a divisão extra de manter os campos "de vitrine" fora do NauticFlow, que não precisa saber o que é uma `tagline`.

---

## 7. Cache

Duas estratégias diferentes, como pedido — esta é a decisão mais importante do documento inteiro, porque toca a arquitetura de renderização de quase toda página.

**Conteúdo** (nome, descrição, fotos, roteiro, checklist, operador, destino, categoria) — muda pouco: ISR com `revalidate` moderado nas páginas estáticas (`/passeios/[destino]/[slug]`, `/destinos/[slug]`), **ou**, se o NauticFlow puder disparar um webhook no momento em que o operador salva uma edição, revalidação sob demanda (`revalidatePath`/`revalidateTag`) — o conteúdo fica correto quase na hora, sem precisar de um `revalidate` curto o tempo todo. Recomendo a segunda opção como alvo final, com ISR de fallback (ex.: `revalidate: 3600`) para o caso do webhook falhar.

**Disponibilidade** (saídas, preço por saída, vagas, capacidade) — nunca pode seguir esse mesmo ciclo. Estratégia: o bloco de saídas dentro da página do passeio é renderizado dinamicamente (`no-store`/`revalidate: 0`, ou um fetch separado disparado no momento em que o usuário abre o seletor de data), desacoplado do resto da página, que continua cacheada normalmente.

Na prática, isso significa desenhar a página do passeio como duas camadas de frescor: o **casco** (conteúdo, cacheável, sobrevive a instabilidade do NauticFlow) e o **motor** (disponibilidade, sempre fresco, é o que trava o checkout se algo estiver errado). Essa separação também é a base da estratégia de degradação da seção 15.

---

## 8. Erros

| Situação | Tratamento |
|---|---|
| Passeio inexistente (nunca existiu) | 404 real (`notFound()`, como já é hoje) |
| Passeio existe mas não está `published` | Do ponto de vista do público, mesma tela de "não encontrado" — mas logicamente distinto de "nunca existiu" (relevante para decidir 404 vs. 410, seção 12) |
| Saída inexistente (`departureId` inválido, ex. link salvo antigo) | Mensagem específica ("esta saída não está mais disponível"), oferecendo as saídas atuais do mesmo passeio — não um erro genérico |
| Saída lotada | Não é erro, é estado: `availableSeats === 0` desabilita a opção na UI |
| Supabase indisponível / timeout / erro de rede | **Nunca pode virar "não encontrado".** Loga o erro server-side, mostra estado de erro explícito (`error.tsx` do App Router: "não conseguimos carregar agora, tente novamente"), nunca 404 nem uma listagem vazia que pareça intencional |
| Dado incompleto (ex. sem foto, sem descrição) | Não quebra a página — mesmo princípio de fallback que já existe para `rating`/coordenadas hoje; exibe o que existe |

Ponto central, repetido porque é o que mais gera bug de UX/confiança: **erro de conexão não pode virar "não encontrado".** Isso obriga o contrato `ToursDataSource` a distinguir os dois casos na assinatura (hoje ele só devolve `T | null`) — ver Fase 1.

---

## 9. Segurança

**Solução recomendada: View pública no Supabase + RLS, consumida exclusivamente por Server Component.**

Por que essa combinação:
- **API própria do NauticFlow** funcionaria, mas é uma camada extra a versionar e manter — só compensa se o NauticFlow for expor essa API para outros consumidores além do ToursFlow.
- **Server Component direto no Supabase** é o padrão que o projeto já segue (tudo já roda no servidor hoje) — a leitura nunca acontece no navegador, nunca expõe credencial ampla ao client.
- **View pública + RLS** é o mecanismo de segurança em si: o NauticFlow cria views (`public_tours`, `public_departures`, `public_operators`) já filtradas — só campos não sensíveis, só linhas com status publicado — com Row Level Security garantindo que, mesmo em caso de erro de implementação, não é possível alcançar as tabelas operacionais a partir da credencial que o ToursFlow usa.
- A credencial do ToursFlow tem escopo mínimo (só `SELECT` nessas views), nunca a service role key, e nunca sai do ambiente de servidor.

**Nunca acessível ao ToursFlow, em nenhuma hipótese:** reservas, passageiros (nome/documento/contato de quem reservou), dados de pagamento, documentos do operador (CNPJ sensível, dados bancários, contrato), qualquer informação de manifesto interno. Essas tabelas simplesmente não devem existir do lado das views/credencial que o ToursFlow enxerga — segurança por desenho, não por convenção de código.

---

## 10. Fotos

Fluxo: operador faz upload no NauticFlow → NauticFlow grava no Supabase Storage → grava a URL na tabela do passeio → view pública expõe essas URLs → ToursFlow consome via `next/image`, com o host do Storage liberado em `remotePatterns` (hoje vazio — `next.config.mjs`).

O que já está pronto estruturalmente, sem precisar mudar nada: `TourImage` já é `{ url, alt }`, `TourGallery`/`TourCard`/`DestinationCard` já usam `next/image` com `sizes` bem configurado.

O que falta cobrir, especificamente por causa de dado vindo de operador real (não mais texto escrito à mão no mock):
- **Alt text vazio**: hoje sempre bem preenchido no mock; operador real pode deixar em branco — precisa de fallback (nome do passeio) quando `alt` vier vazio.
- **Galeria vazia**: hoje sempre tem pelo menos uma imagem; precisa de um placeholder visual genérico quando `images` vier `[]`.
- **Host do Storage**: liberar especificamente o hostname do bucket do NauticFlow em `remotePatterns`, nunca um wildcard.

Não implementar agora — só confirmar que a estrutura de dados já suporta isso sem redesenho, faltando apenas esses dois fallbacks e a configuração do host.

---

## 11. Operador

**Público:** nome, `logoUrl`, `description` (já adicionados ao tipo — ver changelog de 2026-08-25), cidade/estado, `operatingSince`, `verified`, quantidade de passeios publicados (calculável por contagem na view pública, não precisa ser campo próprio), e futuramente rating agregado quando avaliação real existir.

**Nunca público:** CNPJ/CPF, dados bancários e de split, contrato com o NauticFlow, endereço fiscal completo (diferente da cidade/estado geral já exibida), documentos de habilitação/verificação enviados, telefone/e-mail interno de cadastro — a menos que o operador forneça explicitamente um canal de contato **público** (campo separado, opt-in, diferente do cadastro interno).

---

## 12. SEO

`/passeios/[destino]/[slug]` e `/destinos/[slug]` continuam estáveis se o `slug` for tratado como **imutável depois de publicado** no NauticFlow — gerado uma vez no cadastro, nunca recalculado automaticamente se o operador renomear o passeio depois (para não quebrar link já indexado no Google).

| Evento | Comportamento da URL |
|---|---|
| Passeio pausado | Deixa de estar em `published` → página responde 404/410 na próxima visita; sai do sitemap na próxima geração (`sitemap.ts` já deriva de `listTourPaths()`, que já filtra por `published` hoje — esse filtro precisa sobreviver na troca de fonte) |
| Passeio removido | Mesmo tratamento, idealmente **410 Gone** (sinaliza ao Google "removido de propósito", tira do índice mais rápido que um 404 genérico) |
| Slug muda | Precisa de redirect 301 do slug antigo para o novo — funcionalidade a desenhar (quem grava esse mapeamento é uma decisão em aberto: tabela de redirects no NauticFlow ou no próprio ToursFlow) |
| Destino fica sem passeios | Página do destino continua existindo (pode voltar a ter passeios depois) — já é o comportamento hoje via `EmptyState`, não muda |

---

## 13. Performance

Reforçando, com foco no elemento novo (Departure), o que a auditoria já cobriu na seção 16 dela:

- Toda consulta (`listTours`, `getTour`) precisa filtrar no banco (índice em `destinationSlug`, `categorySlugs`, `status`) — nunca "trazer tudo e filtrar em JS". Com Departure, o volume de linhas por passeio multiplica (N saídas por Tour, não 1 linha por Tour), o que torna esse cuidado ainda mais crítico do que já era.
- A consulta de disponibilidade de um passeio (`getDeparturesForTour(tourId)`) deve ser sempre escopada a um `tourId` **e** a uma janela de datas futura (ex.: próximos 90 dias) — nunca "todas as saídas de todos os tempos". Índice composto `(tourId, date)`.
- A listagem `/passeios` não deve fazer `JOIN` com saídas a cada render só para calcular "a partir de" — `priceFrom` deveria ser uma coluna derivada/materializada do lado do NauticFlow (atualizada por trigger ou view), não uma agregação pesada recalculada a cada requisição.

Com essas três regras respeitadas, a arquitetura proposta se sustenta de 10 a 10.000 passeios sem mudança estrutural — o gargalo, se aparecer, vai estar em índice/query mal desenhado, não na arquitetura em si.

---

## 14. Futura compra

```
TOUR            — ToursFlow exibe; dado nasce no NauticFlow
  ↓
DATA            — turista escolhe, entre as datas com Departure disponível
  ↓
SAÍDA           — turista escolhe um departureId específico
  ↓
PESSOAS         — turista informa; validado contra availableSeats daquela saída
  ↓
DISPONIBILIDADE — revalidada no exato momento da tentativa de reserva
                  (nunca confiar no que foi mostrado alguns segundos antes)
  ↓
PREÇO           — recalculado no servidor a partir do departureId + pessoas,
                  nunca aceito do client (seção 3)
  ↓
CHECKOUT        — UI no ToursFlow; intenção de compra já nasce vinculada
                  a um departureId real, não a um "passeio" genérico
  ↓
ASAAS           — cobrança criada com o valor calculado no servidor
  ↓
SPLIT           — definido pela relação comercial ToursFlow/operador,
                  configurado no Asaas — fonte de verdade da comissão
  ↓
PAGAMENTO CONFIRMADO — webhook do Asaas, sempre validado por assinatura
  ↓
RESERVA NO NAUTICFLOW — webhook confirmado grava a reserva, decrementando
                         availableSeats de forma atômica (seção 16)
  ↓
VOUCHER         — gerado a partir da reserva confirmada, no NauticFlow,
                  entregue/exibido através do ToursFlow
  ↓
OPERADOR        — vê a reserva no próprio painel do NauticFlow,
                  fluxo que já existe hoje, só ganha uma origem nova
```

---

## 15. Dependência do NauticFlow

Se o NauticFlow ficar indisponível, a estratégia é **degradar de "site com compra" para "catálogo navegável sem compra" — nunca para "site fora do ar" nem para "site que aceita reserva sem garantia".**

- **Conteúdo**: continua sendo servido normalmente a partir do cache/ISR existente — o turista continua navegando, vendo passeios, fotos, descrições. É exatamente o motivo de separar conteúdo de disponibilidade em estratégias de cache diferentes (seção 7): o "casco" sobrevive a uma indisponibilidade momentânea do "motor".
- **Disponibilidade**: mostra um estado explícito ("não foi possível confirmar disponibilidade agora, tente novamente em instantes") — nunca esconde a saída silenciosamente (parece que não existe) e nunca mostra a última disponibilidade cacheada como se fosse atual.
- **Compra/checkout**: fica bloqueado enquanto a fonte de disponibilidade/preço estiver inacessível — nunca deixa avançar para pagamento sem confirmação fresca de vaga e preço.

---

## 16. Segurança da futura reserva

| Risco | Mitigação arquitetural | Responsável |
|---|---|---|
| Overbooking | Decremento de `availableSeats` como operação atômica no banco (transação / `UPDATE ... WHERE availableSeats > 0`, ou constraint) — nunca "ler, decidir no app, escrever depois" | NauticFlow |
| Preço manipulado | Preço sempre recalculado no servidor a partir do `departureId` (seção 3) | ToursFlow (na hora do checkout) |
| Reserva duplicada (duplo clique) | Chave de idempotência gerada no início do checkout; retries com a mesma chave não criam segunda reserva | ToursFlow + NauticFlow |
| Pagamento duplicado | Mesma lógica de idempotência aplicada à criação da cobrança no Asaas | Integração de checkout |
| Webhook duplicado | Handler do webhook do Asaas verifica se aquele evento já foi processado antes de gravar — webhooks podem chegar mais de uma vez por design de qualquer provedor | NauticFlow (handler do webhook) |
| Duas pessoas comprando a última vaga ao mesmo tempo | Resolvido pela mesma atomicidade do overbooking: a segunda tentativa falha porque a vaga já não está mais disponível no banco; o checkout precisa tratar esse erro explicitamente ("essa saída acabou de lotar, escolha outra data") | NauticFlow (dado) + ToursFlow (tratamento de erro na UI) |

O padrão geral: **quem é dono do dado de disponibilidade/reserva (NauticFlow) é quem garante a atomicidade; o ToursFlow só precisa saber reagir corretamente quando essas proteções rejeitarem uma tentativa.**

---

## 17. Atualização dos dados — fluxo por cenário

| Operador faz... | O que acontece |
|---|---|
| Altera preço (R$150 → R$180) | Grava no NauticFlow → próxima leitura de disponibilidade do ToursFlow já reflete o novo valor **imediatamente** (preço de saída nunca é cacheado como conteúdo, seção 7) |
| Pausa o passeio | Grava no NauticFlow → a view pública deixa de retornar o Tour → a página responde 404/410 na próxima visita (seção 12) → sitemap não lista mais na próxima geração → cards somem da listagem/home na próxima revalidação de **conteúdo** |
| Altera foto | Grava no NauticFlow → reflete na próxima revalidação de conteúdo (ISR ou webhook de revalidação sob demanda) — não precisa ser instantâneo |
| Cria nova saída | Grava no NauticFlow → aparece na próxima leitura de disponibilidade — **instantâneo**, sem esperar ciclo de conteúdo |

A régua que decide qual linha da tabela acima se aplica a uma mudança futura que não esteja listada aqui: **é dado de disponibilidade (preço de saída, vagas, criação/cancelamento de saída) → sempre fresco. É conteúdo (nome, descrição, fotos, roteiro, política) → segue o ciclo de revalidação de conteúdo.**

---

## 18. Plano em fases

Nomeando o escopo de cada fase — nenhuma implementada agora.

- **FASE 0 — Decisões arquiteturais.** Aprovar (ou ajustar) as respostas das seções 1 a 17 deste documento. Decidir explicitamente: modelo de Destino/Categoria (seção 6), estratégia de cache dupla (seção 7), formato do contrato de erro (seção 8), mecanismo de leitura segura (seção 9).
- **FASE 1 — Contrato de dados.** Atualizar `ToursDataSource` (`src/data/source.ts`) e os tipos (`src/types/index.ts`) para incluir `Departure` e `priceFrom` derivado — ainda sobre o **mock**, sem tocar Supabase, só para validar o contrato e o comportamento antes de existir dado real por trás.
- **FASE 2 — Estrutura Departure.** Desenho final do tipo (campos da seção 2) e de como ele se relaciona com `Tour` na resposta de `getTour`/`listTours`.
- **FASE 3 — Leitura pública.** Desenho das views/RLS no Supabase do NauticFlow (em conjunto com quem mantém o NauticFlow) e definição da credencial que o ToursFlow vai usar.
- **FASE 4 — Integração de conteúdo.** Implementar `src/data/sources/nauticflow-source.ts` para os campos de conteúdo (Tour sem Departure ainda) — primeira fatia real de integração, testável isoladamente.
- **FASE 5 — Integração de disponibilidade.** Estender `nauticflow-source.ts` para Departures, com a estratégia "sempre fresco" da seção 7.
- **FASE 6 — Cache e performance.** Aplicar as decisões de ISR/revalidação sob demanda da Fase 0, medir performance real (agora com rede de verdade, não memória).
- **FASE 7 — Testes.** Validar todos os cenários de erro (seção 8) e de atualização (seção 17), mais uma carga básica.
- **FASE 8 — Pagamento.** Integração com Asaas — fora do escopo deste documento, fase futura própria.
- **FASE 9 — Reserva.** Checkout completo + gravação da reserva no NauticFlow, com as proteções da seção 16.
- **FASE 10 — Voucher.** Geração e entrega do voucher.

Este documento cobre o racional das Fases 0 a 7 em profundidade. 8, 9 e 10 são citadas só para mostrar onde a arquitetura de catálogo/disponibilidade se conecta com elas — não são o foco aqui e merecem seu próprio plano quando chegar a vez.

---

## 19. Resultado final

### 1. Arquitetura recomendada
ToursFlow como camada de leitura pública (Server Components) sobre views do Supabase do NauticFlow protegidas por RLS, com duas estratégias de cache separadas — conteúdo (ISR/revalidação sob demanda) e disponibilidade (sempre fresco) — e nenhuma escrita direta do ToursFlow nas tabelas operacionais do NauticFlow, nunca.

### 2. Modelo conceitual de dados
`Tour` (conteúdo, já existe) `1—N Departure` (novo: data, horário, preço, capacidade, `availableSeats`, status). `Tour.priceFrom` passa a ser derivado das `Departure` futuras disponíveis, não um campo digitado. `Destino`/`Categoria` como lista fechada compartilhada (owned pelo NauticFlow no cadastro, com metadados de vitrine mantidos à parte pelo ToursFlow).

### 3. Fluxo completo NauticFlow → ToursFlow
Operador cadastra e publica → view pública passa a retornar o Tour → ToursFlow lê conteúdo (cacheado) e disponibilidade (sempre fresco) → turista descobre e compara.

### 4. Fluxo futuro ToursFlow → NauticFlow
Turista escolhe saída → checkout recalcula preço no servidor → Asaas cobra → webhook confirmado grava reserva no NauticFlow (atômico) → voucher gerado no NauticFlow → operador vê no próprio painel.

### 5. Decisões que você precisa tomar
- Aprovar (ou ajustar) o modelo de `Departure` da seção 2.
- Escolher entre ISR com `revalidate` fixo ou revalidação sob demanda via webhook para conteúdo (seção 7) — recomendo sob demanda com ISR de fallback.
- Confirmar a Opção C para Destino/Categoria (seção 6) — ou justificar por que não.
- Confirmar que a leitura será via view pública + RLS (seção 9), e quem (você ou o time do NauticFlow) desenha essas views.
- Decidir se `capacity` bruta fica pública ou só `availableSeats`/status derivado (seção 2).

### 6. Riscos
- Maior risco técnico: implementar `nauticflow-source.ts` "trazendo tudo e filtrando em JS" (funciona em dev, quebra em escala) — mitigado exigindo query indexada desde a Fase 4.
- Maior risco de produto: cachear disponibilidade como se fosse conteúdo — mitigado pela separação de estratégias da seção 7.
- Maior risco de segurança: credencial do ToursFlow com acesso além das views públicas — mitigado por RLS + credencial de escopo mínimo (seção 9).
- Maior risco de SEO: slug mutável quebrando link indexado — mitigado tratando slug como imutável (seção 12).

### 7. Pontos a corrigir no ToursFlow antes da integração
Os já listados na auditoria (seção 4 e 5 de `AUDITORIA-PRE-INTEGRACAO.md`) continuam valendo, com destaque para os que este plano depende diretamente: atualizar `next` (14.2.35+), definir o contrato de erro de `ToursDataSource` (seção 8 deste documento depende disso), e decidir a estratégia de cache antes de escrever qualquer query real (seção 7).

### 8. Ordem exata de implementação
Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6 → Fase 7. Pagamento/Reserva/Voucher (Fases 8-10) só depois de 0-7 estarem no ar e validadas com dado real.

### 9. O que não devemos fazer
Não escrever `nauticflow-source.ts` antes de fechar o modelo de `Departure`. Não usar a service role key do Supabase no ToursFlow. Não cachear disponibilidade com o mesmo `revalidate` do conteúdo. Não aceitar preço vindo do client em nenhuma etapa futura de checkout. Não tornar slug mutável. Não implementar Fases 8-10 antes de 0-7 estarem testadas.

### 10. Checklist para iniciar a integração
- [ ] Este documento aprovado (ou ajustado e reaprovado)
- [ ] Modelo de `Departure` fechado com quem conhece o schema real do NauticFlow
- [ ] Decisão de cache (ISR vs. sob demanda) registrada
- [ ] Decisão de Destino/Categoria (Opção C ou alternativa) registrada
- [ ] Views públicas + RLS desenhadas do lado do NauticFlow
- [ ] Vulnerabilidade do Next.js corrigida
- [ ] Contrato de erro de `ToursDataSource` definido
- [ ] Só então: início da Fase 1

---

*Fim do plano. Nenhuma implementação foi iniciada. Aguardando sua aprovação para começar pela Fase 0.*
