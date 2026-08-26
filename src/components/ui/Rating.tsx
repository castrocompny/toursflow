import { Star } from 'lucide-react';
import type { TourRating } from '@/types';
import { formatRating } from '@/lib/format';

interface RatingProps {
  /** Ausente quando o passeio não tem avaliações. Nesse caso nada é renderizado. */
  rating?: TourRating;
  showCount?: boolean;
  className?: string;
}

/**
 * Só aparece quando existe avaliação real. Passeio novo não recebe nota
 * inventada nem "0 estrelas": simplesmente não mostra o bloco.
 */
export function Rating({ rating, showCount = false, className = '' }: RatingProps) {
  if (!rating) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold text-ink ${className}`}>
      <Star size={15} className="fill-sun text-sun" aria-hidden />
      {formatRating(rating.average)}
      {showCount ? (
        <span className="font-normal text-ink-muted">({rating.count} avaliações)</span>
      ) : null}
    </span>
  );
}
