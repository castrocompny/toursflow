import { Check, Minus } from 'lucide-react';

interface TourChecklistProps {
  included: string[];
  notIncluded: string[];
}

export function TourChecklist({ included, notIncluded }: TourChecklistProps) {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div>
        <h3 className="font-display text-base font-bold">O que está incluído</h3>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          {included.map((item) => (
            <li key={item} className="flex gap-2">
              <Check size={16} className="mt-0.5 shrink-0 text-sea" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-display text-base font-bold">O que não está incluído</h3>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          {notIncluded.map((item) => (
            <li key={item} className="flex gap-2">
              <Minus size={16} className="mt-0.5 shrink-0 text-ink/40" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
