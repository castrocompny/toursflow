import type {
  Category,
  Departure,
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

/** Saídas sintéticas (próximos sábados) só para exercitar a UI de disponibilidade em dev local. */
function syntheticDepartures(tour: TourWithRelations): Departure[] {
  const now = new Date();
  const nextSaturday = new Date(now);
  nextSaturday.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));

  return [0, 1, 2].map((weekOffset, index) => {
    const date = new Date(nextSaturday);
    date.setDate(nextSaturday.getDate() + weekOffset * 7);
    date.setUTCHours(12, 0, 0, 0);
    return {
      id: `${tour.id}-departure-${index}`,
      tourId: tour.id,
      departsAt: date.toISOString(),
      price: tour.priceFrom,
      priceType: tour.priceType,
      // A última saída simulada aparece esgotada, só para a UI ter os dois estados em dev.
      soldOut: index === 2,
    };
  });
}

export const mockSource: ToursDataSource = {
  name: 'mock',

  async listTours(filters = {}) {
    const matched = published().filter((tour) => matches(tour, filters));
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
    const start = (page - 1) * limit;
    return {
      tours: matched.slice(start, start + limit),
      page,
      limit,
      total: matched.length,
      totalPages: Math.max(1, Math.ceil(matched.length / limit)),
    };
  },

  async getTour(destinationSlug: string, tourSlug: string) {
    return (
      published().find(
        (tour) => tour.destinationSlug === destinationSlug && tour.slug === tourSlug,
      ) ?? null
    );
  },

  async listDepartures(tourSlug: string) {
    const tour = published().find((item) => item.slug === tourSlug);
    return tour ? syntheticDepartures(tour) : [];
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
