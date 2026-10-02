# AGENTS.md — ToursFlow

## Objetivo

ToursFlow é um marketplace público independente do NauticFlow para descoberta de passeios náuticos. O NauticFlow é o sistema operacional do operador; o ToursFlow é a vitrine do turista.

## Fonte de verdade

Use, nesta ordem:

1. código, testes e `package.json`;
2. contrato e documentação específica em `docs/`;
3. README e ADRs;
4. memória compartilhada do AI Brain, como contexto histórico a confirmar no repositório.

Não escrever diretamente nas tabelas do NauticFlow. Toda integração deve usar a API/contrato autorizado.

## Stack confirmada

- Next.js 15.5.24, App Router e Server Components.
- React 19.2, TypeScript strict e Tailwind CSS.
- Vitest + Testing Library.
- API server-to-server com NauticFlow.
- Deploy próprio e domínio próprio; produção deve ser confirmado na infraestrutura atual.

## Regras críticas

- `TOURSFLOW_API_SECRET` é somente server-side e nunca pode chegar ao cliente, logs ou respostas.
- A API de reservas deve manter rate limiting, HMAC/client key, idempotência e validação de origem.
- ToursFlow nunca é autoridade de preço, disponibilidade, capacidade ou status final da reserva; NauticFlow decide.
- Não ativar checkout/reservas ou pagamentos sem autorização específica e validação controlada.
- Feature flags server-side continuam desligadas até decisão explícita: `BOOKING_CHECKOUT_ENABLED` e `PAYMENTS_UI_ENABLED`.
- Não criar fallback mock que simule reserva ou pagamento bem-sucedido.
- Não fazer commit, push, deploy, migration ou alteração de infraestrutura como consequência implícita de uma tarefa.
- Não expor stack traces, secrets, dados internos ou detalhes do NauticFlow.

## Verificação

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Para mudanças de reserva/pagamento, leia também `docs/SECURITY.md`, `docs/RESERVAS-SERVER-TO-SERVER.md`, `docs/PAYMENTS.md` e os ADRs relevantes. Para mudanças de catálogo, confira `docs/ARCHITECTURE.md` e o contrato público do NauticFlow.

## Sincronização automática de contexto

Ao concluir uma tarefa, compare as mudanças com `PRD.md`, `DESIGN.md`, `TASKS.md`, `PROJECT_MEMORY.md` e os documentos em `docs/`.

- Atualize documentação quando mudar arquitetura, integração, API, segurança, flags, fluxo do usuário ou decisão de produto.
- Não altere documentos por uma correção interna sem impacto durável.
- Atualize contratos e ADRs junto com alterações de integração.
- Registre somente fatos verificados e duráveis; nunca tokens, senhas ou dados pessoais.
- O Claude Code mantém documentos do repositório, mas não deve ser considerado conectado ao AI Brain do Hermes. A conversa principal do ToursFlow no Hermes deve revisar mudanças importantes e sincronizar apenas fatos novos no AI Brain.
