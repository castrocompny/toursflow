import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { getDestination, listDestinations, listTours } from '@/data/repository';
import { TourGrid } from '@/components/tours/TourGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { SearchBar } from '@/components/search/SearchBar';
import { pageMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

interface PageProps {
  params: { slug: string };
}

export async function generateStaticParams() {
  const destinations = await listDestinations();
  return destinations.map((destination) => ({ slug: destination.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const destination = await getDestination(params.slug);
  if (!destination) return {};

  return pageMetadata({
    title: `Passeios de barco em ${destination.name}`,
    description: `${destination.tagline}. Veja passeios de lancha, escuna e catamarã em ${destination.name}/${destination.state}, com preço, duração e local de embarque.`,
    path: routes.destination(destination.slug),
    image: destination.image,
  });
}

export default async function DestinationPage({ params }: PageProps) {
  const destination = await getDestination(params.slug);
  if (!destination) notFound();

  const [tours, destinations] = await Promise.all([
    listTours({ destination: destination.slug }),
    listDestinations(),
  ]);

  return (
    <div>
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <Image
          src={destination.image}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-45"
        />
        <div className="shell relative py-16 sm:py-24">
          <Breadcrumbs
            items={[
              { label: 'Início', href: routes.home() },
              { label: 'Destinos', href: routes.destinations() },
              { label: destination.name },
            ]}
          />
          <h1 className="mt-5 font-display text-4xl font-extrabold sm:text-5xl">
            Passeios de barco em {destination.name}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-white/80">{destination.tagline}</p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
            {destination.highlights.map((highlight) => (
              <li key={highlight} className="inline-flex items-center gap-2">
                <Check size={15} className="text-sea-light" aria-hidden />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="shell -mt-8 sm:-mt-10">
        <SearchBar destinations={destinations} defaultDestination={destination.slug} />
      </div>

      <div className="shell py-12">
        <p className="max-w-3xl leading-relaxed text-ink-muted">{destination.description}</p>

        <h2 className="mt-12 text-2xl font-bold sm:text-3xl">
          {tours.length} {tours.length === 1 ? 'passeio disponível' : 'passeios disponíveis'} em{' '}
          {destination.name}
        </h2>

        <div className="mt-8">
          {tours.length > 0 ? (
            <TourGrid tours={tours} />
          ) : (
            <EmptyState
              title={`Ainda não há passeios publicados em ${destination.name}`}
              description="Os operadores desta região estão sendo cadastrados. Enquanto isso, veja o que está disponível nos destinos vizinhos."
              action={{ label: 'Ver todos os passeios', href: routes.tours() }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
