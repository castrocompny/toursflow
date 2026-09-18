import type { Tour, TourWithRelations } from '@/types';

/**
 * Fonte única das URLs públicas. Qualquer mudança de estrutura de rota
 * acontece aqui, não espalhada em componentes.
 */
export const routes = {
  home: () => '/',
  tours: (params?: Record<string, string | number | undefined>) => {
    if (!params) return '/passeios';
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') query.set(key, String(value));
    });
    const qs = query.toString();
    return qs ? `/passeios?${qs}` : '/passeios';
  },
  tour: (tour: Pick<Tour, 'slug' | 'destinationSlug'> | TourWithRelations) =>
    `/passeios/${tour.destinationSlug}/${tour.slug}`,
  destinations: () => '/destinos',
  destination: (slug: string) => `/destinos/${slug}`,
  /** Âncora pra seção "Como funciona" na home (ver `id="como-funciona"` em `src/app/page.tsx`) — não é uma rota própria. */
  howItWorks: () => '/#como-funciona',
  category: (slug: string) => `/passeios?categoria=${slug}`,
} as const;
