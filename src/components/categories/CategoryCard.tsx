import Link from 'next/link';
import type { Category } from '@/types';
import { routes } from '@/lib/routes';

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={routes.category(category.slug)}
      className="flex h-full flex-col gap-2 rounded-card border border-ink/10 bg-white p-5 transition-colors hover:border-sea hover:bg-foam"
    >
      <span className="text-2xl" aria-hidden>
        {category.icon}
      </span>
      <span className="font-display text-base font-bold">{category.name}</span>
      {category.description ? (
        <span className="text-sm text-ink-muted">{category.description}</span>
      ) : null}
    </Link>
  );
}
