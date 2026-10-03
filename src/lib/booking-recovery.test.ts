import { describe, expect, it } from 'vitest';
import {
  BOOKING_RECOVERY_STORAGE_KEY,
  clearBookingRecovery,
  readBookingRecovery,
  saveBookingRecovery,
} from './booking-recovery';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

const BOOKING_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const PAYMENT_KEY = 'b1f4a6c2-2222-4444-8888-0123456789ab';
const DEPARTS_AT = '2026-10-11T17:00:00+00:00';
const STATE = { bookingId: BOOKING_ID, tourSlug: 'passeio-1', departsAt: DEPARTS_AT, paymentIdempotencyKey: PAYMENT_KEY };

describe('booking-recovery', () => {
  it('grava e lê de volta só as referências opacas (v2: tourSlug + departsAt, sem departureId)', () => {
    const storage = memoryStorage();
    saveBookingRecovery(STATE, storage);

    expect(readBookingRecovery(storage)).toEqual(STATE);
    expect(JSON.parse(storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)!)).toEqual({ version: 2, ...STATE });
  });

  it('whitelist: campos extras (ex.: PII) nunca são gravados', () => {
    const storage = memoryStorage();
    const withExtras = {
      ...STATE,
      paymentIdempotencyKey: null,
      email: 'turista@example.com',
      cpf: '11144477735',
    } as unknown as Parameters<typeof saveBookingRecovery>[0];
    saveBookingRecovery(withExtras, storage);

    const raw = storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)!;
    expect(raw).not.toMatch(/turista|example|11144477735|email|cpf/);
  });

  it.each([
    ['JSON corrompido', '{nao-e-json'],
    ['versão 1 (departureId, antes do desacoplamento do catálogo)', JSON.stringify({ version: 1, bookingId: BOOKING_ID, departureId: 'dep-1', paymentIdempotencyKey: null })],
    ['bookingId inválido', JSON.stringify({ version: 2, ...STATE, bookingId: 'x' })],
    ['sem tourSlug', JSON.stringify({ version: 2, ...STATE, tourSlug: undefined })],
    ['departsAt inválido', JSON.stringify({ version: 2, ...STATE, departsAt: 'ontem' })],
    ['key inválida', JSON.stringify({ version: 2, ...STATE, paymentIdempotencyKey: 'abc' })],
  ])('%s: devolve null e apaga só a chave de recuperação', (_label, raw) => {
    const storage = memoryStorage();
    storage.setItem(BOOKING_RECOVERY_STORAGE_KEY, raw);
    storage.setItem('outra-chave', 'intacta');

    expect(readBookingRecovery(storage)).toBeNull();
    expect(storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('outra-chave')).toBe('intacta');
  });

  it('storage indisponível ou que lança: nunca quebra, só não recupera', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;

    expect(readBookingRecovery(null)).toBeNull();
    expect(readBookingRecovery(throwing)).toBeNull();
    expect(() => saveBookingRecovery(STATE, throwing)).not.toThrow();
    expect(() => clearBookingRecovery(throwing)).not.toThrow();
  });

  it('clear remove só a chave de recuperação', () => {
    const storage = memoryStorage();
    saveBookingRecovery(STATE, storage);
    storage.setItem('outra-chave', 'intacta');
    clearBookingRecovery(storage);
    expect(readBookingRecovery(storage)).toBeNull();
    expect(storage.getItem('outra-chave')).toBe('intacta');
  });
});
