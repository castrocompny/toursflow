'use client';

import RootError from '@/app/error';
import { BookingRecoveryFallback } from '@/components/tours/BookingRecoveryFallback';

/**
 * Falha do catálogo (passeio/saídas) nesta página: mesmo erro temporário de
 * sempre — a não ser que esta aba tenha uma compra deste passeio para
 * recuperar, que não depende do catálogo (ver `BookingRecoveryFallback`).
 */
export default function TourError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <BookingRecoveryFallback>
      <RootError {...props} />
    </BookingRecoveryFallback>
  );
}
