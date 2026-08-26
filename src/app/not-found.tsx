import Link from 'next/link';
import { routes } from '@/lib/routes';

export default function NotFound() {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow">Erro 404</p>
      <h1 className="mt-3 text-4xl font-extrabold">Esta página não existe</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        O passeio pode ter saído do ar ou o endereço foi digitado errado. Comece pela busca.
      </p>
      <Link href={routes.tours()} className="btn-primary mt-8">
        Buscar passeios
      </Link>
    </div>
  );
}
