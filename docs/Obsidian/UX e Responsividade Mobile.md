# UX e Responsividade Mobile

Consolida o trabalho de responsividade mobile feito na branch
`frontend/mobile-booking-ux`, incluindo a investigação de um relato de
overflow horizontal em dispositivo físico e as mudanças que resultaram
no commit `1b6fab5` (24/09/2026).

## Gatilho: relato de overflow horizontal em dispositivo físico

Um usuário reportou, em celular físico real, overflow horizontal e um
número excessivo de "chips" de data na página de detalhe do passeio
(`/passeios/[destino]/[slug]`).

## Investigação: DevTools não reproduziu o problema

Emulação de DevTools foi testada sistematicamente nas larguras 320px,
360px, 375px, 390px, 414px, 430px, 768px e 1024px (e larguras desktop
maiores em rodadas anteriores) — **zero overflow** em todas elas, com
contagem de chips de data correta em cada breakpoint (3 chips <400px, 4
entre 400–768px, 5 entre 768–1024px, 7 ≥1024px, via
`useDateWindowSize()`). Uma checagem de elementos DOM identificou botões
da navegação de data se estendendo ~4px além do viewport a 320px, mas a
causa exata do relato original em dispositivo físico **não foi
isolada com certeza via emulação** — a discrepância entre emulação
(sem overflow) e relato físico (com overflow) fica registrada aqui como
tal, sem inventar uma causa única e definitiva.

## O que foi alterado (independente da causa exata do overflow)

- `BookingSelector`: janela de datas responsiva por viewport, com
  `min-width` e `shrink-0` nos botões/chips para manter tamanho fixo
  dentro de um contêiner `overflow-x-auto` (`flex-1`, gap/padding
  responsivos).
- Página de detalhe do passeio: redução agressiva de espaçamento vertical
  no mobile (`gap-8→6`, `space-y-8→6`, `mt-8→6`, `mt-4→3`, `mt-6→mt-5`) e
  renderização condicional das seções de Itinerário e Checklist.
- Cobertura de teste ampliada em `BookingSelector.test.tsx` para reset de
  seleção de data e dimensionamento responsivo da janela de chips.

## Validação

- **DevTools** (emulação): zero overflow confirmado em todas as larguras
  listadas acima, em múltiplas rodadas (22/09/2026 e 24/09/2026).
- **Dispositivo físico real**: o usuário confirmou manualmente, em
  celular físico, que a versão nova ficou melhor e que o problema visual
  mobile anteriormente observado foi resolvido. Nenhum modelo de
  aparelho, navegador ou métrica específica foi informado nesta
  validação — não inventar esses detalhes; registrar só que houve
  validação manual em dispositivo físico real, em 24/09/2026.
- Codex Review (revisão em background) não encontrou regressões
  acionáveis no working tree antes do commit.

## Commit e deploy

- Commit `1b6fab5` ("fix: corrige overflow mobile e adiciona cobertura
  de testes para listDepartures"), enviado para
  `origin/frontend/mobile-booking-ux` em 24/09/2026.
- Preview automático gerado pela integração GitHub → Vercel para esse
  commit/branch (fluxo padrão de branch, não é o deploy de produção em
  `main` — ver [[Deploy e Ambiente]]).
- Nenhuma feature flag foi alterada neste trabalho — `BOOKING_CHECKOUT_ENABLED`
  e `PAYMENTS_UI_ENABLED` seguem `false` (ver [[Feature Flags]]).

## Pendência em aberto

A causa raiz exata do overflow visto no dispositivo físico (mas não
reproduzido em emulação DevTools) não foi formalmente isolada — as
mudanças acima resolveram o sintoma na validação manual do usuário, mas
uma reprodução determinística em ferramenta segue como item aberto caso
o sintoma volte a aparecer em outro aparelho/navegador. Ver
[[Riscos, Pendências e Roadmap]].

Ver também [[Estado Atual do Produto]] (linha de Responsividade) e
[[Arquitetura e Camada de Dados]] (bugs históricos de infraestrutura de
teste, seção final).
