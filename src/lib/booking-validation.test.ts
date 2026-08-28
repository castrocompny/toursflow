import { describe, expect, it } from 'vitest';
import { validateBookingInput, validateIdempotencyKey } from './booking-validation';

const VALID_UUID = '9c858901-8a57-4791-81fe-4c455b099bc9';

const validPayload = {
  departureId: VALID_UUID,
  quantity: 2,
  customer: {
    name: 'Turista Teste',
    email: 'turista@example.com',
    phone: '+55 22 99999-0000',
  },
};

describe('validateBookingInput', () => {
  it('aceita um payload válido e devolve só os campos esperados', () => {
    const result = validateBookingInput(validPayload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        departureId: VALID_UUID,
        quantity: 2,
        customer: {
          name: 'Turista Teste',
          email: 'turista@example.com',
          phone: '+55 22 99999-0000',
        },
      });
    }
  });

  it('rejeita corpo que não é objeto', () => {
    const result = validateBookingInput('não é json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.code).toBe('INVALID_REQUEST');
    }
  });

  it('rejeita departureId que não é UUID', () => {
    const result = validateBookingInput({ ...validPayload, departureId: 'não-é-uuid' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_REQUEST');
  });

  it('rejeita quantity inválida: zero, negativo ou fracionário', () => {
    expect(validateBookingInput({ ...validPayload, quantity: 0 }).ok).toBe(false);
    expect(validateBookingInput({ ...validPayload, quantity: -1 }).ok).toBe(false);
    expect(validateBookingInput({ ...validPayload, quantity: 2.5 }).ok).toBe(false);
  });

  it('NÃO rejeita quantity alta — não existe teto oficial no contrato do NauticFlow', () => {
    // O NauticFlow é quem decide se a quantidade é aceitável (capacidade
    // real). O ToursFlow não inventa um limite de negócio aqui.
    expect(validateBookingInput({ ...validPayload, quantity: 51 }).ok).toBe(true);
    expect(validateBookingInput({ ...validPayload, quantity: 1000 }).ok).toBe(true);
  });

  it('rejeita customer.email inválido', () => {
    const result = validateBookingInput({
      ...validPayload,
      customer: { ...validPayload.customer, email: 'não é um email' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejeita quando customer.name/phone estão ausentes', () => {
    expect(
      validateBookingInput({ ...validPayload, customer: { email: 'a@b.com', phone: '123' } }).ok,
    ).toBe(false);
    expect(
      validateBookingInput({ ...validPayload, customer: { name: 'A', email: 'a@b.com' } }).ok,
    ).toBe(false);
  });

  it('aceita cpf quando presente e o inclui no resultado', () => {
    const result = validateBookingInput({
      ...validPayload,
      customer: { ...validPayload.customer, cpf: '12345678900' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.customer.cpf).toBe('12345678900');
  });

  it('rejeita customer.name/email/phone/cpf além do tamanho máximo', () => {
    expect(
      validateBookingInput({ ...validPayload, customer: { ...validPayload.customer, name: 'A'.repeat(201) } }).ok,
    ).toBe(false);
    expect(
      validateBookingInput({
        ...validPayload,
        customer: { ...validPayload.customer, email: `${'a'.repeat(195)}@b.com` },
      }).ok,
    ).toBe(false);
    expect(
      validateBookingInput({ ...validPayload, customer: { ...validPayload.customer, phone: '1'.repeat(41) } }).ok,
    ).toBe(false);
    expect(
      validateBookingInput({ ...validPayload, customer: { ...validPayload.customer, cpf: '1'.repeat(21) } }).ok,
    ).toBe(false);
  });

  it('NUNCA repassa campos extras/maliciosos mesmo que venham no JSON', () => {
    const malicious = {
      ...validPayload,
      companyId: 'empresa-de-outro-operador',
      tourId: 'passeio-arbitrario',
      price: 1,
      total: 1,
      status: 'confirmado',
      source: 'admin',
    };
    const result = validateBookingInput(malicious);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.data);
      expect(keys).toEqual(['departureId', 'quantity', 'customer']);
      expect(Object.keys(result.data.customer)).toEqual(['name', 'email', 'phone']);
    }
  });
});

describe('validateIdempotencyKey', () => {
  it('aceita um UUID válido', () => {
    const result = validateIdempotencyKey(VALID_UUID);
    expect(result.ok).toBe(true);
  });

  it('rejeita quando ausente', () => {
    const result = validateIdempotencyKey(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    }
  });

  it('rejeita quando não é um UUID', () => {
    const result = validateIdempotencyKey('qualquer-string-solta');
    expect(result.ok).toBe(false);
  });
});
