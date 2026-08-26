import Link from 'next/link';
import { Compass } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; href: string };
}

/** Tela vazia como convite à ação, não como aviso de erro. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-card border border-dashed border-ink/20 bg-sand px-6 py-14 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-sea shadow-sm">
        <Compass size={22} aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      {action ? (
        <Link href={action.href} className="btn-primary mt-6">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
