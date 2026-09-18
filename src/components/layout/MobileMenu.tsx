'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
import { routes } from '@/lib/routes';
import { HEADER_NAV_LINKS, isNavLinkActive } from './header-nav-links';

/**
 * Botão de menu + painel, só mobile (`md:hidden`). Sem biblioteca externa —
 * `useState` pro aberto/fechado, mesmos 3 links de `HeaderNav` mais o CTA
 * "Buscar passeios" (que no desktop já aparece solto ao lado). Fecha ao
 * navegar (clique direto no link já chama `setOpen(false)`; o `useEffect`
 * cobre também voltar/avançar pelo navegador, que muda `pathname` sem
 * passar pelo `onClick`).
 */
export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/15 text-ink transition active:scale-90"
      >
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>

      {open ? (
        <div id={panelId} className="absolute inset-x-0 top-16 rounded-b-card border-b border-ink/10 bg-white shadow-lift">
          <nav aria-label="Principal" className="flex flex-col gap-1 px-5 py-4">
            {HEADER_NAV_LINKS.map((item) => {
              const active = isNavLinkActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] items-center rounded-xl px-4 text-base font-semibold transition-colors ${
                    active ? 'bg-foam text-sea-dark' : 'text-ink hover:bg-sand'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href={routes.tours()}
              onClick={() => setOpen(false)}
              className="btn-primary mt-2 min-h-[44px] justify-center active:scale-[0.98]"
            >
              <Search size={16} aria-hidden />
              Buscar passeios
            </Link>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
