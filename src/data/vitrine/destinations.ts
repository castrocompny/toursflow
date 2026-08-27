/**
 * Metadados de vitrine dos destinos — propriedade do ToursFlow, não do
 * NauticFlow (decisão registrada em docs/PLANO-INTEGRACAO-NAUTICFLOW.md,
 * seção 6, Opção C).
 *
 * A API pública do NauticFlow só garante `slug` e `name` por destino —
 * quem é o destino de verdade. Tagline, descrição, imagem e destaques são
 * conteúdo editorial de SEO/exibição que só importa para a vitrine, então
 * moram aqui, ligados pelo mesmo `slug`.
 *
 * Quando o NauticFlow devolve um destino cujo slug não está mapeado aqui
 * (operador cadastrou uma cidade nova, ainda sem copy escrita), o mapper
 * usa `genericDestinationVitrine` como fallback — nunca inventa texto
 * específico daquele lugar.
 */
export interface DestinationVitrine {
  state: string;
  tagline: string;
  description: string;
  image: string;
  highlights: string[];
}

export const destinationsVitrine: Record<string, DestinationVitrine> = {
  buzios: {
    state: 'RJ',
    tagline: 'Vinte e tantas praias em uma península só',
    description:
      'Búzios concentra praias de perfis muito diferentes a poucos minutos de barco umas das outras. Passeios de lancha e escuna saem do centro e cobrem a costa em meio período.',
    image: '/img/mock/destinations/buzios.svg',
    highlights: ['Saídas do Píer do Centro', 'Ilhas Feia e Gravatás', 'Pôr do sol na Orla Bardot'],
  },
  'arraial-do-cabo': {
    state: 'RJ',
    tagline: 'A água mais transparente da Região dos Lagos',
    description:
      'Arraial é destino de barco por excelência: as praias mais bonitas só têm acesso pelo mar. Roteiros compartilhados saem da Praia dos Anjos ao longo do dia.',
    image: '/img/mock/destinations/arraial-do-cabo.svg',
    highlights: ['Prainhas do Pontal', 'Gruta Azul', 'Batismo de mergulho'],
  },
  'cabo-frio': {
    state: 'RJ',
    tagline: 'Canal, dunas e mar aberto no mesmo roteiro',
    description:
      'Passeios em Cabo Frio combinam a saída pelo canal, a Praia do Forte e paradas em pontos de banho. Boa base para quem quer conhecer também Arraial e Búzios.',
    image: '/img/mock/destinations/cabo-frio.svg',
    highlights: ['Saída pelo Canal', 'Ilha do Japonês', 'Jet ski guiado'],
  },
  'angra-dos-reis': {
    state: 'RJ',
    tagline: 'Mais de trezentas ilhas para escolher',
    description:
      'Roteiros de dia inteiro entre ilhas e enseadas de água calma. Saídas do cais de Angra e do Frade, com paradas para banho e almoço.',
    image: '/img/mock/destinations/angra-dos-reis.svg',
    highlights: ['Lagoa Azul', 'Ilha Grande', 'Roteiros de dia inteiro'],
  },
  paraty: {
    state: 'RJ',
    tagline: 'Saveiros tradicionais na baía histórica',
    description:
      'A baía de Paraty é percorrida em saveiros de madeira, com paradas em ilhas e praias de mata atlântica. Saídas do cais do centro histórico.',
    image: '/img/mock/destinations/paraty.svg',
    highlights: ['Saveiro de madeira', 'Praia da Lula', 'Centro histórico a pé'],
  },
};

/** Usado quando o NauticFlow devolve um slug de destino ainda sem vitrine escrita. */
export function genericDestinationVitrine(name: string): DestinationVitrine {
  return {
    state: '',
    tagline: `Passeios de barco em ${name}`,
    description: `Novo destino no ToursFlow. Os passeios disponíveis em ${name} já estão listados abaixo.`,
    image: '/img/mock/destinations/generic.svg',
    highlights: [],
  };
}
