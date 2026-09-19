import { describe, expect, it } from 'vitest';
import { MARKETPLACE_CANCELLATION_POLICY } from './marketplace-cancellation-policy';

describe('MARKETPLACE_CANCELLATION_POLICY', () => {
  it('é versionada e identificável, independente de passeio/operador', () => {
    expect(MARKETPLACE_CANCELLATION_POLICY.id).toBe('toursflow-standard');
    expect(MARKETPLACE_CANCELLATION_POLICY.version).toMatch(/^\d{4}-\d{2}$/);
  });

  it('título é "Cancelamento e reembolso"', () => {
    expect(MARKETPLACE_CANCELLATION_POLICY.title).toBe('Cancelamento e reembolso');
  });

  it('não promete reembolso, gratuidade, prazo financeiro ou contato com operador (ainda sem autorização de produto para isso)', () => {
    const forbidden = /grátis|gratuit|reembolsad[oa]|\d+\s*%|\d+\s*horas?|\d+\s*dias?|fale com o operador|entre em contato com o operador/i;
    expect(MARKETPLACE_CANCELLATION_POLICY.summary).not.toMatch(forbidden);
  });

  it('deixa claro que a política é do marketplace, não do operador individual', () => {
    expect(MARKETPLACE_CANCELLATION_POLICY.summary.toLowerCase()).toContain('marketplace');
  });
});
