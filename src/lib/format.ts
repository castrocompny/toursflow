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
    case 'starting_from':
      // Preço de catálogo, não de uma saída vendável — sem rótulo de "por X".
      return '';
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

/** `en-CA` devolve `YYYY-MM-DD` direto — chave estável pra agrupar saídas do mesmo dia civil (fuso de Brasília), nunca a string localizada (que repete entre meses/anos). */
const departureDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const departureShortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  day: '2-digit',
});

const departureFullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: 'numeric',
  month: 'long',
});

export function departureDateKey(departsAtIso: string): string {
  return departureDateKeyFormatter.format(new Date(departsAtIso));
}

/** Rótulo compacto pra faixa horizontal de datas ("Qui 17") — sem vírgula/ponto do Intl, primeira letra maiúscula. */
export function formatDepartureDateShort(departsAtIso: string): string {
  const parts = departureShortDateFormatter.formatToParts(new Date(departsAtIso));
  const weekday = (parts.find((part) => part.type === 'weekday')?.value ?? '').replace(/\.$/, '');
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}`;
}

/** Data por extenso sem ano ("17 de setembro") — cabeçalho acima da lista de horários de um dia já selecionado. */
export function formatDepartureFullDate(departsAtIso: string): string {
  return departureFullDateFormatter.format(new Date(departsAtIso));
}
