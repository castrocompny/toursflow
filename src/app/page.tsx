import Link from 'next/link';
import { ArrowRight, ShieldCheck, Ship, Waves } from 'lucide-react';
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
    listTours(),
  ]);

  const countByDestination = new Map<string, number>();
  allTours.forEach((tour) => {
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
              Operadores locais verificados
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

      <Section
        eyebrow="Mais procurados"
        title="Passeios em destaque"
        description="Seleção do que mais sai nesta temporada, de operadores que já rodam com agenda cheia."
        action={{ label: 'Ver todos os passeios', href: routes.tours() }}
        className="bg-sand"
      >
        <TourGrid tours={featured} />
      </Section>

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

      <section className="shell pb-6">
        <div className="grid items-center gap-8 rounded-card bg-foam p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow">Para operadores</p>
            <h2 className="mt-2 text-3xl font-bold">
              Opera passeios? Publique sua agenda no ToursFlow
            </h2>
            <p className="mt-3 max-w-xl text-ink-muted">
              Quem gerencia embarcações, saídas e reservas no NauticFlow publica os passeios aqui e
              alcança o turista que ainda não conhece a sua empresa.
            </p>
          </div>
          <a href="https://nauticflow.com.br" className="btn-primary w-full sm:w-auto lg:justify-self-end">
            Conhecer o NauticFlow
            <ArrowRight size={17} aria-hidden />
          </a>
        </div>
      </section>

      <section className="shell py-14">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              title: 'Escolha a experiência',
              text: 'Filtre por destino, tipo de embarcação e número de pessoas. Compare preço e duração lado a lado.',
            },
            {
              title: 'Confira o embarque',
              text: 'Todo anúncio mostra endereço, ponto de referência e antecedência recomendada antes de você decidir.',
            },
            {
              title: 'Fale com o operador',
              text: 'A operação é de empresas locais. Em breve, a reserva será feita direto por aqui.',
            },
          ].map((item, index) => (
            <div key={item.title} className="border-t border-ink/15 pt-5">
              <span className="font-mono text-xs font-semibold text-sea">0{index + 1}</span>
              <h3 className="mt-2 font-display text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{item.text}</p>
            </div>
          ))}
        </div>
        <Link href={routes.tours()} className="btn-primary mt-10">
          Buscar passeios
          <ArrowRight size={17} aria-hidden />
        </Link>
      </section>
    </>
  );
}
