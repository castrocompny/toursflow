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

const departureWeekdayLongFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
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

type RelativeDay = 'today' | 'tomorrow' | 'other';

/**
 * Compara o dia civil de `departsAtIso` com o de `nowIso`, sempre em
 * America/Sao_Paulo — base de `formatNextDepartureLabel` e
 * `formatRelativeDepartureDate`, pra não duplicar a mesma conta de "dia
 * seguinte" duas vezes. Meio-dia UTC como âncora pro cálculo de amanhã:
 * sempre cai no meio do dia em Brasília (UTC-3), então somar 24h e
 * reformatar nunca cruza uma borda de dia por causa de horário de verão.
 */
function classifyRelativeDay(departsAtIso: string, nowIso: string): RelativeDay {
  const departureKey = departureDateKey(departsAtIso);
  const todayKey = departureDateKey(nowIso);
  if (departureKey === todayKey) return 'today';

  const tomorrowKey = departureDateKeyFormatter.format(
    new Date(new Date(`${todayKey}T12:00:00Z`).getTime() + 24 * 60 * 60 * 1000),
  );
  if (departureKey === tomorrowKey) return 'tomorrow';

  return 'other';
}

/**
 * Rótulo da "próxima saída" ("Hoje às 15:30", "Amanhã às 09:00", "17 de
 * setembro às 15:30") — sempre relativo a `nowIso` (injetável pra teste;
 * em produção é o instante real do servidor, a rota já é dinâmica/sem
 * cache).
 */
export function formatNextDepartureLabel(departsAtIso: string, nowIso: string = new Date().toISOString()): string {
  const time = departureTimeFormatter.format(new Date(departsAtIso));
  const relative = classifyRelativeDay(departsAtIso, nowIso);

  if (relative === 'today') return `Hoje às ${time}`;
  if (relative === 'tomorrow') return `Amanhã às ${time}`;
  return `${formatDepartureFullDate(departsAtIso)} às ${time}`;
}

/**
 * Cabeçalho de data por extenso e relativo ("Hoje, quinta-feira", "Amanhã,
 * sexta-feira", "Sábado, 19 de setembro") — usado no destaque da próxima
 * saída e em qualquer data escolhida no `BookingSelector`. Sem horário
 * (ver `formatNextDepartureLabel` pra isso).
 */
export function formatRelativeDepartureDate(
  departsAtIso: string,
  nowIso: string = new Date().toISOString(),
): string {
  const weekday = departureWeekdayLongFormatter.format(new Date(departsAtIso));
  const relative = classifyRelativeDay(departsAtIso, nowIso);

  if (relative === 'today') return `Hoje, ${weekday}`;
  if (relative === 'tomorrow') return `Amanhã, ${weekday}`;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDepartureFullDate(departsAtIso)}`;
}

/**
 * Horário final = `departsAt + durationMinutes` — NUNCA inventado. `null`
 * quando `durationMinutes` está ausente/inválido (0, negativo, NaN,
 * fracionário não faz sentido pra duração em minutos mas não é
 * bloqueado aqui, só valores claramente inválidos são).
 */
export function formatDepartureEndTime(departsAtIso: string, durationMinutes: number | undefined): string | null {
  if (!Number.isFinite(durationMinutes) || (durationMinutes as number) <= 0) return null;
  const end = new Date(new Date(departsAtIso).getTime() + (durationMinutes as number) * 60 * 1000);
  return departureTimeFormatter.format(end);
}

/**
 * "09:00 às 14:00" quando `durationMinutes` é válido, senão só "09:00" —
 * nunca um horário final inventado (ver `formatDepartureEndTime`).
 */
export function formatDepartureTimeRange(departsAtIso: string, durationMinutes?: number): string {
  const start = departureTimeFormatter.format(new Date(departsAtIso));
  const end = formatDepartureEndTime(departsAtIso, durationMinutes);
  return end ? `${start} às ${end}` : start;
}
