import type { TourWithRelations } from '@/types';
import { formatCheckIn, formatDuration, formatPrice, priceTypeLabel } from '@/lib/format';

export interface TourSummaryItem {
  label: string;
  value: string;
}

/**
 * Fatos rápidos do passeio pro bloco "Informações do passeio" (resumo
 * compacto perto do topo) e pra sidebar de desktop — lógica pura, sem
 * JSX, testável sem DOM. Só entra na lista o que a API realmente enviou:
 * `maxPeople`/`checkInMinutesBefore` são opcionais no tipo `Tour`
 * justamente porque nem todo operador cadastra — nunca inventa um valor
 * quando o campo está ausente, o item some em vez de virar placeholder.
 */
export function buildTourSummaryItems(tour: TourWithRelations): TourSummaryItem[] {
  const items: TourSummaryItem[] = [
    { label: 'Duração', value: formatDuration(tour.durationMinutes) },
    { label: `Preço ${priceTypeLabel(tour.priceType)}`.trim(), value: formatPrice(tour.priceFrom) },
    { label: 'Embarque', value: tour.boardingPoint.name },
  ];

  if (tour.maxPeople) {
    items.push({ label: 'Capacidade', value: `Até ${tour.maxPeople} pessoas` });
  }

  const checkIn = formatCheckIn(tour.boardingPoint.checkInMinutesBefore);
  if (checkIn) {
    items.push({ label: 'Check-in', value: checkIn });
  }

  items.push({ label: 'Operador', value: tour.operator.name });

  return items;
}
