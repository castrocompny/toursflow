import type { PriceType } from '@/types';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return brl.format(value);
}

export function priceTypeLabel(type: PriceType): string {
  switch (type) {
    case 'per_person':
      return 'por pessoa';
    case 'per_group':
      return 'por grupo';
    case 'per_boat':
      return 'por embarcação';
  }
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return hours === 1 ? '1 hora' : `${hours} horas`;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

export function formatRating(average: number): string {
  return average.toFixed(1).replace('.', ',');
}

export function formatCheckIn(minutes?: number): string | undefined {
  if (!minutes) return undefined;
  return `Chegue ${minutes} minutos antes do horário de saída.`;
}
