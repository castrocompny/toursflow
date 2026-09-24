import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapPriceType, nauticflowSource } from './nauticflow-source';

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

describe('listDepartures', () => {
  beforeEach(() => {
    vi.stubEnv('NAUTICFLOW_API_URL', 'https://nauticflow.exemplo.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('404 (passeio sem saídas/inexistente) devolve lista vazia, não lança erro — mesma semântica de getTour() (regressão do Codex Review de 18/09/2026)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    await expect(nauticflowSource.listDepartures('passeio-inexistente')).resolves.toEqual([]);
  });
});
