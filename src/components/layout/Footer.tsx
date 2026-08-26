import Link from 'next/link';
import { routes } from '@/lib/routes';
import { LogoLockup } from '@/components/brand/Logo';
import type { Destination } from '@/types';
import { site } from '@/lib/site';

export function Footer({ destinations }: { destinations: Destination[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-ink/10 bg-ink text-white">
      <div className="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <LogoLockup size={36} onDark />
          <p className="mt-4 max-w-xs text-sm text-white/70">
            Passeios náuticos de operadores locais, reunidos em um só lugar.
          </p>
        </div>

        <nav aria-label="Destinos">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white/60">
            Destinos
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {destinations.map((destination) => (
              <li key={destination.slug}>
                <Link href={routes.destination(destination.slug)} className="text-white/80 hover:text-white">
                  Passeios em {destination.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Navegar">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white/60">
            Navegar
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href={routes.tours()} className="text-white/80 hover:text-white">
                Todos os passeios
              </Link>
            </li>
            <li>
              <Link href={routes.destinations()} className="text-white/80 hover:text-white">
                Todos os destinos
              </Link>
            </li>
            <li>
              <Link href={routes.category('privativo')} className="text-white/80 hover:text-white">
                Passeios privativos
              </Link>
            </li>
            <li>
              <Link href={routes.category('por-do-sol')} className="text-white/80 hover:text-white">
                Pôr do sol
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white/60">
            Para operadores
          </h2>
          <p className="mt-4 text-sm text-white/70">
            Quem opera passeios usa o NauticFlow para gerenciar embarcações, saídas e reservas, e
            publica no {site.name} para vender direto ao turista.
          </p>
          <a
            href="https://nauticflow.com.br"
            className="mt-4 inline-flex rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            Conhecer o NauticFlow
          </a>
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
