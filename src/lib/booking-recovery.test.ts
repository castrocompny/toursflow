import { describe, expect, it } from 'vitest';
import {
  BOOKING_RECOVERY_STORAGE_KEY,
  findBookingRecovery,
  readBookingRecoveries,
  removeBookingRecovery,
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

const A = {
  bookingId: '9c858901-8a57-4791-81fe-4c455b099bc9',
  tourSlug: 'passeio-a',
  departsAt: '2026-10-11T17:00:00+00:00',
  paymentIdempotencyKey: 'b1f4a6c2-2222-4444-8888-0123456789ab',
};
const B = {
  bookingId: '2f0d6a3e-1c4b-4b7e-9a51-6d2e8f0c3a77',
  tourSlug: 'passeio-b',
  departsAt: '2026-11-20T13:00:00+00:00',
  paymentIdempotencyKey: null,
};

function rawRegistry(storage: Storage) {
  return JSON.parse(storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)!);
}

describe('booking-recovery (registro v3, uma entrada por bookingId)', () => {
  it('A: save A → registro contém A, só com as 4 referências opacas', () => {
    const storage = memoryStorage();
    saveBookingRecovery(A, storage);

    expect(rawRegistry(storage)).toEqual({ version: 3, bookings: { [A.bookingId]: A } });
    expect(readBookingRecoveries(storage)).toEqual([A]);
  });

  it('B: save A + save B (outro passeio) → contém A e B; B nunca sobrescreve A', () => {
    const storage = memoryStorage();
    saveBookingRecovery(A, storage);
    saveBookingRecovery(B, storage);

    expect(readBookingRecoveries(storage)).toEqual([A, B]);
    expect(findBookingRecovery('passeio-a', storage)).toEqual(A);
    expect(findBookingRecovery('passeio-b', storage)).toEqual(B);
  });

  it('C: atualizar a key de B não altera A', () => {
    const storage = memoryStorage();
    saveBookingRecovery(A, storage);
    saveBookingRecovery(B, storage);
    saveBookingRecovery({ ...B, paymentIdempotencyKey: '7d4c1e2f-3a5b-4c6d-8e9f-0a1b2c3d4e5f' }, storage);

    expect(findBookingRecovery('passeio-a', storage)).toEqual(A);
    expect(findBookingRecovery('passeio-b', storage)?.paymentIdempotencyKey).toBe('7d4c1e2f-3a5b-4c6d-8e9f-0a1b2c3d4e5f');
  });

  it('D: remover B mantém A; remover o último apaga a chave inteira; outras chaves ficam', () => {
    const storage = memoryStorage();
    storage.setItem('outra-chave', 'intacta');
    saveBookingRecovery(A, storage);
    saveBookingRecovery(B, storage);

    removeBookingRecovery(B.bookingId, storage);
    expect(readBookingRecoveries(storage)).toEqual([A]);

    removeBookingRecovery(A.bookingId, storage);
    expect(storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('outra-chave')).toBe('intacta');
  });

  it('passeio sem reserva → null; vários do mesmo passeio → sempre o mais recente (nunca ao acaso)', () => {
    const storage = memoryStorage();
    expect(findBookingRecovery('passeio-a', storage)).toBeNull();

    const A2 = { ...B, tourSlug: 'passeio-a' };
    saveBookingRecovery(A, storage);
    saveBookingRecovery(A2, storage);
    expect(findBookingRecovery('passeio-a', storage)).toEqual(A2);
  });

  it('whitelist: campos extras (ex.: PII) nunca são gravados', () => {
    const storage = memoryStorage();
    saveBookingRecovery({ ...A, email: 'turista@example.com', cpf: '11144477735' } as unknown as typeof A, storage);

    expect(storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)).not.toMatch(/turista|example|11144477735|email|cpf/);
  });

  it('entrada inválida nunca é gravada', () => {
    const storage = memoryStorage();
    saveBookingRecovery({ ...A, bookingId: 'nao-e-uuid' }, storage);
    expect(storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it('migra v2 (entrada única do Preview) para v3 sem perder a reserva', () => {
    const storage = memoryStorage();
    storage.setItem(BOOKING_RECOVERY_STORAGE_KEY, JSON.stringify({ version: 2, ...A }));

    expect(findBookingRecovery('passeio-a', storage)).toEqual(A);
    expect(rawRegistry(storage)).toEqual({ version: 3, bookings: { [A.bookingId]: A } });
  });

  it.each([
    ['JSON corrompido', '{nao-e-json'],
    ['versão 1', JSON.stringify({ version: 1, bookingId: A.bookingId, departureId: 'dep-1', paymentIdempotencyKey: null })],
    ['versão desconhecida', JSON.stringify({ version: 99, bookings: {} })],
  ])('%s: registro descartado (só esta chave), nada recuperado', (_label, raw) => {
    const storage = memoryStorage();
    storage.setItem(BOOKING_RECOVERY_STORAGE_KEY, raw);
    storage.setItem('outra-chave', 'intacta');

    expect(readBookingRecoveries(storage)).toEqual([]);
    expect(storage.getItem(BOOKING_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('outra-chave')).toBe('intacta');
  });

  it('entrada individual inválida é descartada sem perder as válidas', () => {
    const storage = memoryStorage();
    storage.setItem(
      BOOKING_RECOVERY_STORAGE_KEY,
      JSON.stringify({ version: 3, bookings: { [A.bookingId]: A, lixo: { bookingId: 'x', tourSlug: '', departsAt: 'ontem' } } }),
    );

    expect(readBookingRecoveries(storage)).toEqual([A]);
    expect(rawRegistry(storage)).toEqual({ version: 3, bookings: { [A.bookingId]: A } });
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

    expect(readBookingRecoveries(null)).toEqual([]);
    expect(findBookingRecovery('passeio-a', throwing)).toBeNull();
    expect(() => saveBookingRecovery(A, throwing)).not.toThrow();
    expect(() => removeBookingRecovery(A.bookingId, throwing)).not.toThrow();
  });
});
