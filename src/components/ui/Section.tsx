import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface SectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}

export function Section({ eyebrow, title, description, action, children, className = '' }: SectionProps) {
  return (
    <section className={`shell py-14 sm:py-20 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h2>
          {description ? <p className="mt-3 text-ink-muted">{description}</p> : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-sea hover:text-sea-dark"
          >
            {action.label}
            <ArrowRight size={16} aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  );
}
