import type { TourWithRelations } from '@/types';
import { TourCard } from './TourCard';

export function TourGrid({ tours }: { tours: TourWithRelations[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {tours.map((tour, index) => (
        <TourCard key={tour.id} tour={tour} priority={index < 3} />
      ))}
    </div>
  );
}
