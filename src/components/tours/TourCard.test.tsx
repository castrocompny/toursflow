// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TourWithRelations } from '@/types';
import { TourCard } from './TourCard';

afterEach(() => {
  cleanup();
});

const tour: TourWithRelations = {
  id: 'tour-1',
  slug: 'passeio-de-lancha-pelas-ilhas',
  name: 'Passeio de lancha pelas ilhas',
  status: 'published',
  summary: 'Um passeio de lancha pelas ilhas de Búzios.',
  description: 'Descrição completa.',
  destinationSlug: 'buzios',
  categorySlugs: ['lancha'],
  operatorId: 'op-1',
  images: [],
  durationMinutes: 180,
  priceFrom: 150,
  priceType: 'per_person',
  boardingPoint: {
    name: 'Marina',
    address: 'Rua X',
    district: 'Centro',
    city: 'Búzios',
    state: 'RJ',
  },
  itinerary: [],
  included: [],
  notIncluded: [],
  importantInfo: [],
  cancellationPolicy: 'Cancelamento gratuito até 24h antes.',
  operator: { id: 'op-1', name: 'Operador Teste' },
  destination: {
    id: 'dest-1',
    slug: 'buzios',
    name: 'Búzios',
    state: 'RJ',
    tagline: '',
    description: '',
    image: '',
    highlights: [],
  },
  categories: [],
};

describe('TourCard', () => {
  it('"Ver passeio" é um link real (elemento <a>), não um <span> decorativo', () => {
    render(<TourCard tour={tour} />);
    const link = screen.getByRole('link', { name: /ver passeio/i });
    expect(link.tagName).toBe('A');
  });

  it('"Ver passeio" aponta para a URL correta do passeio, sem peopleParam', () => {
    render(<TourCard tour={tour} />);
    const link = screen.getByRole('link', { name: /ver passeio/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/passeios/buzios/passeio-de-lancha-pelas-ilhas');
  });

  it('"Ver passeio" preserva ?pessoas=N quando peopleParam é informado', () => {
    render(<TourCard tour={tour} peopleParam={4} />);
    const link = screen.getByRole('link', { name: /ver passeio/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/passeios/buzios/passeio-de-lancha-pelas-ilhas?pessoas=4');
  });

  it('o título do card aponta para o MESMO href que "Ver passeio" (mesmo destino, dois links)', () => {
    render(<TourCard tour={tour} peopleParam={4} />);
    const titleLink = screen.getByRole('link', { name: tour.name });
    const ctaLink = screen.getByRole('link', { name: /ver passeio/i });
    expect(titleLink.getAttribute('href')).toBe(ctaLink.getAttribute('href'));
  });
});
