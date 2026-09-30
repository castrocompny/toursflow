import { describe, expect, it } from 'vitest';
import {
  BOOKING_CHECKOUT_ENABLED,
  PAYMENTS_UI_ENABLED,
  TRANSACTIONAL_PREVIEW_BRANCH,
  isTransactionalPreviewBuild,
} from './feature-flags';

describe('isTransactionalPreviewBuild', () => {
  it('liga só no Preview da branch autorizada', () => {
    expect(isTransactionalPreviewBuild('preview', TRANSACTIONAL_PREVIEW_BRANCH)).toBe(true);
  });

  it('nunca liga em Production, mesmo na branch autorizada', () => {
    expect(isTransactionalPreviewBuild('production', TRANSACTIONAL_PREVIEW_BRANCH)).toBe(false);
    expect(isTransactionalPreviewBuild('production', 'main')).toBe(false);
  });

  it('não liga no Preview de outra branch', () => {
    expect(isTransactionalPreviewBuild('preview', 'main')).toBe(false);
    expect(isTransactionalPreviewBuild('preview', 'e2e/real-payment')).toBe(false);
  });

  it('falha fechado sem ambiente/branch (local, testes)', () => {
    expect(isTransactionalPreviewBuild(undefined, undefined)).toBe(false);
    expect(isTransactionalPreviewBuild('', '')).toBe(false);
    expect(isTransactionalPreviewBuild('development', TRANSACTIONAL_PREVIEW_BRANCH)).toBe(false);
  });
});

describe('flags no ambiente de teste', () => {
  it('ficam desligadas fora do build de Preview da Vercel', () => {
    expect(BOOKING_CHECKOUT_ENABLED).toBe(false);
    expect(PAYMENTS_UI_ENABLED).toBe(false);
  });
});
