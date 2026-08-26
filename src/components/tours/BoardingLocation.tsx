import { Compass, Info, Map, Navigation } from 'lucide-react';
import type { BoardingPoint } from '@/types';
import { boardingMapUrl, fullAddress } from '@/lib/maps';
import { formatCheckIn } from '@/lib/format';

/**
 * Local de embarque no formato de cartão de embarque.
 *
 * É a informação que mais gera problema no dia do passeio, então ganha o
 * bloco mais forte da página: endereço, referência, instruções, antecedência
 * e o botão de mapa, tudo em um lugar só.
 */
export function BoardingLocation({ point }: { point: BoardingPoint }) {
  const checkIn = formatCheckIn(point.checkInMinutesBefore);
  const hasCoordinates =
    typeof point.latitude === 'number' && typeof point.longitude === 'number';

  return (
    <section id="embarque" aria-labelledby="embarque-titulo" className="boarding-card">
      <div className="p-6 sm:p-8">
        <p className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-sea-light">
          <Compass size={14} aria-hidden />
          Local de embarque
        </p>

        <h2 id="embarque-titulo" className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">
          {point.name}
        </h2>
        <p className="mt-1 text-white/75">{point.address}</p>
        <p className="text-white/75">{fullAddress(point)}</p>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          {point.reference ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Ponto de referência
              </dt>
              <dd className="mt-1 text-sm text-white/90">{point.reference}</dd>
            </div>
          ) : null}

          {point.instructions ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Instruções
              </dt>
              <dd className="mt-1 text-sm text-white/90">{point.instructions}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="perforation" />

      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="space-y-2 text-sm">
          {checkIn ? (
            <p className="flex items-center gap-2 font-semibold text-white">
              <Info size={15} className="text-sun" aria-hidden />
              {checkIn}
            </p>
          ) : null}
          {hasCoordinates ? (
            <p className="flex items-center gap-2 font-mono text-xs text-white/60">
              <Navigation size={13} aria-hidden />
              {point.latitude?.toFixed(4)}, {point.longitude?.toFixed(4)}
            </p>
          ) : (
            <p className="text-xs text-white/60">
              Coordenadas não informadas pelo operador. O mapa abre pelo endereço.
            </p>
          )}
        </div>

        <a
          href={boardingMapUrl(point)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full shrink-0 sm:w-auto"
        >
          <Map size={17} aria-hidden />
          Ver no mapa
        </a>
      </div>
    </section>
  );
}
