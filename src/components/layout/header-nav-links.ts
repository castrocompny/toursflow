import { routes } from '@/lib/routes';

export interface HeaderNavLink {
  label: string;
  href: string;
}

/** Os únicos 3 links de navegação real do header — só o que o ToursFlow tem hoje, nada inventado (login, favoritos, etc.). */
export const HEADER_NAV_LINKS: HeaderNavLink[] = [
  { label: 'Passeios', href: routes.tours() },
  { label: 'Destinos', href: routes.destinations() },
  { label: 'Como funciona', href: routes.howItWorks() },
];

/**
 * "Ativo" = a rota atual é essa página ou uma sub-rota dela (ex.: `/passeios`
 * fica ativo também em `/passeios/buzios/algum-passeio`). Uma âncora (com
 * `#`, como "Como funciona") nunca conta como rota ativa — não existe uma
 * "página" própria pra ela, só uma seção dentro da home.
 */
export function isNavLinkActive(pathname: string, href: string): boolean {
  if (href.includes('#')) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
