import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Category } from '@/types';
import { routes } from '@/lib/routes';

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={routes.category(category.slug)}
      className="group flex h-full flex-col gap-2 rounded-card border border-ink/10 bg-white p-5 transition duration-150 hover:border-sea hover:bg-foam active:scale-[0.98]"
    >
      <span className="text-2xl" aria-hidden>
        {category.icon}
      </span>
      <span className="font-display text-base font-bold">{category.name}</span>
      {category.description ? (
        <span className="text-sm text-ink-muted">{category.description}</span>
      ) : null}
      {/* Mesmo href do card inteiro — só um indicador visual da ação, não um link novo nem dado inventado. */}
      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-semibold text-sea">
        Ver passeios
        <ArrowRight size={13} aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
