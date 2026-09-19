import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowRight, MapPin, ShieldCheck } from 'lucide-react';
import { getTour, listDepartures, listTours } from '@/data/repository';
import { TourGallery } from '@/components/tours/TourGallery';
import { TourItinerary } from '@/components/tours/TourItinerary';
import { TourChecklist } from '@/components/tours/TourChecklist';
import { BoardingLocation } from '@/components/tours/BoardingLocation';
import { BookingSelector } from '@/components/tours/BookingSelector';
import { TourCard } from '@/components/tours/TourCard';
import { Rating } from '@/components/ui/Rating';
import { Price } from '@/components/ui/Price';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { formatDuration, formatLocation } from '@/lib/format';
import { summarizeNextDeparture } from '@/lib/booking-selection';
import { buildTourSummaryItems } from '@/lib/tour-summary';
import { MARKETPLACE_CANCELLATION_POLICY } from '@/lib/marketplace-cancellation-policy';
import { routes } from '@/lib/routes';
import { pageMetadata, toSafeJsonLdScript } from '@/lib/seo';
import { site } from '@/lib/site';

interface PageProps {
  /** Next.js 15: `params` de página passou a ser assíncrono — sempre `await` antes de usar. */
  params: Promise<{ destino: string; slug: string }>;
  /** `pessoas` chega opcionalmente de `/passeios?pessoas=N` (ver `TourCard`) — só uma dica de quantidade inicial pro `BookingSelector`, nunca um filtro. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Sem `generateStaticParams`: esta página busca disponibilidade
 * (`listDepartures`) com `no-store`, que é incompatível com pré-render em
 * build (Next.js rejeita fetch dinâmico dentro de uma rota estática). A
 * renderização por requisição é o comportamento certo aqui — preço e vaga
 * não podem ser congelados no momento do build. O conteúdo (nome,
 * descrição, fotos) continua cacheado pelo `revalidate` de cada fetch,
 * só a rota em si deixa de ser pré-gerada.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { destino, slug } = await params;
  const tour = await getTour(destino, slug);
  if (!tour) return {};

  return pageMetadata({
    title: `${tour.name} em ${tour.destination.name}`,
    description: tour.summary,
    path: routes.tour(tour),
    image: tour.images[0]?.url,
  });
}

export default async function TourPage({ params, searchParams }: PageProps) {
  const { destino, slug } = await params;

  // As 4 chamadas partem juntas: `getTour`, `listDepartures` e `listTours`
  // (relacionados) não dependem uma da outra — todas usam só `destino`/`slug`
  // da própria URL, nunca um campo resolvido de `tour` (ex.: `tour.slug`,
  // que sempre é igual a `slug` quando `getTour` encontra o passeio). Antes,
  // `listDepartures`/`listTours` só começavam DEPOIS de `getTour` responder
  // — um round-trip inteiro perdido à toa no caminho mais comum (passeio
  // existe). No caso raro de 404, os resultados de `listDepartures`/
  // `listTours` chegam mas são descartados — troca aceitável por uma
  // navegação mais rápida na esmagadora maioria dos acessos.
  const [tour, departures, relatedResult, resolvedSearchParams] = await Promise.all([
    getTour(destino, slug),
    listDepartures(slug),
    listTours({ destination: destino, limit: 4 }),
    searchParams,
  ]);
  if (!tour) notFound();

  const related = relatedResult.tours.filter((item) => item.id !== tour.id).slice(0, 3);

  // Só uma dica de quantidade inicial pro BookingSelector (ex.: vindo de
  // `/passeios?pessoas=4`) — nunca um filtro real de disponibilidade; a
  // saída escolhida sempre reajusta pra baixo via `clampQuantity` se tiver
  // menos vagas do que isso.
  const pessoasRaw = resolvedSearchParams.pessoas;
  const pessoasValue = Number(Array.isArray(pessoasRaw) ? pessoasRaw[0] : pessoasRaw);
  const initialQuantityHint = Number.isFinite(pessoasValue) && pessoasValue > 0 ? pessoasValue : undefined;

  // Só a partir das saídas já recebidas — nenhuma chamada nova. `summarizeNextDeparture`
  // usa o instante real do servidor (a rota já é `force-dynamic`/`no-store`).
  const nextDepartureSummary = summarizeNextDeparture(departures);
  const summaryItems = buildTourSummaryItems(tour);

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
    <article className="shell py-6 sm:py-12">
      {/* Campos como tour.name/summary vêm do catálogo do NauticFlow — não são
          texto de confiança total do ToursFlow. toSafeJsonLdScript() escapa
          "<" para evitar que um valor contendo "</script>" feche a tag e
          injete HTML/script (ver src/lib/seo.ts e src/lib/seo.test.ts). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toSafeJsonLdScript(structuredData) }} />

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
        {/* Duração/capacidade saíram daqui pro bloco "Informações do passeio" logo
            abaixo — mostrar os dois em sequência seria repetir a mesma informação
            duas vezes na mesma página. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
          <Rating rating={tour.rating} showCount />
          {formatLocation(tour.boardingPoint.city, tour.boardingPoint.state) ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} aria-hidden />
              {formatLocation(tour.boardingPoint.city, tour.boardingPoint.state)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mt-6 sm:mt-8">
        <TourGallery images={tour.images} title={tour.name} />
      </div>

      {/* "Resumo do passeio" — fatos rápidos pra decisão sem precisar ler tudo
          embaixo. Só os campos que `buildTourSummaryItems` decidiu mostrar
          (nunca inventa um campo ausente na API) + próxima saída, calculada
          só a partir das saídas já buscadas (sem request novo). */}
      <section aria-labelledby="informacoes" className="mt-6 sm:mt-8">
        <h2 id="informacoes" className="sr-only">
          Informações do passeio
        </h2>
        <div className="rounded-card border border-ink/10 bg-sand p-4 sm:p-6">
          <p className="text-sm font-semibold text-ink">Informações do passeio</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:mt-4 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-4">
            {summaryItems.map((item) => (
              <div key={item.label} className={item.label === 'Operador' ? 'col-span-2 sm:col-span-1' : undefined}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted sm:text-xs">
                  {item.label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink sm:text-base">{item.value}</dd>
              </div>
            ))}
          </dl>
          {/* Faixa separada — próxima saída é a informação mais "acionável" do
              bloco, por isso ganha um destaque visual leve (fundo próprio) só
              no mobile, onde cada linha extra pesa mais na altura da página. */}
          <div className="mt-3 rounded-lg bg-white/60 px-3 py-2 sm:mt-4 sm:rounded-none sm:bg-transparent sm:border-t sm:border-ink/10 sm:px-0 sm:py-0 sm:pt-4">
            {nextDepartureSummary ? (
              <p className="text-sm text-ink">
                <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted sm:text-xs">
                  Próxima saída
                </span>{' '}
                <span className="font-semibold">
                  {nextDepartureSummary.label} · {nextDepartureSummary.spotsLabel}
                </span>
              </p>
            ) : (
              <p className="text-sm text-ink-muted">Sem novas saídas disponíveis no momento.</p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-8 sm:mt-10 sm:gap-10 lg:grid-cols-[1fr_360px] lg:gap-12">
        <div className="space-y-8 sm:space-y-12">
          <section aria-labelledby="sobre">
            <h2 id="sobre" className="text-xl font-bold sm:text-2xl">
              Sobre o passeio
            </h2>
            <p className="mt-3 leading-relaxed text-ink-muted sm:mt-4">{tour.description}</p>
          </section>

          <section aria-labelledby="saidas">
            <h2 id="saidas" className="text-xl font-bold sm:text-2xl">
              Datas e horários disponíveis
            </h2>
            <div className="mt-4 sm:mt-6">
              <BookingSelector
                departures={departures}
                initialQuantityHint={initialQuantityHint}
                durationMinutes={tour.durationMinutes}
              />
            </div>
          </section>

          <section aria-labelledby="roteiro">
            <h2 id="roteiro" className="text-xl font-bold sm:text-2xl">
              Roteiro
            </h2>
            <div className="mt-4 sm:mt-6">
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
            <h2 id="importante" className="text-xl font-bold sm:text-2xl">
              Informações importantes
            </h2>
            <ul className="mt-3 space-y-3 text-sm text-ink-muted sm:mt-4">
              {tour.importantInfo.map((info) => (
                <li key={info} className="flex gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-sun" aria-hidden />
                  {info}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="cancelamento">
            <h2 id="cancelamento" className="text-xl font-bold sm:text-2xl">
              {MARKETPLACE_CANCELLATION_POLICY.title}
            </h2>
            <p className="mt-3 rounded-card border border-ink/10 bg-sand p-4 text-sm text-ink-muted sm:mt-4 sm:p-5">
              {MARKETPLACE_CANCELLATION_POLICY.summary}
            </p>
          </section>

          <section aria-labelledby="operador">
            <h2 id="operador" className="text-xl font-bold sm:text-2xl">
              Sobre o operador
            </h2>
            <div className="mt-3 flex gap-4 rounded-card border border-ink/10 bg-white p-4 sm:mt-4 sm:p-5">
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
                {formatLocation(tour.operator.city, tour.operator.state) || tour.operator.operatingSince ? (
                  <p className="text-sm text-ink-muted">
                    {formatLocation(tour.operator.city, tour.operator.state)}
                    {tour.operator.operatingSince ? ` · desde ${tour.operator.operatingSince}` : ''}
                  </p>
                ) : null}
                {tour.operator.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {tour.operator.description}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {/* Some no mobile: repete Duração/Embarque/Operador/Próxima saída (já
            resumidos no card "Informações do passeio" logo abaixo do título) e
            "Ver datas e horários" só rola até uma seção que, no fluxo mobile
            (sem esta coluna lateral), o visitante já viu/usou bem antes de
            chegar aqui embaixo. Em telas lg+ ela é a sidebar sticky de sempre. */}
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:h-fit">
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
              {nextDepartureSummary ? (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Próxima saída</dt>
                    <dd className="text-right font-semibold">{nextDepartureSummary.label}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Vagas</dt>
                    <dd className="text-right font-semibold">{nextDepartureSummary.spotsLabel}</dd>
                  </div>
                </>
              ) : (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Próxima saída</dt>
                  <dd className="text-right font-semibold text-ink-muted">Sem novas saídas</dd>
                </div>
              )}
            </dl>

            <a href="#saidas" className="btn-primary mt-6 w-full active:scale-[0.98]">
              Ver datas e horários
            </a>
          </div>
        </aside>
      </div>

      <div className="mt-10 sm:mt-14">
        <BoardingLocation point={tour.boardingPoint} />
      </div>

      {related.length > 0 ? (
        <section className="mt-12 sm:mt-16">
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
