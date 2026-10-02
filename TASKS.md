# ToursFlow — Tarefas e pendências

## Estado confirmado

- [x] Marketplace separado do NauticFlow.
- [x] Catálogo real consumido sem cache velho.
- [x] Fallback mock local para desenvolvimento sem API.
- [x] SEO, sitemap, robots e JSON-LD.
- [x] Integração server-to-server de reservas implementada, mas protegida por feature flag.
- [x] Checkout Pix implementado, mas protegido por feature flag.
- [x] Testes automatizados do fluxo implementado.
- [x] Rate limit/HMAC, idempotência e whitelist de payload documentados.

## Próximas decisões

- [ ] Decidir quando e sob quais condições liberar reservas públicas.
- [ ] Decidir quando liberar Pix com teste controlado e mecanismo de limpeza/rollback.
- [ ] Confirmar flags e variáveis no ambiente correto antes de qualquer ativação.
- [ ] Evoluir a API do NauticFlow para busca por texto, data e pessoas se o produto exigir.
- [ ] Definir política de avaliações, login do turista e comissão/repasse.
- [ ] Avaliar rate limit próprio, CSP e CI de PR.

## Regras

1. Não ligar flags de checkout/pagamento sem autorização explícita.
2. Não fazer deploy ou alteração de infraestrutura como efeito colateral.
3. Para integração, verificar os dois lados: ToursFlow e contrato/API do NauticFlow.
4. Rodar typecheck, lint, testes e build antes de concluir mudanças.
5. Atualizar ADRs e documentação somente com fatos verificados.
