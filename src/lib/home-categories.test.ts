import { describe, expect, it } from 'vitest';
import type { Category } from '@/types';
import { filterHomeCategories } from './home-categories';

function makeCategory(slug: string): Category {
  return { id: slug, slug, name: slug, icon: '🚤', description: '' };
}

describe('filterHomeCategories', () => {
  it('remove "por_do_sol" (formato real do contrato do NauticFlow)', () => {
    const result = filterHomeCategories([makeCategory('por_do_sol'), makeCategory('praias')]);
    expect(result.map((c) => c.slug)).toEqual(['praias']);
  });

  it('remove "por-do-sol" (formato do mock local, hífen)', () => {
    const result = filterHomeCategories([makeCategory('por-do-sol'), makeCategory('praias')]);
    expect(result.map((c) => c.slug)).toEqual(['praias']);
  });

  it('remove "outro"', () => {
    const result = filterHomeCategories([makeCategory('outro'), makeCategory('ilhas')]);
    expect(result.map((c) => c.slug)).toEqual(['ilhas']);
  });

  it('mantém as 4 categorias esperadas na home', () => {
    const all = [
      makeCategory('passeio_privativo'),
      makeCategory('por_do_sol'),
      makeCategory('praias'),
      makeCategory('ilhas'),
      makeCategory('passeio_compartilhado'),
      makeCategory('outro'),
    ];
    expect(filterHomeCategories(all).map((c) => c.slug)).toEqual([
      'passeio_privativo',
      'praias',
      'ilhas',
      'passeio_compartilhado',
    ]);
  });

  it('não muda a ordem nem muta o array original', () => {
    const all = [makeCategory('praias'), makeCategory('outro'), makeCategory('ilhas')];
    const result = filterHomeCategories(all);
    expect(result.map((c) => c.slug)).toEqual(['praias', 'ilhas']);
    expect(all.map((c) => c.slug)).toEqual(['praias', 'outro', 'ilhas']); // original intocado
  });

  it('array vazio -> array vazio', () => {
    expect(filterHomeCategories([])).toEqual([]);
  });
});
