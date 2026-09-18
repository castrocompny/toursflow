import { describe, expect, it } from 'vitest';
import type { TourWithRelations } from '@/types';
import { formatPrice } from './format';
import { buildTourSummaryItems } from './tour-summary';

const baseTour: TourWithRelations = {
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
  durationMinutes: 150,
  priceFrom: 150,
  priceType: 'per_person',
  boardingPoint: {
    name: 'Marina da Glória',
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
  operator: { id: 'op-1', name: 'Empresa X' },
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

function findValue(items: { label: string; value: string }[], labelMatch: RegExp) {
  return items.find((item) => labelMatch.test(item.label))?.value;
}

describe('buildTourSummaryItems', () => {
  it('sempre inclui duração, preço, embarque e operador', () => {
    const items = buildTourSummaryItems(baseTour);
    expect(findValue(items, /duração/i)).toBe('2h30');
    expect(findValue(items, /preço/i)).toBe(formatPrice(150));
    expect(findValue(items, /embarque/i)).toBe('Marina da Glória');
    expect(findValue(items, /operador/i)).toBe('Empresa X');
  });

  it('inclui o tipo de preço no rótulo quando existe', () => {
    const items = buildTourSummaryItems(baseTour);
    expect(items.find((item) => item.label === 'Preço por pessoa')).toBeTruthy();
  });

  it('rótulo de preço sem sufixo pendurado quando o tipo não tem rótulo (starting_from)', () => {
    const items = buildTourSummaryItems({ ...baseTour, priceType: 'starting_from' });
    expect(items.find((item) => item.label === 'Preço')).toBeTruthy();
  });

  it('NÃO inclui "Capacidade" quando maxPeople está ausente — nunca inventa dado', () => {
    const items = buildTourSummaryItems(baseTour);
    expect(items.some((item) => item.label === 'Capacidade')).toBe(false);
  });

  it('inclui "Capacidade" quando maxPeople existe', () => {
    const items = buildTourSummaryItems({ ...baseTour, maxPeople: 10 });
    expect(findValue(items, /capacidade/i)).toBe('Até 10 pessoas');
  });

  it('NÃO inclui "Check-in" quando checkInMinutesBefore está ausente', () => {
    const items = buildTourSummaryItems(baseTour);
    expect(items.some((item) => item.label === 'Check-in')).toBe(false);
  });

  it('inclui "Check-in" quando checkInMinutesBefore existe', () => {
    const items = buildTourSummaryItems({
      ...baseTour,
      boardingPoint: { ...baseTour.boardingPoint, checkInMinutesBefore: 20 },
    });
    expect(findValue(items, /check-in/i)).toBe('Chegue 20 minutos antes do horário de saída.');
  });
});
