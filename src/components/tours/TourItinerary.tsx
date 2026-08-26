import type { ItineraryStop } from '@/types';

/**
 * A numeração aqui carrega informação real: o roteiro é uma sequência e a
 * ordem das paradas importa para quem vai embarcar.
 */
export function TourItinerary({ stops }: { stops: ItineraryStop[] }) {
  if (stops.length === 0) return null;

  return (
    <ol className="space-y-0">
      {stops.map((stop, index) => (
        <li key={`${stop.title}-${index}`} className="flex gap-4">
          <div className="flex flex-col items-center">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foam font-display text-sm font-bold text-sea-dark">
              {index + 1}
            </span>
            {index < stops.length - 1 ? <span className="w-px flex-1 bg-ink/15" aria-hidden /> : null}
          </div>
          <div className="pb-7">
            {stop.time ? (
              <p className="font-mono text-xs font-semibold text-sea">{stop.time}</p>
            ) : null}
            <h3 className="font-display text-base font-bold">{stop.title}</h3>
            {stop.description ? (
              <p className="mt-1 text-sm text-ink-muted">{stop.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
