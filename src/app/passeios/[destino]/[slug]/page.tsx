import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowRight, Clock, MapPin, ShieldCheck, Users } from 'lucide-react';
import { getTour, listTourPaths, listTours } from '@/data/repository';
import { TourGallery } from '@/components/tours/TourGallery';
import { TourItinerary } from '@/components/tours/TourItinerary';
import { TourChecklist } from '@/components/tours/TourChecklist';
import { BoardingLocation } from '@/components/tours/BoardingLocation';
import { TourCard } from '@/components/tours/TourCard';
import { Rating } from '@/components/ui/Rating';
import { Price } from '@/components/ui/Price';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { formatDuration } from '@/lib/format';
import { routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';

interface PageProps {
  params: { destino: string; slug: string };
}

export async function generateStaticParams() {
  return listTourPaths();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const tour = await getTour(params.destino, params.slug);
  if (!tour) return {};

  return pageMetadata({
    title: `${tour.name} em ${tour.destination.name}`,
    description: tour.summary,
    path: routes.tour(tour),
    image: tour.images[0]?.url,
  });
}

export default async function TourPage({ params }: PageProps) {
  const tour = await getTour(params.destino, params.slug);
  if (!tour) notFound();

  const related = (await listTours({ destination: tour.destinationSlug }))
    .filter((item) => item.id !== tour.id)
    .slice(0, 3);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: tour.name,
    description: tour.summary,
    touristType: tour.categories.map((category) => category.name),
    provider: { '@type': 'Organization', name: tour.operator.name },
    offers: {
      '@type': 'Offer',
      price: tour.priceFrom,
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      url: `${site.url}${routes.tour(tour)}`,
    },
    ...(tour.rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: tour.rating.average,
            reviewCount: tour.rating.count,
          },
        }
      : {}),
  };

  return (
    <article className="shell py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <Breadcrumbs
        items={[
          { label: 'Início', href: routes.home() },
          { label: 'Passeios', href: routes.tours() },
          { label: tour.destination.name, href: routes.destination(tour.destinationSlug) },
          { label: tour.name },
        ]}
      />

      <header className="mt-5 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          {tour.categories.map((category) => (
            <Link
              key={category.slug}
              href={routes.category(category.slug)}
              className="rounded-full bg-foam px-3 py-1 text-xs font-semibold text-sea-dark"
            >
              {category.icon} {category.name}
            </Link>
          ))}
        </div>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">{tour.name}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
          <Rating rating={tour.rating} showCount />
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15} aria-hidden />
            {tour.boardingPoint.city}/{tour.boardingPoint.state}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock size={15} aria-hidden />
            {formatDuration(tour.durationMinutes)}
          </span>
          {tour.maxPeople ? (
            <span className="inline-flex items-center gap-1.5">
              <Users size={15} aria-hidden />
              até {tour.maxPeople} pessoas
            </span>
          ) : null}
        </div>
      </header>

      <div className="mt-8">
        <TourGallery images={tour.images} title={tour.name} />
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        <div className="space-y-12">
          <section aria-labelledby="sobre">
            <h2 id="sobre" className="text-2xl font-bold">
              Sobre o passeio
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">{tour.description}</p>
          </section>

          <section aria-labelledby="roteiro">
            <h2 id="roteiro" className="text-2xl font-bold">
              Roteiro
            </h2>
            <div className="mt-6">
              <TourItinerary stops={tour.itinerary} />
            </div>
          </section>

          <section aria-labelledby="inclui">
            <h2 id="inclui" className="sr-only">
              O que está incluído
            </h2>
            <TourChecklist included={tour.included} notIncluded={tour.notIncluded} />
          </section>

          <section aria-labelledby="importante">
            <h2 id="importante" className="text-2xl font-bold">
              Informações importantes
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-ink-muted">
              {tour.importantInfo.map((info) => (
                <li key={info} className="flex gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-sun" aria-hidden />
                  {info}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="cancelamento">
            <h2 id="cancelamento" className="text-2xl font-bold">
              Política de cancelamento
            </h2>
            <p className="mt-4 rounded-card border border-ink/10 bg-sand p-5 text-sm text-ink-muted">
              {tour.cancellationPolicy}
            </p>
          </section>

          <section aria-labelledby="operador">
            <h2 id="operador" className="text-2xl font-bold">
              Sobre o operador
            </h2>
            <div className="mt-4 flex gap-4 rounded-card border border-ink/10 bg-white p-5">
              {tour.operator.logoUrl ? (
                <Image
                  src={tour.operator.logoUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full"
                />
              ) : null}
              <div>
                <p className="inline-flex items-center gap-1.5 font-display text-lg font-bold">
                  {tour.operator.name}
                  {tour.operator.verified ? (
                    <ShieldCheck size={16} className="text-sea" aria-label="Operador verificado" />
                  ) : null}
                </p>
                <p className="text-sm text-ink-muted">
                  {tour.operator.city}/{tour.operator.state}
                  {tour.operator.operatingSince ? ` · desde ${tour.operator.operatingSince}` : ''}
                </p>
                {tour.operator.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {tour.operator.description}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-card border border-ink/10 bg-white p-6 shadow-card">
            <Price value={tour.priceFrom} type={tour.priceType} size="lg" />

            <dl className="mt-5 space-y-3 border-t border-ink/10 pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Duração</dt>
                <dd className="font-semibold">{formatDuration(tour.durationMinutes)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Embarque</dt>
                <dd className="text-right font-semibold">{tour.boardingPoint.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Operador</dt>
                <dd className="inline-flex items-center gap-1.5 text-right font-semibold">
                  {tour.operator.logoUrl ? (
                    <Image
                      src={tour.operator.logoUrl}
                      alt=""
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                  ) : null}
                  {tour.operator.verified ? (
                    <ShieldCheck size={14} className="text-sea" aria-hidden />
                  ) : null}
                  {tour.operator.name}
                </dd>
              </div>
            </dl>

            <a href="#embarque" className="btn-primary mt-6 w-full">
              Ver local de embarque
            </a>
            <p className="mt-3 text-center text-xs text-ink-muted">
              Reserva online em breve. Por enquanto, confira o ponto de encontro e fale com o
              operador no local.
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-14">
        <BoardingLocation point={tour.boardingPoint} />
      </div>

      {related.length > 0 ? (
        <section className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-bold">Outros passeios em {tour.destination.name}</h2>
            <Link
              href={routes.destination(tour.destinationSlug)}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-sea hover:text-sea-dark"
            >
              Ver destino
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <TourCard key={item.id} tour={item} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
