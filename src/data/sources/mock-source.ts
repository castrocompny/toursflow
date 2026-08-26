import type {
  Category,
  Destination,
  Tour,
  TourFilters,
  TourWithRelations,
} from '@/types';
import type { ToursDataSource } from '@/data/source';
import { mockTours } from '@/data/mock/tours.mock';
import { mockOperators } from '@/data/mock/operators.mock';
import { mockDestinations } from '@/data/mock/destinations.mock';
import { mockCategories } from '@/data/mock/categories.mock';

function resolve(tour: Tour): TourWithRelations | null {
  const operator = mockOperators.find((item) => item.id === tour.operatorId);
  const destination = mockDestinations.find((item) => item.slug === tour.destinationSlug);
  if (!operator || !destination) return null;

  const categories = tour.categorySlugs
    .map((slug) => mockCategories.find((category) => category.slug === slug))
    .filter((category): category is Category => Boolean(category));

  return { ...tour, operator, destination, categories };
}

const published = (): TourWithRelations[] =>
  mockTours
    .filter((tour) => tour.status === 'published')
    .map(resolve)
    .filter((tour): tour is TourWithRelations => tour !== null);

function matches(tour: TourWithRelations, filters: TourFilters): boolean {
  if (filters.destination && tour.destinationSlug !== filters.destination) return false;
  if (filters.category && !tour.categorySlugs.includes(filters.category)) return false;
  if (filters.people && tour.maxPeople && tour.maxPeople < filters.people) return false;
  if (filters.search) {
    const term = filters.search.toLowerCase();
    const haystack = [tour.name, tour.summary, tour.destination.name, tour.operator.name]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  // `date` ainda não filtra: a disponibilidade por data depende das saídas
  // cadastradas no NauticFlow, que não existem na camada mock.
  return true;
}

export const mockSource: ToursDataSource = {
  name: 'mock',

  async listTours(filters = {}) {
    return published().filter((tour) => matches(tour, filters));
  },

  async getTour(destinationSlug: string, tourSlug: string) {
    return (
      published().find(
        (tour) => tour.destinationSlug === destinationSlug && tour.slug === tourSlug,
      ) ?? null
    );
  },

  async listFeaturedTours(limit = 6) {
    return published()
      .slice()
      .sort((a, b) => (b.rating?.count ?? 0) - (a.rating?.count ?? 0))
      .slice(0, limit);
  },

  async listDestinations(): Promise<Destination[]> {
    return mockDestinations;
  },

  async getDestination(slug: string) {
    return mockDestinations.find((destination) => destination.slug === slug) ?? null;
  },

  async listCategories(): Promise<Category[]> {
    return mockCategories;
  },

  async listTourPaths() {
    return published().map((tour) => ({ destino: tour.destinationSlug, slug: tour.slug }));
  },
};
