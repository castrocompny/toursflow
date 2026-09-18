import { describe, expect, it } from 'vitest';
import { destinationsVitrine, genericDestinationVitrine } from './destinations';

describe('destinationsVitrine', () => {
  it('tem vitrine específica para os destinos editoriais já escritos', () => {
    expect(destinationsVitrine.buzios).toBeDefined();
    expect(destinationsVitrine.buzios.image).toBe('/img/mock/destinations/buzios.svg');
  });

  it('não tem entrada para um destino futuro ainda não escrito editorialmente (ex.: recife) — é exatamente esse caso que aciona o fallback', () => {
    expect(destinationsVitrine.recife).toBeUndefined();
    expect(destinationsVitrine['angra-dos-reis-dummy']).toBeUndefined();
  });
});

describe('genericDestinationVitrine (fallback para destino sem vitrine específica)', () => {
  it('gera um objeto completo e válido, sem inventar fatos específicos do lugar', () => {
    const vitrine = genericDestinationVitrine('Recife');

    expect(vitrine.tagline).toBe('Passeios de barco em Recife');
    expect(vitrine.description).toContain('Recife');
    expect(vitrine.description).not.toMatch(/praia|ilha|canal|baía/i); // nada específico inventado
    expect(vitrine.image).toBe('/img/mock/destinations/generic.svg');
    expect(vitrine.highlights).toEqual([]);
    expect(vitrine.state).toBe('');
  });

  it('funciona para qualquer nome de cidade, sem lista fixa de destinos suportados', () => {
    const cities = ['Recife', 'Fortaleza', 'Maragogi', 'Ubatuba'];
    for (const city of cities) {
      const vitrine = genericDestinationVitrine(city);
      expect(vitrine.tagline).toContain(city);
      expect(vitrine.image).toBe('/img/mock/destinations/generic.svg');
    }
  });
});
