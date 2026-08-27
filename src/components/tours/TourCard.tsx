import Image from 'next/image';
import Link from 'next/link';
import { Clock, ImageOff, MapPin, ShieldCheck } from 'lucide-react';
import type { TourWithRelations } from '@/types';
import { formatDuration } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Rating } from '@/components/ui/Rating';
import { Price } from '@/components/ui/Price';

interface TourCardProps {
  tour: TourWithRelations;
  /** Primeiros cards da página carregam a imagem com prioridade (LCP). */
  priority?: boolean;
}

export function TourCard({ tour, priority = false }: TourCardProps) {
  const cover = tour.images[0];
  const href = routes.tour(tour);
  const mainCategory = tour.categories[0];

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-ink/10 bg-white shadow-card transition-shadow duration-200 hover:shadow-lift">
      <div className="relative aspect-[4/3] overflow-hidden bg-foam">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink/25">
            <ImageOff size={32} aria-hidden />
          </div>
        )}
        {mainCategory ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-ink shadow-sm">
            <span aria-hidden>{mainCategory.icon}</span>
            {mainCategory.name}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-bold leading-snug">
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {tour.name}
            </Link>
          </h3>
          <Rating rating={tour.rating} />
        </div>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
          <li className="inline-flex items-center gap-1.5">
            <MapPin size={14} aria-hidden />
            {tour.destination.name}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden />
            {formatDuration(tour.durationMinutes)}
          </li>
        </ul>

        <p className="text-sm text-ink-muted line-clamp-2">{tour.summary}</p>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-ink/10 pt-4">
          <div>
            <Price value={tour.priceFrom} type={tour.priceType} />
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
              {tour.operator.logoUrl ? (
                <Image
                  src={tour.operator.logoUrl}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-full"
                />
              ) : null}
              {tour.operator.verified ? <ShieldCheck size={13} className="text-sea" aria-hidden /> : null}
              {tour.operator.name}
            </p>
          </div>
          <span className="relative z-10 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-sea">
            Ver passeio
          </span>
        </div>
      </div>
    </article>
  );
}
