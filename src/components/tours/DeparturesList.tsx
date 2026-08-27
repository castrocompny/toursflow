'use client';

import { useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import type { Departure } from '@/types';
import { formatDepartureDateTime, formatPrice, priceTypeLabel } from '@/lib/format';

interface DeparturesListProps {
  departures: Departure[];
}

/**
 * Lista de saídas reais do passeio. A seleção aqui é só de interface —
 * ainda não existe reserva. Nunca usa a palavra "departure" no texto
 * visível: para o turista isso é "data", "horário" e "disponibilidade".
 */
export function DeparturesList({ departures }: DeparturesListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (departures.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-ink/20 bg-sand px-5 py-6 text-center text-sm text-ink-muted">
        Nenhuma saída programada no momento. Fale com o operador para saber a próxima disponibilidade.
      </p>
    );
  }

  const sorted = [...departures].sort(
    (a, b) => new Date(a.departsAt).getTime() - new Date(b.departsAt).getTime(),
  );

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {sorted.map((departure) => {
        const { date, time } = formatDepartureDateTime(departure.departsAt);
        const isSelected = selectedId === departure.id;

        return (
          <li key={departure.id}>
            <button
              type="button"
              disabled={departure.soldOut}
              aria-pressed={isSelected}
              onClick={() => setSelectedId(departure.id)}
              className={`flex w-full flex-col gap-2 rounded-card border p-4 text-left transition-colors ${
                departure.soldOut
                  ? 'cursor-not-allowed border-ink/10 bg-sand opacity-60'
                  : isSelected
                    ? 'border-sea bg-foam'
                    : 'border-ink/15 bg-white hover:border-sea'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold capitalize text-ink">
                  <Calendar size={14} aria-hidden />
                  {date}
                </span>
                {departure.soldOut ? (
                  <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold text-ink-muted">
                    Esgotado
                  </span>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
                <Clock size={14} aria-hidden />
                {time}
              </span>
              <span className="font-display text-base font-bold text-ink">
                {formatPrice(departure.price)}{' '}
                <span className="text-xs font-medium text-ink-muted">
                  {priceTypeLabel(departure.priceType)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
