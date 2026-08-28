import { describe, expect, it, vi } from 'vitest';
import { mapPriceType } from './nauticflow-source';

describe('mapPriceType', () => {
  it('por_pessoa -> per_person (vendável, confirmado)', () => {
    expect(mapPriceType('por_pessoa')).toBe('per_person');
  });

  it('por_grupo -> per_group (vendável, confirmado)', () => {
    expect(mapPriceType('por_grupo')).toBe('per_group');
  });

  it('a_partir_de -> starting_from (catálogo, não vendável, confirmado)', () => {
    expect(mapPriceType('a_partir_de')).toBe('starting_from');
  });

  it('por_embarcacao NÃO mapeia mais para per_boat — sem equivalente confirmado, cai em starting_from', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapPriceType('por_embarcacao')).toBe('starting_from');
    warnSpy.mockRestore();
  });

  it('valor desconhecido cai em starting_from (padrão seguro: não vendável), nunca em per_person', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapPriceType('algo_totalmente_novo')).toBe('starting_from');
    warnSpy.mockRestore();
  });
});
