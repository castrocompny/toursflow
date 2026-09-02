import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingApiError } from './booking-errors';
import { getTrustedClientIp, normalizeClientIp } from './client-ip';

function requestWithHeaders(headers: Record<string, string>) {
  return new Request('https://toursflow.com.br/api/bookings', { method: 'POST', headers });
}

/** Mesmo callback que `src/app/api/bookings/route.ts` injeta de verdade — testa o contrato real de uso, não um stub arbitrário. */
function onUnavailable(): never {
  throw new BookingApiError(503, 'CLIENT_IP_UNAVAILABLE', 'Não foi possível iniciar a reserva. Tente novamente.');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeClientIp', () => {
  it('aceita IPv4 simples', () => {
    expect(normalizeClientIp('203.0.113.10')).toBe('203.0.113.10');
  });

  it('aceita IPv4 com porta', () => {
    expect(normalizeClientIp('203.0.113.10:54321')).toBe('203.0.113.10');
  });

  it('aceita IPv6 simples e normaliza para lowercase', () => {
    expect(normalizeClientIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('aceita IPv6 entre colchetes com porta', () => {
    expect(normalizeClientIp('[2001:db8::1]:8080')).toBe('2001:db8::1');
  });

  it('normaliza IPv4-mapped IPv6 para o IPv4 puro', () => {
    expect(normalizeClientIp('::ffff:203.0.113.10')).toBe('203.0.113.10');
  });

  it('usa o primeiro IP de uma lista (x-forwarded-for com proxies)', () => {
    expect(normalizeClientIp('203.0.113.10, 70.41.3.18, 150.172.238.178')).toBe('203.0.113.10');
  });

  it('faz trim de espaços', () => {
    expect(normalizeClientIp('   203.0.113.10   ')).toBe('203.0.113.10');
  });

  it('rejeita valor inválido', () => {
    expect(normalizeClientIp('não-é-um-ip')).toBeNull();
    expect(normalizeClientIp('')).toBeNull();
    expect(normalizeClientIp(null)).toBeNull();
    expect(normalizeClientIp(undefined)).toBeNull();
  });

  it('rejeita header absurdamente longo antes de processar', () => {
    expect(normalizeClientIp('1.2.3.4,'.repeat(1000))).toBeNull();
  });
});

describe('getTrustedClientIp', () => {
  it('em produção (VERCEL=1), usa x-vercel-forwarded-for quando válido', () => {
    vi.stubEnv('VERCEL', '1');
    const request = requestWithHeaders({ 'x-vercel-forwarded-for': '203.0.113.10' });
    expect(getTrustedClientIp(request, onUnavailable)).toBe('203.0.113.10');
  });

  it('em produção (VERCEL=1), IGNORA x-forwarded-for e headers customizados do navegador', () => {
    vi.stubEnv('VERCEL', '1');
    const request = requestWithHeaders({
      'x-forwarded-for': '198.51.100.1',
      'x-client-ip': '198.51.100.2',
      'client-ip': '198.51.100.3',
    });
    expect(() => getTrustedClientIp(request, onUnavailable)).toThrow(BookingApiError);
    try {
      getTrustedClientIp(request, onUnavailable);
    } catch (error) {
      expect(error).toBeInstanceOf(BookingApiError);
      expect((error as BookingApiError).code).toBe('CLIENT_IP_UNAVAILABLE');
      expect((error as BookingApiError).status).toBe(503);
    }
  });

  it('em produção sem x-vercel-forwarded-for, falha fechado (nunca "unknown"/"anonymous")', () => {
    vi.stubEnv('VERCEL', '1');
    const request = requestWithHeaders({});
    expect(() => getTrustedClientIp(request, onUnavailable)).toThrow(BookingApiError);
  });

  it('fora da Vercel (dev/teste), cai para x-forwarded-for', () => {
    vi.stubEnv('VERCEL', '');
    const request = requestWithHeaders({ 'x-forwarded-for': '203.0.113.20' });
    expect(getTrustedClientIp(request, onUnavailable)).toBe('203.0.113.20');
  });

  it('fora da Vercel, sem nenhum header disponível, também falha fechado', () => {
    vi.stubEnv('VERCEL', '');
    const request = requestWithHeaders({});
    expect(() => getTrustedClientIp(request, onUnavailable)).toThrow(BookingApiError);
  });

  it('onUnavailable é o único responsável pela mensagem — o módulo não fixa nenhum texto', () => {
    vi.stubEnv('VERCEL', '1');
    const request = requestWithHeaders({});
    try {
      getTrustedClientIp(request, onUnavailable);
      throw new Error('deveria ter lançado');
    } catch (error) {
      const message = (error as BookingApiError).message;
      expect(message.toLowerCase()).not.toContain('ip');
      expect(message.toLowerCase()).not.toContain('vercel');
      expect(message.toLowerCase()).not.toContain('proxy');
      expect(message.toLowerCase()).not.toContain('header');
    }
  });

  it('funciona igual com um onUnavailable diferente (prova que é genérico, não acoplado a BookingApiError)', () => {
    vi.stubEnv('VERCEL', '1');
    const request = requestWithHeaders({});
    class OtherError extends Error {}
    expect(() =>
      getTrustedClientIp(request, () => {
        throw new OtherError('outro tipo de erro, de outra rota');
      }),
    ).toThrow(OtherError);
  });
});
