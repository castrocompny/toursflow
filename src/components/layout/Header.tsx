import Link from 'next/link';
import { routes } from '@/lib/routes';
import { LogoLockup } from '@/components/brand/Logo';

const navigation = [
  { label: 'Passeios', href: routes.tours() },
  { label: 'Destinos', href: routes.destinations() },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href={routes.home()} aria-label="ToursFlow, página inicial">
          <LogoLockup size={36} />
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-2">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="btn-ghost text-sm">
              {item.label}
            </Link>
          ))}
          <a
            href="https://nauticflow.com.br"
            className="hidden rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/40 sm:inline-flex"
          >
            Sou operador
          </a>
        </nav>
      </div>
    </header>
  );
}
