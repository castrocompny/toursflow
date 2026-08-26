/**
 * MOCK TEMPORÁRIO — não é dado de produção.
 * Destinos virão de tabela própria (ou de uma view sobre os passeios publicados).
 */
import type { Destination } from '@/types';

export const mockDestinations: Destination[] = [
  {
    id: 'dest-buzios',
    slug: 'buzios',
    name: 'Búzios',
    state: 'RJ',
    tagline: 'Vinte e tantas praias em uma península só',
    description:
      'Búzios concentra praias de perfis muito diferentes a poucos minutos de barco umas das outras. Passeios de lancha e escuna saem do centro e cobrem a costa em meio período.',
    image: '/img/mock/destinations/buzios.svg',
    highlights: ['Saídas do Píer do Centro', 'Ilhas Feia e Gravatás', 'Pôr do sol na Orla Bardot'],
  },
  {
    id: 'dest-arraial',
    slug: 'arraial-do-cabo',
    name: 'Arraial do Cabo',
    state: 'RJ',
    tagline: 'A água mais transparente da Região dos Lagos',
    description:
      'Arraial é destino de barco por excelência: as praias mais bonitas só têm acesso pelo mar. Roteiros compartilhados saem da Praia dos Anjos ao longo do dia.',
    image: '/img/mock/destinations/arraial-do-cabo.svg',
    highlights: ['Prainhas do Pontal', 'Gruta Azul', 'Batismo de mergulho'],
  },
  {
    id: 'dest-cabo-frio',
    slug: 'cabo-frio',
    name: 'Cabo Frio',
    state: 'RJ',
    tagline: 'Canal, dunas e mar aberto no mesmo roteiro',
    description:
      'Passeios em Cabo Frio combinam a saída pelo canal, a Praia do Forte e paradas em pontos de banho. Boa base para quem quer conhecer também Arraial e Búzios.',
    image: '/img/mock/destinations/cabo-frio.svg',
    highlights: ['Saída pelo Canal', 'Ilha do Japonês', 'Jet ski guiado'],
  },
  {
    id: 'dest-angra',
    slug: 'angra-dos-reis',
    name: 'Angra dos Reis',
    state: 'RJ',
    tagline: 'Mais de trezentas ilhas para escolher',
    description:
      'Roteiros de dia inteiro entre ilhas e enseadas de água calma. Saídas do cais de Angra e do Frade, com paradas para banho e almoço.',
    image: '/img/mock/destinations/angra-dos-reis.svg',
    highlights: ['Lagoa Azul', 'Ilha Grande', 'Roteiros de dia inteiro'],
  },
  {
    id: 'dest-paraty',
    slug: 'paraty',
    name: 'Paraty',
    state: 'RJ',
    tagline: 'Saveiros tradicionais na baía histórica',
    description:
      'A baía de Paraty é percorrida em saveiros de madeira, com paradas em ilhas e praias de mata atlântica. Saídas do cais do centro histórico.',
    image: '/img/mock/destinations/paraty.svg',
    highlights: ['Saveiro de madeira', 'Praia da Lula', 'Centro histórico a pé'],
  },
];
