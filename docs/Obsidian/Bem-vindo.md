# ToursFlow — Memória Técnica

Este cofre é a memória técnica real do ToursFlow: um resumo organizado e
verificado do que o código, os testes e a documentação do repositório
mostram **hoje** (24/09/2026), com a origem de cada afirmação identificada
e qualquer conflito registrado explicitamente em vez de resolvido em
silêncio.

## Como este cofre foi construído

Cada nota abaixo foi escrita cruzando, nesta ordem de confiança:
código atual → configs atuais → testes atuais → documentação atual →
histórico/changelog. Quando a documentação e o código divergiam, isso
está marcado como **DIVERGÊNCIA ENCONTRADA**. Quando uma afirmação não pôde
ser verificada diretamente nesta rodada (ex.: configuração real no painel
da Vercel), está marcada como **NÃO CONFIRMADO**. Ver
[[Notas da Auditoria Documental]] para o método completo e as limitações
desta rodada.

## Mapa do cofre

- [[Visão Geral - ToursFlow vs NauticFlow]] — o que é cada sistema, e a
  regra de que o ToursFlow nunca escreve diretamente em tabelas
  operacionais do NauticFlow.
- [[Estado Atual do Produto]] — cada área do produto classificada em
  Pronto / Atrás de flag / Desativado / Pendente / Não confirmado /
  Próximos passos.
- [[Arquitetura e Camada de Dados]] — App Router, fonte de dados
  (mock vs. NauticFlow), estratégia de cache.
- [[Feature Flags]] — as duas flags que controlam todo o fluxo
  transacional, e por que são constantes literais no código.
- [[Reservas e Pagamentos (Pix)]] — fluxo de hold, idempotência,
  contrato de pagamento real.
- [[Segurança]] — postura de segurança atual, auditorias e o que ainda
  é aceito como limitação conhecida.
- [[Decisões Arquiteturais (ADRs)]] — índice comentado das 17 ADRs em
  `docs/DECISIONS.md`.
- [[Integração NauticFlow - Plano e Contratos]] — o plano original de
  integração e o que dele já está implementado.
- [[Deploy e Ambiente]] — como o deploy acontece e quais variáveis de
  ambiente existem.
- [[Notas da Auditoria Documental]] — metodologia, lacunas conhecidas
  desta rodada e o que ficou pendente da instrução original do usuário.
