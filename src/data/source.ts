import type {
  Category,
  Departure,
  Destination,
  TourFilters,
  TourListResult,
  TourWithRelations,
} from '@/types';

/**
 * Erro de infraestrutura da fonte de dados (rede, timeout, resposta
 * inválida). Nunca deve ser confundido com "não encontrado": um passeio
 * inexistente é `null`, uma API fora do ar é `DataSourceError`. Páginas
 * capturam isso via `error.tsx`, não via estado vazio.
 */
export class DataSourceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DataSourceError';
  }
}

/**
 * Contrato único da camada de dados.
 *
 * Duas implementações: `mock-source.ts` (dados em memória, usado quando
 * `NAUTICFLOW_API_URL` não está configurada) e `nauticflow-source.ts`
 * (API pública real do NauticFlow). `repository.ts` decide qual usar.
 * Nenhum componente ou página conhece a diferença.
 */
export interface ToursDataSource {
  readonly name: string;
  listTours(filters?: TourFilters): Promise<TourListResult>;
  getTour(destinationSlug: string, tourSlug: string): Promise<TourWithRelations | null>;
  /** Saídas futuras e disponíveis de um passeio, mais frescas que o resto do catálogo. */
  listDepartures(tourSlug: string): Promise<Departure[]>;
  listFeaturedTours(limit?: number): Promise<TourWithRelations[]>;
  listDestinations(): Promise<Destination[]>;
  getDestination(slug: string): Promise<Destination | null>;
  listCategories(): Promise<Category[]>;
  /** Usado por sitemap e geração estática de rotas. */
  listTourPaths(): Promise<Array<{ destino: string; slug: string }>>;
}
