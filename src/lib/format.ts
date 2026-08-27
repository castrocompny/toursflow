import type { PriceType } from '@/types';

/** Preço em real (padrão brasileiro: sempre duas casas, ex.: R$150,00). */
const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(value: number): string {
  return brl.format(value);
}

/** A API do NauticFlow devolve preço em centavos (ex.: 15000 = R$150,00). */
export function centsToReais(cents: number): number {
  return cents / 100;
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

/** "Cidade/UF", só "Cidade" ou string vazia — nunca "/undefined". */
export function formatLocation(city?: string, state?: string): string {
  return [city, state].filter(Boolean).join('/');
}

export function formatRating(average: number): string {
  return average.toFixed(1).replace('.', ',');
}

export function formatCheckIn(minutes?: number): string | undefined {
  if (!minutes) return undefined;
  return `Chegue ${minutes} minutos antes do horário de saída.`;
}

const departureDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

const departureTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * `departsAt` chega em UTC. A conversão para horário de Brasília usa o
 * timezone `America/Sao_Paulo` via Intl, nunca um offset fixo "-3h" —
 * isso quebraria em horário de verão ou se o servidor mudar de fuso.
 */
export function formatDepartureDateTime(departsAtIso: string): { date: string; time: string } {
  const instant = new Date(departsAtIso);
  return {
    date: departureDateFormatter.format(instant),
    time: departureTimeFormatter.format(instant),
  };
}
