import type { ToursDataSource } from '@/data/source';
import { mockSource } from '@/data/sources/mock-source';
import { nauticflowSource } from '@/data/sources/nauticflow-source';

/**
 * Ponto único de troca da origem dos dados.
 *
 * Com `NAUTICFLOW_API_URL` configurada (produção/preview), usa a API
 * pública real do NauticFlow. Sem ela (dev local sem a variável setada),
 * cai para o mock — nenhum componente importa mock diretamente, e nenhum
 * precisa saber qual das duas está ativa.
 */
const source: ToursDataSource = process.env.NAUTICFLOW_API_URL ? nauticflowSource : mockSource;

export const dataSourceName = source.name;

export const listTours = source.listTours.bind(source);
export const getTour = source.getTour.bind(source);
export const listDepartures = source.listDepartures.bind(source);
export const listFeaturedTours = source.listFeaturedTours.bind(source);
export const listDestinations = source.listDestinations.bind(source);
export const getDestination = source.getDestination.bind(source);
export const listCategories = source.listCategories.bind(source);
export const listTourPaths = source.listTourPaths.bind(source);
