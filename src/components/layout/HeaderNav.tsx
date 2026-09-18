'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HEADER_NAV_LINKS, isNavLinkActive } from './header-nav-links';

/**
 * Nav central do header, só desktop (`hidden md:flex` — o mobile usa
 * `MobileMenu`, que tem os mesmos 3 links dentro do painel). Único motivo
 * de ser Client Component: `usePathname()` pra marcar a rota atual —
 * mantido pequeno de propósito (só isto, não o header inteiro) pra não
 * aumentar o JS enviado por um detalhe visual.
 */
export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="hidden items-center justify-center gap-1 md:flex">
      {HEADER_NAV_LINKS.map((item) => {
        const active = isNavLinkActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              active ? 'bg-foam text-sea-dark' : 'text-ink hover:bg-sand'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
