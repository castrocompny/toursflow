import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingApiError } from './booking-errors';
import { createToursFlowClientKey } from './toursflow-client-key';

const HEX64 = /^[a-f0-9]{64}$/;

describe('createToursFlowClientKey', () => {
  beforeEach(() => {
    vi.stubEnv('TOURSFLOW_API_SECRET', 'segredo-de-teste-claramente-fake');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('produz 64 caracteres hex minúsculos', () => {
    const key = createToursFlowClientKey('203.0.113.10');
    expect(key).toMatch(HEX64);
  });

  it('é determinístico: mesmo IP + mesmo secret -> mesmo HMAC', () => {
    const a = createToursFlowClientKey('203.0.113.10');
    const b = createToursFlowClientKey('203.0.113.10');
    expect(a).toBe(b);
  });

  it('IP diferente -> HMAC diferente', () => {
    const a = createToursFlowClientKey('203.0.113.10');
    const b = createToursFlowClientKey('203.0.113.11');
    expect(a).not.toBe(b);
  });

  it('mesmo IP, secret diferente -> HMAC diferente', () => {
    const a = createToursFlowClientKey('203.0.113.10');
    vi.stubEnv('TOURSFLOW_API_SECRET', 'outro-segredo-de-teste-fake');
    const b = createToursFlowClientKey('203.0.113.10');
    expect(a).not.toBe(b);
  });

  it('falha com INTERNAL_ERROR quando TOURSFLOW_API_SECRET está ausente', () => {
    vi.stubEnv('TOURSFLOW_API_SECRET', '');
    expect(() => createToursFlowClientKey('203.0.113.10')).toThrow(BookingApiError);
    try {
      createToursFlowClientKey('203.0.113.10');
    } catch (error) {
      expect((error as BookingApiError).code).toBe('INTERNAL_ERROR');
    }
  });
});
