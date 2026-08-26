import type {
  Category,
  Destination,
  TourFilters,
  TourWithRelations,
} from '@/types';

/**
 * Contrato único da camada de dados.
 *
 * Hoje existe uma implementação (mock). Quando o NauticFlow expuser os
 * passeios publicados, basta criar `sources/nauticflow-source.ts` respeitando
 * esta interface e trocar a linha de seleção em `repository.ts`.
 * Nenhum componente ou página precisa ser alterado.
 */
export interface ToursDataSource {
  readonly name: string;
  listTours(filters?: TourFilters): Promise<TourWithRelations[]>;
  getTour(destinationSlug: string, tourSlug: string): Promise<TourWithRelations | null>;
  listFeaturedTours(limit?: number): Promise<TourWithRelations[]>;
  listDestinations(): Promise<Destination[]>;
  getDestination(slug: string): Promise<Destination | null>;
  listCategories(): Promise<Category[]>;
  /** Usado por sitemap e geração estática de rotas. */
  listTourPaths(): Promise<Array<{ destino: string; slug: string }>>;
}
