import Image from 'next/image';
import Link from 'next/link';
import type { Destination } from '@/types';
import { routes } from '@/lib/routes';

interface DestinationCardProps {
  destination: Destination;
  tourCount?: number;
  size?: 'sm' | 'lg';
}

export function DestinationCard({ destination, tourCount, size = 'sm' }: DestinationCardProps) {
  return (
    <Link
      href={routes.destination(destination.slug)}
      className={`group relative block overflow-hidden rounded-card ${
        size === 'lg' ? 'aspect-[4/5]' : 'aspect-[4/3]'
      }`}
    >
      <Image
        src={destination.image}
        alt={`Passeios em ${destination.name}`}
        fill
        sizes="(max-width: 640px) 50vw, 25vw"
        className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" aria-hidden />
      <span className="absolute inset-x-0 bottom-0 p-5 text-white">
        <span className="block font-display text-xl font-bold">{destination.name}</span>
        <span className="mt-0.5 block text-sm text-white/80">
          {typeof tourCount === 'number'
            ? `${tourCount} ${tourCount === 1 ? 'passeio' : 'passeios'}`
            : destination.state}
        </span>
      </span>
    </Link>
  );
}
