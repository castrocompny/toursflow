import RootNotFound from '@/app/not-found';
import { BookingRecoveryFallback } from '@/components/tours/BookingRecoveryFallback';

/**
 * Passeio inexistente/despublicado: mesmo 404 público de sempre — a não ser
 * que esta aba tenha uma compra deste passeio para recuperar (ver
 * `BookingRecoveryFallback`). O status HTTP continua 404.
 */
export default function TourNotFound() {
  return (
    <BookingRecoveryFallback>
      <RootNotFound />
    </BookingRecoveryFallback>
  );
}
