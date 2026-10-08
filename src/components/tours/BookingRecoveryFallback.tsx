'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PAYMENTS_UI_ENABLED } from '@/lib/feature-flags';
import { findBookingRecovery } from '@/lib/booking-recovery';
import { BookingSelector } from './BookingSelector';

/** `/passeios/{destino}/{slug}` → `slug` (= `tour.slug`, o mesmo gravado na recuperação). */
function tourSlugFromPathname(pathname: string | null): string | null {
  const match = pathname?.match(/^\/passeios\/[^/]+\/([^/?#]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Recuperação de compra independente do catálogo de VENDA (achado HIGH do
 * Codex, 07/10/2026). Usado pelos boundaries `not-found.tsx`/`error.tsx`
 * da página do passeio: se o passeio foi despublicado (`getTour` → null) ou
 * o catálogo falhou, e esta aba tem uma reserva recuperável deste passeio
 * (`booking-recovery.ts`), monta o fluxo de recuperação do `BookingSelector`
 * — só GET autoritativo, nunca POST automático — em vez do 404/erro. Sem
 * reserva salva (ou depois de "Fazer outra reserva"/`BOOKING_NOT_FOUND`),
 * mostra `children` (o 404/erro público de sempre; o status HTTP 404 do
 * servidor não muda).
 */
export function BookingRecoveryFallback({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [tourSlug, setTourSlug] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Só no cliente (sessionStorage); o HTML do servidor é sempre o fallback.
  useEffect(() => {
    if (!PAYMENTS_UI_ENABLED) return;
    const slug = tourSlugFromPathname(pathname);
    if (slug && findBookingRecovery(slug)) setTourSlug(slug);
  }, [pathname]);

  if (!tourSlug || dismissed) return <>{children}</>;

  return (
    <div className="shell py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow">Sua reserva</p>
        <h1 className="mt-2 text-2xl font-extrabold">Acompanhe sua reserva</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Este passeio não está disponível para novas reservas agora, mas a sua reserva continua acessível.
        </p>
        <div className="mt-6">
          <BookingSelector departures={[]} tourSlug={tourSlug} onRecoveryDismissed={() => setDismissed(true)} />
        </div>
      </div>
    </div>
  );
}
