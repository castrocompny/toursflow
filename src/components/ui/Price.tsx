import type { PriceType } from '@/types';
import { formatPrice, priceTypeLabel } from '@/lib/format';

interface PriceProps {
  value: number;
  type: PriceType;
  size?: 'sm' | 'lg';
}

export function Price({ value, type, size = 'sm' }: PriceProps) {
  const isLarge = size === 'lg';

  return (
    <div>
      <p className="text-xs text-ink-muted">A partir de</p>
      <p className={isLarge ? 'font-display text-3xl font-extrabold' : 'font-display text-xl font-bold'}>
        {formatPrice(value)}
        <span className="ml-1 text-sm font-medium text-ink-muted">{priceTypeLabel(type)}</span>
      </p>
    </div>
  );
}
