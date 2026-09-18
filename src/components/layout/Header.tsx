import Link from 'next/link';
import { Search } from 'lucide-react';
import { routes } from '@/lib/routes';
import { LogoLockup } from '@/components/brand/Logo';
import { HeaderNav } from './HeaderNav';
import { MobileMenu } from './MobileMenu';

/**
 * Logo à esquerda, nav centralizada (desktop) e CTA à direita — 3 zonas
 * reais via grid (`auto 1fr auto`), não só logo+nav nos dois extremos com
 * `justify-between` (o meio ficava vazio). `relative` aqui é o que faz o
 * painel do `MobileMenu` (absolute) alinhar certinho com o conteúdo do
 * header, não com a viewport inteira.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="shell relative grid h-16 grid-cols-[auto_1fr_auto] items-center gap-4">
        <Link href={routes.home()} aria-label="ToursFlow, página inicial">
          <LogoLockup size={32} />
        </Link>

        <HeaderNav />

        <div className="flex items-center justify-end gap-2">
          <Link
            href={routes.tours()}
            className="btn-primary hidden h-10 items-center px-5 py-0 text-sm active:scale-[0.98] md:inline-flex"
          >
            <Search size={16} aria-hidden />
            Buscar passeios
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
