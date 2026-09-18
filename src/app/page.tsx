import Link from 'next/link';
import { ArrowRight, Compass, MapPin, MessageCircle, ShieldCheck, Ship, Waves } from 'lucide-react';
import { listCategories, listDestinations, listFeaturedTours, listTours } from '@/data/repository';
import { SearchBar } from '@/components/search/SearchBar';
import { TourGrid } from '@/components/tours/TourGrid';
import { DestinationCard } from '@/components/destinations/DestinationCard';
import { CategoryCard } from '@/components/categories/CategoryCard';
import { Section } from '@/components/ui/Section';
import { routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';

export const metadata = pageMetadata({
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  path: '/',
});

export default async function HomePage() {
  const [destinations, categories, featured, allTours] = await Promise.all([
    listDestinations(),
    listCategories(),
    listFeaturedTours(6),
    // Limite alto só para a contagem por destino na home. Numa escala maior
    // isso deveria virar uma métrica agregada própria da API, não uma
    // listagem paginada usada como proxy (ver docs/AUDITORIA-PRE-INTEGRACAO.md).
    listTours({ limit: 100 }),
  ]);

  const countByDestination = new Map<string, number>();
  allTours.tours.forEach((tour) => {
    countByDestination.set(
      tour.destinationSlug,
      (countByDestination.get(tour.destinationSlug) ?? 0) + 1,
    );
  });

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-sea-dark/40 to-transparent"
        />
        <svg
          aria-hidden
          viewBox="0 0 1440 200"
          className="absolute inset-x-0 bottom-0 h-32 w-full text-white"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            d="M0 120c160-40 280 30 440 20s260-60 420-50 260 70 420 50 160-20 160-20v80H0z"
          />
        </svg>

        <div className="shell relative pb-32 pt-16 sm:pb-40 sm:pt-24">
          <p className="eyebrow text-sea-light">Região dos Lagos e Costa Verde</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Encontre seu próximo passeio
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/75">
            Descubra experiências incríveis e encontre o passeio perfeito para sua viagem.
          </p>

          <div className="mt-10 max-w-4xl">
            <SearchBar destinations={destinations} />
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/70">
            <li className="inline-flex items-center gap-2">
              <ShieldCheck size={16} className="text-sea-light" aria-hidden />
              Operadores locais
            </li>
            <li className="inline-flex items-center gap-2">
              <Ship size={16} className="text-sea-light" aria-hidden />
              Lanchas, escunas, catamarãs e jet ski
            </li>
            <li className="inline-flex items-center gap-2">
              <Waves size={16} className="text-sea-light" aria-hidden />
              Local de embarque sempre no anúncio
            </li>
          </ul>
        </div>
      </section>

      {destinations.length > 0 ? (
        <Section
          eyebrow="Destinos"
          title="Para onde você vai"
          description="Cada destino tem um tipo de mar e um tipo de passeio. Comece pela cidade e refine depois."
          action={{ label: 'Ver todos os destinos', href: routes.destinations() }}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {destinations.map((destination) => (
              <DestinationCard
                key={destination.slug}
                destination={destination}
                tourCount={countByDestination.get(destination.slug)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {featured.length > 0 ? (
        <Section
          eyebrow="Mais procurados"
          title="Passeios em destaque"
          description="Passeios selecionados para você descobrir nesta temporada."
          action={{ label: 'Ver todos os passeios', href: routes.tours() }}
          className="bg-sand"
        >
          <TourGrid tours={featured} />
        </Section>
      ) : null}

      <Section
        eyebrow="Categorias"
        title="Que tipo de passeio você quer"
        description="Do compartilhado econômico ao privativo com roteiro livre."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <CategoryCard key={category.slug} category={category} />
          ))}
        </div>
      </Section>

      {/* Alvo de "Como funciona" no header (`/#como-funciona`) — `scroll-mt-16`
          compensa a altura do header sticky (h-16) pra não ficar escondida atrás
          dele ao rolar até aqui. `bg-foam` diferencia esta seção (e o CTA final,
          que mora no mesmo bloco) do branco liso das seções vizinhas. */}
      <section id="como-funciona" className="scroll-mt-16 bg-foam py-14 sm:py-20">
        <div className="shell">
          <div className="grid gap-10 sm:grid-cols-3 sm:divide-x sm:divide-ink/15">
            {[
              {
                title: 'Escolha a experiência',
                text: 'Filtre por destino, tipo de embarcação e número de pessoas. Compare preço e duração lado a lado.',
                icon: Compass,
              },
              {
                title: 'Confira o embarque',
                text: 'Todo anúncio mostra endereço, ponto de referência e antecedência recomendada antes de você decidir.',
                icon: MapPin,
              },
              {
                title: 'Fale com o operador',
                text: 'A operação é de empresas locais. Em breve, a reserva será feita direto por aqui.',
                icon: MessageCircle,
              },
            ].map((item, index) => (
              <div key={item.title} className="group border-t border-ink/15 pt-5 sm:border-t-0 sm:px-8 sm:pt-0 sm:first:pl-0 sm:last:pr-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sea shadow-card transition-transform duration-200 group-hover:-translate-y-0.5">
                    <item.icon size={18} aria-hidden />
                  </span>
                  <span className="font-mono text-xs font-semibold text-sea">0{index + 1}</span>
                </div>
                <h3 className="mt-3 font-display text-lg font-bold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{item.text}</p>
              </div>
            ))}
          </div>
          <Link href={routes.tours()} className="btn-primary mt-10 active:scale-[0.98]">
            Buscar passeios
            <ArrowRight size={17} aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
