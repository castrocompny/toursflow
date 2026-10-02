# ToursFlow — Memória operacional

## Identidade

ToursFlow é o marketplace público de descoberta e venda de passeios. É separado do NauticFlow, com repositório, deploy e domínio próprios.

## Decisões duráveis

- ToursFlow não grava diretamente nas tabelas do NauticFlow.
- A integração usa API/contrato server-to-server.
- NauticFlow é a autoridade de preço, capacidade, disponibilidade e reserva.
- Preservar autenticação entre serviços, rate limiting, HMAC/client key, idempotência e validação de origem.
- Não ativar checkout ou pagamentos sem autorização específica.

## Estado verificado no repositório

- Next.js 15.5.24, React 19.2, TypeScript strict, Tailwind, Vitest e Testing Library.
- Catálogo real do NauticFlow usa chamadas sem cache velho; mock local é fallback de desenvolvimento.
- Reserva/hold e Pix estão implementados e testados, mas as flags `BOOKING_CHECKOUT_ENABLED` e `PAYMENTS_UI_ENABLED` estão desligadas.
- Não afirmar que houve reserva ou cobrança real pela interface pública enquanto as flags permanecerem desligadas.
- `docs/SECURITY.md`, `docs/RESERVAS-SERVER-TO-SERVER.md`, `docs/PAYMENTS.md` e ADRs contêm detalhes técnicos; esta nota mantém apenas o contexto durável.
