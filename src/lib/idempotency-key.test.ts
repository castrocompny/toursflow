import { describe, expect, it } from 'vitest';
import { createIdempotencyKey, idempotencyFingerprint, resolveIdempotencyKey } from './idempotency-key';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('createIdempotencyKey', () => {
  it('gera um UUID válido', () => {
    expect(createIdempotencyKey()).toMatch(UUID_RE);
  });

  it('gera valores diferentes a cada chamada', () => {
    expect(createIdempotencyKey()).not.toBe(createIdempotencyKey());
  });
});

describe('idempotencyFingerprint', () => {
  const base = { departureId: 'dep-1', quantity: 2, name: 'Turista', email: 'a@b.com', phone: '11912345678', cpf: '' };

  it('mesmo input produz o mesmo fingerprint', () => {
    expect(idempotencyFingerprint(base)).toBe(idempotencyFingerprint({ ...base }));
  });

  it('muda quando departureId, quantity ou qualquer dado do comprador muda', () => {
    const original = idempotencyFingerprint(base);
    expect(idempotencyFingerprint({ ...base, departureId: 'dep-2' })).not.toBe(original);
    expect(idempotencyFingerprint({ ...base, quantity: 3 })).not.toBe(original);
    expect(idempotencyFingerprint({ ...base, name: 'Outro' })).not.toBe(original);
    expect(idempotencyFingerprint({ ...base, email: 'c@d.com' })).not.toBe(original);
    expect(idempotencyFingerprint({ ...base, phone: '11999998888' })).not.toBe(original);
    expect(idempotencyFingerprint({ ...base, cpf: '11144477735' })).not.toBe(original);
  });

  it('ignora espaço extra e maiúsculas/minúsculas do e-mail (mesma tentativa lógica)', () => {
    const clean = idempotencyFingerprint(base);
    const withNoise = idempotencyFingerprint({ ...base, email: '  A@B.COM  ' });
    expect(clean).toBe(withNoise);
  });
});

describe('resolveIdempotencyKey — ciclo de vida completo', () => {
  it('sem key existente: sempre gera uma nova (primeira tentativa)', () => {
    const result = resolveIdempotencyKey({ key: null, fingerprint: null }, 'fp-1', () => 'key-A');
    expect(result).toEqual({ key: 'key-A', fingerprint: 'fp-1', regenerated: true });
  });

  it('mesmo fingerprint (re-render / retry da mesma tentativa): reaproveita a key existente, NUNCA chama generate()', () => {
    let generateCalls = 0;
    const generate = () => {
      generateCalls++;
      return 'nunca-deveria-ser-chamada';
    };
    const state = { key: 'key-A', fingerprint: 'fp-1' };

    const result = resolveIdempotencyKey(state, 'fp-1', generate);

    expect(result).toEqual({ key: 'key-A', fingerprint: 'fp-1', regenerated: false });
    expect(generateCalls).toBe(0);
  });

  it('fingerprint diferente (departure/quantity/dados do comprador mudaram): gera key nova', () => {
    const state = { key: 'key-A', fingerprint: 'fp-1' };
    const result = resolveIdempotencyKey(state, 'fp-2', () => 'key-B');
    expect(result).toEqual({ key: 'key-B', fingerprint: 'fp-2', regenerated: true });
  });

  it('múltiplos "re-renders" seguidos com o mesmo fingerprint continuam com a mesma key', () => {
    const first = resolveIdempotencyKey({ key: null, fingerprint: null }, 'fp-1', createIdempotencyKey);
    const second = resolveIdempotencyKey({ key: first.key, fingerprint: first.fingerprint }, 'fp-1', createIdempotencyKey);
    const third = resolveIdempotencyKey({ key: second.key, fingerprint: second.fingerprint }, 'fp-1', createIdempotencyKey);

    expect(second.key).toBe(first.key);
    expect(third.key).toBe(first.key);
    expect(second.regenerated).toBe(false);
    expect(third.regenerated).toBe(false);
  });

  it('depois de um sucesso definitivo (estado resetado para key: null), uma nova reserva SEMPRE recebe key nova — mesmo com fingerprint idêntico ao da reserva concluída', () => {
    // Simula: reserva 1 concluída com sucesso -> Fase 3 reseta o estado.
    const afterSuccessReset = { key: null, fingerprint: null };

    // Turista reserva de novo, com EXATAMENTE os mesmos dados (mesmo passeio,
    // mesma quantidade, mesmos dados de contato) — o fingerprint bate com o
    // da tentativa anterior, mas isso não pode reaproveitar a key antiga.
    const sameFingerprintAsBefore = 'fp-1';
    const result = resolveIdempotencyKey(afterSuccessReset, sameFingerprintAsBefore, () => 'key-nova-reserva-2');

    expect(result.regenerated).toBe(true);
    expect(result.key).toBe('key-nova-reserva-2');
  });
});
