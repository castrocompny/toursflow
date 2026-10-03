import { describe, expect, it } from 'vitest';
import { MARKETPLACE_CANCELLATION_POLICY, resolveCancellationPolicy } from './marketplace-cancellation-policy';

describe('MARKETPLACE_CANCELLATION_POLICY', () => {
  it('é versionada e identificável, independente de passeio/operador', () => {
    expect(MARKETPLACE_CANCELLATION_POLICY.id).toBe('toursflow-standard');
    expect(MARKETPLACE_CANCELLATION_POLICY.version).toBe('2026-10');
  });

  it('título é "Cancelamento e reembolso"', () => {
    expect(MARKETPLACE_CANCELLATION_POLICY.title).toBe('Cancelamento e reembolso');
  });

  it('summary resume a regra real — não é mais o placeholder "serão apresentadas"', () => {
    const { summary } = MARKETPLACE_CANCELLATION_POLICY;
    expect(summary).not.toMatch(/serão apresentadas/i);
    expect(summary).toMatch(/48 horas/);
    expect(summary).toMatch(/50%/);
    expect(summary).toMatch(/menos de 24 horas/);
  });

  it('condições aprovadas (02/10/2026), exatamente nesta ordem', () => {
    const [full, half, late, noShow, operator, refunds, ...extra] = MARKETPLACE_CANCELLATION_POLICY.terms;
    expect(full).toMatch(/pelo menos 48 horas.*reembolso integral/i);
    expect(half).toMatch(/entre 24 e 48 horas.*reembolso de 50%/i);
    expect(late).toMatch(/menos de 24 horas.*sem reembolso/i);
    expect(noShow).toMatch(/no-show.*sem reembolso/i);
    expect(operator).toMatch(/cancelado pelo operador/i);
    expect(operator).toMatch(/climáticas/i);
    expect(operator).toMatch(/marítimas/i);
    expect(operator).toMatch(/segurança/i);
    expect(operator).toMatch(/impossibilidade operacional/i);
    expect(operator).toMatch(/remarcação ou reembolso integral/i);
    expect(refunds).toMatch(/mesmo meio de pagamento/i);
    expect(extra).toEqual([]);
  });

  it('não inventa multa, prazo de estorno em dias nem instrui a falar com o operador', () => {
    const text = [MARKETPLACE_CANCELLATION_POLICY.summary, ...MARKETPLACE_CANCELLATION_POLICY.terms].join(' ');
    expect(text).not.toMatch(/multa|\d+\s*dias?|fale com o operador|entre em contato com o operador|grátis|gratuit/i);
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
