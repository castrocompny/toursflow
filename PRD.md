# ToursFlow — Produto atual

## Proposta

Marketplace público para descobrir, comparar e futuramente reservar passeios náuticos. O turista navega por destinos e passeios; o operador administra dados no NauticFlow.

## Escopo implementado

- Catálogo real de passeios, destinos, categorias e saídas via API pública do NauticFlow.
- Fallback mock local quando `NAUTICFLOW_API_URL` não está configurada.
- Páginas de descoberta, destino e detalhe do passeio.
- SEO, sitemap, robots, Open Graph e JSON-LD.
- Prévia de reserva, validação e integração server-to-server implementadas atrás de flags.
- Fluxo Pix implementado e testado atrás de flag.

## Não liberado ou não implementado

- `BOOKING_CHECKOUT_ENABLED` está desligada.
- `PAYMENTS_UI_ENABLED` está desligada.
- Não afirmar que houve reserva ou cobrança real pela interface pública.
- Cartão, avaliações, login/área do turista, comissão/repasse, busca avançada e rate limit próprio ainda são pendências ou dependem de decisão/integração.

## Princípios

- NauticFlow é autoridade de preço, vagas, disponibilidade e estado da reserva.
- ToursFlow não escreve diretamente no banco do NauticFlow.
- Falha de integração nunca vira sucesso simulado.
- Mudança de checkout/pagamento exige autorização específica, testes e revisão de segurança.
