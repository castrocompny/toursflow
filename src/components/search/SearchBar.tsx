'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import type { Destination } from '@/types';
import { routes } from '@/lib/routes';

interface SearchBarProps {
  destinations: Destination[];
  defaultDestination?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function SearchBar({ destinations, defaultDestination = '' }: SearchBarProps) {
  const router = useRouter();
  const [destination, setDestination] = useState(defaultDestination);
  const [date, setDate] = useState('');
  const [people, setPeople] = useState(2);

  function handleSearch() {
    router.push(
      routes.tours({
        destino: destination || undefined,
        data: date || undefined,
        pessoas: people || undefined,
      }),
    );
  }

  return (
    <div className="rounded-card bg-white p-3 shadow-lift sm:p-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[1.2fr_1fr_0.8fr_auto]">
        <label className="flex flex-col gap-1 rounded-2xl bg-sand px-4 py-3 text-left">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <MapPin size={13} aria-hidden />
            Destino
          </span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="bg-transparent text-base font-semibold text-ink outline-none"
          >
            <option value="">Qualquer destino</option>
            {destinations.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 rounded-2xl bg-sand px-4 py-3 text-left">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <CalendarDays size={13} aria-hidden />
            Data
          </span>
          <input
            type="date"
            value={date}
            min={today()}
            onChange={(event) => setDate(event.target.value)}
            className="bg-transparent text-base font-semibold text-ink outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 rounded-2xl bg-sand px-4 py-3 text-left">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Users size={13} aria-hidden />
            Pessoas
          </span>
          <input
            type="number"
            min={1}
            max={80}
            value={people}
            onChange={(event) => setPeople(Number(event.target.value))}
            className="bg-transparent text-base font-semibold text-ink outline-none"
          />
        </label>

        <button type="button" onClick={handleSearch} className="btn-primary h-full w-full px-8 py-4 text-base">
          <Search size={18} aria-hidden />
          Buscar passeios
        </button>
      </div>
    </div>
  );
}
