import type { ToursDataSource } from '@/data/source';
import { mockSource } from '@/data/sources/mock-source';

/**
 * Ponto único de troca da origem dos dados.
 *
 * Passo da integração futura:
 * 1. criar `sources/nauticflow-source.ts` implementando `ToursDataSource`
 *    sobre o Supabase do NauticFlow (apenas passeios com status publicado);
 * 2. trocar a constante abaixo por uma seleção via env, por exemplo:
 *    `const source = process.env.DATA_SOURCE === 'nauticflow' ? nauticflowSource : mockSource;`
 *
 * Nenhum componente importa mock diretamente. Toda a UI consome as funções
 * exportadas aqui, que são assíncronas justamente para que a troca por
 * chamadas de rede não exija mudança de assinatura.
 */
const source: ToursDataSource = mockSource;

export const dataSourceName = source.name;

export const listTours = source.listTours.bind(source);
export const getTour = source.getTour.bind(source);
export const listFeaturedTours = source.listFeaturedTours.bind(source);
export const listDestinations = source.listDestinations.bind(source);
export const getDestination = source.getDestination.bind(source);
export const listCategories = source.listCategories.bind(source);
export const listTourPaths = source.listTourPaths.bind(source);
