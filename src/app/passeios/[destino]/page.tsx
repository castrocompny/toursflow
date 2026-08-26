import { redirect } from 'next/navigation';
import { routes } from '@/lib/routes';

/**
 * /passeios/buzios existe apenas como atalho: a listagem por destino tem uma
 * página canônica em /destinos/buzios. Manter as duas indexáveis criaria
 * duas páginas competindo pelo mesmo termo de busca.
 */
export default function DestinationShortcut({ params }: { params: { destino: string } }) {
  redirect(routes.destination(params.destino));
}
