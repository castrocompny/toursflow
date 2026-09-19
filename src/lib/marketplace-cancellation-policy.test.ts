import { describe, expect, it } from 'vitest';
import { MARKETPLACE_CANCELLATION_POLICY, resolveCancellationPolicy } from './marketplace-cancellation-policy';

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

describe('resolveCancellationPolicy (independência do texto livre do operador)', () => {
  it('devolve sempre a política do marketplace, não importa o que o operador cadastrou em cancellationPolicy', () => {
    const tourA = { cancellationPolicy: 'POLÍTICA DO OPERADOR A' };
    const tourB = { cancellationPolicy: 'OUTRA POLÍTICA DO OPERADOR' };

    const resultA = resolveCancellationPolicy(tourA);
    const resultB = resolveCancellationPolicy(tourB);

    expect(resultA).toEqual(MARKETPLACE_CANCELLATION_POLICY);
    expect(resultB).toEqual(MARKETPLACE_CANCELLATION_POLICY);
  });

  it('o texto livre do operador nunca vaza para o conteúdo público resolvido', () => {
    const tourA = { cancellationPolicy: 'POLÍTICA DO OPERADOR A' };
    const tourB = { cancellationPolicy: 'OUTRA POLÍTICA DO OPERADOR' };

    const resultA = resolveCancellationPolicy(tourA);
    const resultB = resolveCancellationPolicy(tourB);

    expect(resultA.title).not.toContain('OPERADOR');
    expect(resultA.summary).not.toContain('POLÍTICA DO OPERADOR A');
    expect(resultB.summary).not.toContain('OUTRA POLÍTICA DO OPERADOR');
  });

  it('mesmo com passeios diferentes, o resultado é idêntico (não varia por operador/passeio)', () => {
    const tourA = { cancellationPolicy: 'Cancelamento gratuito até 24h antes.' };
    const tourB = { cancellationPolicy: 'Sem reembolso em nenhuma hipótese.' };

    expect(resolveCancellationPolicy(tourA)).toEqual(resolveCancellationPolicy(tourB));
  });
});
