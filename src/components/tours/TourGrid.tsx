import type { TourWithRelations } from '@/types';
import { TourCard } from './TourCard';

interface TourGridProps {
  tours: TourWithRelations[];
  /** Repassado a cada `TourCard` — ver `TourCard`'s `peopleParam`. */
  peopleParam?: number;
}

export function TourGrid({ tours, peopleParam }: TourGridProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {tours.map((tour, index) => (
        <TourCard key={tour.id} tour={tour} priority={index < 3} peopleParam={peopleParam} />
      ))}
    </div>
  );
}
