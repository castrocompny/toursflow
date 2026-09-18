import Link from 'next/link';
import { routes } from '@/lib/routes';
import { LogoLockup } from '@/components/brand/Logo';
import type { Destination } from '@/types';
import { site } from '@/lib/site';

// Cap visual para a coluna Destinos do footer — a lista completa de destinos
// reais (vinda da API/repository, sem cidades fixas no código) continua
// acessível via "Ver todos os destinos".
const FOOTER_DESTINATION_LIMIT = 6;

export function Footer({ destinations }: { destinations: Destination[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-ink/10 bg-ink text-white">
      <div className="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <LogoLockup size={36} onDark />
          <p className="mt-4 max-w-xs text-sm text-white/70">
            Passeios e experiências em diferentes destinos, reunidos em um só lugar.
          </p>
        </div>

        <nav aria-label="Explorar">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white/60">
            Explorar
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href={routes.tours()} className="text-white/80 transition-colors duration-150 hover:text-white">
                Todos os passeios
              </Link>
            </li>
            <li>
              <Link href={routes.destinations()} className="text-white/80 transition-colors duration-150 hover:text-white">
                Todos os destinos
              </Link>
            </li>
            <li>
              <Link href={routes.category('passeio_privativo')} className="text-white/80 transition-colors duration-150 hover:text-white">
                Passeios privativos
              </Link>
            </li>
            <li>
              <Link href={routes.category('passeio_compartilhado')} className="text-white/80 transition-colors duration-150 hover:text-white">
                Passeios compartilhados
              </Link>
            </li>
            <li>
              <Link href={routes.howItWorks()} className="text-white/80 transition-colors duration-150 hover:text-white">
                Como funciona
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Destinos">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white/60">
            Destinos
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {destinations.slice(0, FOOTER_DESTINATION_LIMIT).map((destination) => (
              <li key={destination.slug}>
                <Link href={routes.destination(destination.slug)} className="text-white/80 transition-colors duration-150 hover:text-white">
                  Passeios em {destination.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href={routes.destinations()} className="font-semibold text-sea-light transition-colors duration-150 hover:text-white">
                Ver todos os destinos →
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white/60">
            Tecnologia
          </h2>
          <p className="mt-4 text-sm text-white/80">
            Um produto desenvolvido pela <span className="font-semibold text-white">Castro Compny</span>
          </p>
          <p className="mt-1 text-xs text-white/50">Agência de tecnologia</p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="shell flex flex-col gap-2 py-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}. {site.domain}
          </p>
          <p>Passeios operados por empresas independentes, cada uma responsável por sua operação.</p>
        </div>
      </div>
    </footer>
  );
}
