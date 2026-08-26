'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { X } from 'lucide-react';
import type { Category, Destination } from '@/types';

interface FilterBarProps {
  destinations: Destination[];
  categories: Category[];
}

export function FilterBar({ destinations, categories }: FilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const query = next.toString();
      router.push(query ? `/passeios?${query}` : '/passeios', { scroll: false });
    },
    [params, router],
  );

  const destination = params.get('destino') ?? '';
  const category = params.get('categoria') ?? '';
  const date = params.get('data') ?? '';
  const people = params.get('pessoas') ?? '';
  const hasFilters = Boolean(destination || category || date || people);

  return (
    <div className="sticky top-16 z-30 -mx-5 border-b border-ink/10 bg-white/95 px-5 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:px-4">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
        <select
          aria-label="Filtrar por destino"
          value={destination}
          onChange={(event) => setParam('destino', event.target.value)}
          className="shrink-0 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink"
        >
          <option value="">Todos os destinos</option>
          {destinations.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por categoria"
          value={category}
          onChange={(event) => setParam('categoria', event.target.value)}
          className="shrink-0 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink"
        >
          <option value="">Todas as categorias</option>
          {categories.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>

        <label className="shrink-0 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink">
          <span className="sr-only">Data do passeio</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setParam('data', event.target.value)}
            className="bg-transparent outline-none"
          />
        </label>

        <label className="shrink-0 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink">
          <span className="text-ink-muted">Pessoas</span>
          <input
            type="number"
            min={1}
            max={80}
            value={people}
            placeholder="2"
            onChange={(event) => setParam('pessoas', event.target.value)}
            className="ml-2 w-12 bg-transparent outline-none"
          />
        </label>

        {hasFilters ? (
          <button
            type="button"
            onClick={() => router.push('/passeios', { scroll: false })}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-sea hover:bg-foam"
          >
            <X size={14} aria-hidden />
            Limpar
          </button>
        ) : null}
      </div>
    </div>
  );
}
