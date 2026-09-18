import { describe, expect, it } from 'vitest';
import { HOW_IT_WORKS_STEPS } from './how-it-works-steps';

describe('HOW_IT_WORKS_STEPS', () => {
  it('tem exatamente 3 passos', () => {
    expect(HOW_IT_WORKS_STEPS).toHaveLength(3);
  });

  it('o terceiro passo é "Tudo pelo ToursFlow" — não mais "Fale com o operador"', () => {
    expect(HOW_IT_WORKS_STEPS[2].title).toBe('Tudo pelo ToursFlow');
  });

  it('nenhum passo instrui o turista a contatar o operador diretamente', () => {
    const forbidden = /fale com o operador|contate o operador|entre em contato com o operador|fale diretamente/i;
    for (const step of HOW_IT_WORKS_STEPS) {
      expect(step.title).not.toMatch(forbidden);
      expect(step.text).not.toMatch(forbidden);
    }
  });
});
