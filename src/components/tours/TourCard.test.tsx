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

const BASE_HREF = '/passeios/buzios/passeio-de-lancha-pelas-ilhas';

/** Os 3 links do card, por papel — nomes exatos pra não colidir (o link da imagem
 * tem "Ver passeio" como PREFIXO do próprio nome, então usamos `exact` pra distinguir). */
function getLinks() {
  return {
    imageLink: screen.getByRole('link', { name: `Ver passeio ${tour.name}` }) as HTMLAnchorElement,
    titleLink: screen.getByRole('link', { name: tour.name }) as HTMLAnchorElement,
    ctaLink: screen.getByRole('link', { name: 'Ver passeio' }) as HTMLAnchorElement,
  };
}

describe('TourCard', () => {
  it('a imagem está dentro de um link real (<a>) para o passeio', () => {
    render(<TourCard tour={tour} />);
    const { imageLink } = getLinks();
    expect(imageLink.tagName).toBe('A');
    expect(imageLink.getAttribute('href')).toBe(BASE_HREF);
  });

  it('o título é um link real (<a>) para o passeio', () => {
    render(<TourCard tour={tour} />);
    const { titleLink } = getLinks();
    expect(titleLink.tagName).toBe('A');
    expect(titleLink.getAttribute('href')).toBe(BASE_HREF);
  });

  it('"Ver passeio" é um link real (<a>) para o passeio, não um <span> decorativo', () => {
    render(<TourCard tour={tour} />);
    const { ctaLink } = getLinks();
    expect(ctaLink.tagName).toBe('A');
    expect(ctaLink.getAttribute('href')).toBe(BASE_HREF);
  });

  it('os três links (imagem, título, CTA) apontam pro EXATO mesmo href', () => {
    render(<TourCard tour={tour} />);
    const { imageLink, titleLink, ctaLink } = getLinks();
    expect(imageLink.getAttribute('href')).toBe(titleLink.getAttribute('href'));
    expect(titleLink.getAttribute('href')).toBe(ctaLink.getAttribute('href'));
  });

  it('peopleParam=4 preserva ?pessoas=4 nos três links, não só no CTA', () => {
    render(<TourCard tour={tour} peopleParam={4} />);
    const { imageLink, titleLink, ctaLink } = getLinks();
    const withQuery = `${BASE_HREF}?pessoas=4`;
    expect(imageLink.getAttribute('href')).toBe(withQuery);
    expect(titleLink.getAttribute('href')).toBe(withQuery);
    expect(ctaLink.getAttribute('href')).toBe(withQuery);
  });

  it('sem peopleParam, os três continuam na URL normal do passeio (sem query)', () => {
    render(<TourCard tour={tour} />);
    const { imageLink, titleLink, ctaLink } = getLinks();
    expect(imageLink.getAttribute('href')).toBe(BASE_HREF);
    expect(titleLink.getAttribute('href')).toBe(BASE_HREF);
    expect(ctaLink.getAttribute('href')).toBe(BASE_HREF);
  });

  it('nenhum link usa o padrão de stretched-link (after:absolute/after:inset-0) — cada um é um alvo de toque independente', () => {
    render(<TourCard tour={tour} />);
    const { imageLink, titleLink, ctaLink } = getLinks();
    for (const link of [imageLink, titleLink, ctaLink]) {
      expect(link.className).not.toMatch(/after:absolute/);
      expect(link.className).not.toMatch(/after:inset-0/);
    }
  });

  it('exatamente 3 links no card — nenhum link aninhado dentro de outro', () => {
    render(<TourCard tour={tour} />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});
