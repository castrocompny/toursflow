/** Configuração única do site. Trocar a URL aqui ao apontar o domínio. */
export const site = {
  name: 'ToursFlow',
  domain: 'toursflow.com.br',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://toursflow.com.br',
  tagline: 'Encontre seu próximo passeio',
  description:
    'Marketplace de passeios e experiências náuticas. Compare passeios de operadores locais verificados e escolha o que combina com a sua viagem.',
} as const;
