/**
 * MOCK TEMPORÁRIO — não é dado de produção.
 * Substituído por `companies` do NauticFlow na integração.
 */
import type { Operator } from '@/types';

export const mockOperators: Operator[] = [
  {
    id: 'op-mar-azul',
    name: 'Mar Azul Turismo',
    slug: 'mar-azul-turismo',
    city: 'Búzios',
    state: 'RJ',
    operatingSince: 2012,
    verified: true,
    logoUrl: '/img/mock/operators/mar-azul-turismo.svg',
    description:
      'Opera em Búzios desde 2012, com lanchas para passeios de dia inteiro pelas ilhas e saídas privativas de pôr do sol.',
  },
  {
    id: 'op-costa-brava',
    name: 'Costa Brava Passeios',
    slug: 'costa-brava-passeios',
    city: 'Búzios',
    state: 'RJ',
    operatingSince: 2018,
    verified: true,
    logoUrl: '/img/mock/operators/costa-brava-passeios.svg',
    description:
      'Especializada no roteiro clássico de escuna pelas praias de Búzios, com saída diária do centro da cidade.',
  },
  {
    id: 'op-farol',
    name: 'Farol Náutica',
    slug: 'farol-nautica',
    city: 'Arraial do Cabo',
    state: 'RJ',
    operatingSince: 2009,
    verified: true,
    logoUrl: '/img/mock/operators/farol-nautica.svg',
    description:
      'Uma das operadoras mais antigas de Arraial do Cabo, com barco compartilhado, lancha privativa e batismo de mergulho.',
  },
  {
    id: 'op-lagoa',
    name: 'Lagoa Marina',
    slug: 'lagoa-marina',
    city: 'Cabo Frio',
    state: 'RJ',
    verified: false,
    logoUrl: '/img/mock/operators/lagoa-marina.svg',
    description:
      'Opera passeios de escuna pelo canal de Cabo Frio e saídas guiadas de jet ski na Praia do Forte.',
  },
  {
    id: 'op-ilha-grande',
    name: 'Ilha Grande Boat Tours',
    slug: 'ilha-grande-boat-tours',
    city: 'Angra dos Reis',
    state: 'RJ',
    operatingSince: 2015,
    verified: true,
    logoUrl: '/img/mock/operators/ilha-grande-boat-tours.svg',
    description:
      'Roteiros de dia inteiro entre as ilhas de Angra dos Reis, com parada para almoço em restaurante flutuante.',
  },
  {
    id: 'op-saveiro',
    name: 'Saveiro da Baía',
    slug: 'saveiro-da-baia',
    city: 'Paraty',
    state: 'RJ',
    operatingSince: 2004,
    verified: true,
    logoUrl: '/img/mock/operators/saveiro-da-baia.svg',
    description:
      'Passeios em saveiro tradicional de madeira pela baía de Paraty, com almoço preparado a bordo durante o trajeto.',
  },
];
