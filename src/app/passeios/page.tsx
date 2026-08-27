import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { listCategories, listDestinations, listTours } from '@/data/repository';
import { FilterBar } from '@/components/search/FilterBar';
import { TourGrid } from '@/components/tours/TourGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { pageMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import type { TourFilters } from '@/types';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

function readFilters(searchParams: PageProps['searchParams']): TourFilters {
  const get = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const people = Number(get('pessoas'));
  const page = Number(get('page'));

  return {
    destination: get('destino'),
    category: get('categoria'),
    date: get('data'),
    people: Number.isFinite(people) && people > 0 ? people : undefined,
    search: get('q'),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: PAGE_SIZE,
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

  const [tourResult, destinations, categories] = await Promise.all([
    listTours(filters),
    listDestinations(),
    listCategories(),
  ]);
  const { tours, total, page, totalPages } = tourResult;

  const activeDestination = destinations.find((item) => item.slug === filters.destination);
  const activeCategory = categories.find((item) => item.slug === filters.category);

  const heading = activeDestination
    ? `Passeios em ${activeDestination.name}`
    : activeCategory
      ? `Passeios de ${activeCategory.name.toLowerCase()}`
      : 'Todos os passeios';

  const pageQuery = (targetPage: number) => ({
    destino: filters.destination,
    categoria: filters.category,
    data: filters.date,
    pessoas: filters.people,
    q: filters.search,
    page: targetPage > 1 ? targetPage : undefined,
  });

  return (
    <div className="shell py-8 sm:py-12">
      <Breadcrumbs items={[{ label: 'Início', href: routes.home() }, { label: 'Passeios' }]} />

      <header className="mt-5 max-w-2xl">
        <h1 className="text-3xl font-bold sm:text-4xl">{heading}</h1>
        <p className="mt-3 text-ink-muted">
          {total} {total === 1 ? 'passeio disponível' : 'passeios disponíveis'}. Preço, duração,
          operador e local de embarque em cada card.
        </p>
      </header>

      <div className="mt-8">
        <Suspense fallback={<div className="h-14" />}>
          <FilterBar destinations={destinations} categories={categories} />
        </Suspense>
      </div>

      {filters.date || filters.people || filters.search ? (
        <p className="mt-4 rounded-2xl bg-foam px-4 py-3 text-sm text-ink-muted">
          Data, número de pessoas e busca por texto ainda não filtram os resultados — dependem de
          saídas e busca ainda não conectadas na integração com o NauticFlow. Os filtros de destino e
          categoria já refletem o catálogo real.
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

      {totalPages > 1 ? (
        <nav aria-label="Paginação" className="mt-10 flex items-center justify-center gap-3">
          <Link
            href={routes.tours(pageQuery(page - 1))}
            aria-disabled={page <= 1}
            className={`inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold ${
              page <= 1 ? 'pointer-events-none opacity-40' : 'hover:border-ink/40'
            }`}
          >
            <ChevronLeft size={16} aria-hidden />
            Anterior
          </Link>
          <span className="text-sm text-ink-muted">
            Página {page} de {totalPages}
          </span>
          <Link
            href={routes.tours(pageQuery(page + 1))}
            aria-disabled={page >= totalPages}
            className={`inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold ${
              page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:border-ink/40'
            }`}
          >
            Próxima
            <ChevronRight size={16} aria-hidden />
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
