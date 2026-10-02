# ToursFlow — Design e UX

## Direção

Marketplace público simples, confiável e orientado à descoberta de passeios. O usuário deve entender destino, duração, preço, embarque, disponibilidade e próximas etapas sem conhecer o NauticFlow.

## Conteúdo

- Não inventar avaliações, nota zero ou disponibilidade.
- Mostrar informação de embarque mesmo sem coordenadas, oferecendo busca por endereço quando necessário.
- Informar quando um filtro ainda não é suportado pela API, em vez de fingir que filtrou.
- Preço e vagas vêm do NauticFlow; o cliente não recalcula autoridade de negócio.

## SEO

Preservar URLs de passeios/destinos, canonical, Open Graph, Twitter Card, JSON-LD seguro e `noindex, follow` nas páginas filtradas quando aplicável.

## Checkout

Enquanto as feature flags estiverem desligadas, não mostrar botão de confirmação nem permitir chamada manual bem-sucedida. Estados de erro devem ser claros e nunca revelar detalhes internos.

## Segurança visual

Não renderizar conteúdo de catálogo de forma insegura. Qualquer alteração em JSON-LD, imagens remotas, formulários ou origem da requisição deve ser revisada com `docs/SECURITY.md`.
