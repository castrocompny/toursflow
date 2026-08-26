import { Suspense } from 'react';
import type { Metadata } from 'next';
import { listCategories, listDestinations, listTours } from '@/data/repository';
import { FilterBar } from '@/components/search/FilterBar';
import { TourGrid } from '@/components/tours/TourGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { pageMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import type { TourFilters } from '@/types';

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

function readFilters(searchParams: PageProps['searchParams']): TourFilters {
  const get = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const people = Number(get('pessoas'));

  return {
    destination: get('destino'),
    category: get('categoria'),
    date: get('data'),
    people: Number.isFinite(people) && people > 0 ? people : undefined,
    search: get('q'),
  };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const filters = readFilters(searchParams);
  const hasFilters = Boolean(filters.destination || filters.category || filters.date || filters.people);

  const base = pageMetadata({
    title: 'Passeios de barco e experiências náuticas',
    description:
      'Compare passeios de lancha, escuna, catamarã e jet ski de operadores locais. Preço, duração e local de embarque em cada anúncio.',
    path: '/passeios',
  });

  // Combinações de filtro não devem ser indexadas: geram páginas quase iguais
  // e diluem a autoridade das páginas de destino.
  return hasFilters ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function ToursPage({ searchParams }: PageProps) {
  const filters = readFilters(searchParams);

  const [tours, destinations, categories] = await Promise.all([
    listTours(filters),
    listDestinations(),
    listCategories(),
  ]);

  const activeDestination = destinations.find((item) => item.slug === filters.destination);
  const activeCategory = categories.find((item) => item.slug === filters.category);

  const heading = activeDestination
    ? `Passeios em ${activeDestination.name}`
    : activeCategory
      ? `Passeios de ${activeCategory.name.toLowerCase()}`
      : 'Todos os passeios';

  return (
    <div className="shell py-8 sm:py-12">
      <Breadcrumbs items={[{ label: 'Início', href: routes.home() }, { label: 'Passeios' }]} />

      <header className="mt-5 max-w-2xl">
        <h1 className="text-3xl font-bold sm:text-4xl">{heading}</h1>
        <p className="mt-3 text-ink-muted">
          {tours.length} {tours.length === 1 ? 'passeio disponível' : 'passeios disponíveis'}. Preço,
          duração, operador e local de embarque em cada card.
        </p>
      </header>

      <div className="mt-8">
        <Suspense fallback={<div className="h-14" />}>
          <FilterBar destinations={destinations} categories={categories} />
        </Suspense>
      </div>

      {filters.date ? (
        <p className="mt-4 rounded-2xl bg-foam px-4 py-3 text-sm text-ink-muted">
          A disponibilidade por data depende das saídas cadastradas pelo operador e entra junto com a
          integração do NauticFlow. Por enquanto, a data não filtra os resultados.
        </p>
      ) : null}

      <div className="mt-8">
        {tours.length > 0 ? (
          <TourGrid tours={tours} />
        ) : (
          <EmptyState
            title="Nenhum passeio com esses filtros"
            description="Tente ampliar a busca: remova a categoria ou escolha outro destino próximo."
            action={{ label: 'Ver todos os passeios', href: routes.tours() }}
          />
        )}
      </div>
    </div>
  );
}
