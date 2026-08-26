import { listDestinations, listTours } from '@/data/repository';
import { DestinationCard } from '@/components/destinations/DestinationCard';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { pageMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata = pageMetadata({
  title: 'Destinos com passeios náuticos',
  description:
    'Búzios, Arraial do Cabo, Cabo Frio, Angra dos Reis e Paraty: veja os passeios de barco disponíveis em cada destino.',
  path: '/destinos',
});

export default async function DestinationsPage() {
  const [destinations, tours] = await Promise.all([listDestinations(), listTours()]);

  const countByDestination = new Map<string, number>();
  tours.forEach((tour) => {
    countByDestination.set(
      tour.destinationSlug,
      (countByDestination.get(tour.destinationSlug) ?? 0) + 1,
    );
  });

  return (
    <div className="shell py-8 sm:py-12">
      <Breadcrumbs items={[{ label: 'Início', href: routes.home() }, { label: 'Destinos' }]} />

      <header className="mt-5 max-w-2xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Destinos</h1>
        <p className="mt-3 text-ink-muted">
          O tipo de passeio muda com a cidade: água transparente em Arraial, variedade de praias em
          Búzios, ilhas de dia inteiro em Angra.
        </p>
      </header>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((destination) => (
          <div key={destination.slug} className="space-y-3">
            <DestinationCard
              destination={destination}
              tourCount={countByDestination.get(destination.slug)}
              size="lg"
            />
            <p className="text-sm text-ink-muted">{destination.tagline}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
