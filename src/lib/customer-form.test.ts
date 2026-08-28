import { describe, expect, it } from 'vitest';
import {
  formatCpfMask,
  formatPhoneMask,
  isCustomerFormValid,
  maskCpf,
  maskEmail,
  maskPhone,
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  validateCpf,
  validateCustomerForm,
  validateEmail,
  validateName,
  validatePhone,
} from './customer-form';

describe('validateName', () => {
  it('rejeita vazio ou só espaço', () => {
    expect(validateName('')).not.toBeNull();
    expect(validateName('   ')).not.toBeNull();
  });

  it('aceita nome com acento e nome composto, sem exigir sobrenome', () => {
    expect(validateName('João')).toBeNull();
    expect(validateName('Maria da Conceição Ñunes')).toBeNull();
  });

  it('rejeita acima de 200 caracteres', () => {
    expect(validateName('A'.repeat(201))).not.toBeNull();
    expect(validateName('A'.repeat(200))).toBeNull();
  });
});

describe('validateEmail', () => {
  it('rejeita vazio e formato inválido', () => {
    expect(validateEmail('')).not.toBeNull();
    expect(validateEmail('não-é-email')).not.toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
  });

  it('aceita e-mail válido e faz trim', () => {
    expect(validateEmail('turista@example.com')).toBeNull();
    expect(normalizeEmail('  turista@example.com  ')).toBe('turista@example.com');
  });

  it('rejeita acima do tamanho máximo', () => {
    expect(validateEmail(`${'a'.repeat(195)}@b.com`)).not.toBeNull();
  });
});

describe('telefone', () => {
  it('normaliza para dígitos', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('11912345678');
  });

  it('rejeita vazio e quantidade de dígitos fora de 10-11', () => {
    expect(validatePhone('')).not.toBeNull();
    expect(validatePhone('123456789')).not.toBeNull(); // 9 dígitos
    expect(validatePhone('123456789012')).not.toBeNull(); // 12 dígitos
  });

  it('aceita 10 ou 11 dígitos', () => {
    expect(validatePhone('1132345678')).toBeNull(); // 10
    expect(validatePhone('11912345678')).toBeNull(); // 11
  });

  it('máscara formata progressivamente sem quebrar com poucos dígitos', () => {
    expect(formatPhoneMask('1')).toBe('(1');
    expect(formatPhoneMask('11912345678900')).toBe('(11) 91234-5678'); // corta em 11 dígitos
  });
});

describe('CPF', () => {
  it('é opcional — vazio é válido', () => {
    expect(validateCpf('')).toBeNull();
    expect(validateCpf('   ')).toBeNull();
  });

  it('rejeita sequência repetida', () => {
    expect(validateCpf('111.111.111-11')).not.toBeNull();
  });

  it('rejeita dígito verificador incorreto', () => {
    expect(validateCpf('123.456.789-00')).not.toBeNull();
  });

  it('aceita CPF com checksum válido (formatado ou só dígitos)', () => {
    // 111.444.777-35 é um CPF de teste com checksum válido, amplamente
    // usado em documentação/testes públicos — não pertence a ninguém real.
    expect(validateCpf('111.444.777-35')).toBeNull();
    expect(validateCpf('11144477735')).toBeNull();
  });

  it('normaliza e mascara mantendo só os 2 dígitos verificadores visíveis', () => {
    expect(normalizeCpf('111.444.777-35')).toBe('11144477735');
    expect(maskCpf('111.444.777-35')).toBe('***.***.***-35');
  });

  it('máscara de digitação formata progressivamente', () => {
    expect(formatCpfMask('111')).toBe('111');
    expect(formatCpfMask('111444777')).toBe('111.444.777');
    expect(formatCpfMask('11144477735999')).toBe('111.444.777-35'); // corta em 11 dígitos
  });
});

describe('validateCustomerForm / isCustomerFormValid', () => {
  const validValues = { name: 'Turista Teste', email: 'turista@example.com', phone: '11912345678', cpf: '' };

  it('formulário completo e válido (CPF vazio) passa', () => {
    const errors = validateCustomerForm(validValues);
    expect(isCustomerFormValid(errors)).toBe(true);
  });

  it('um campo inválido é suficiente para reprovar', () => {
    const errors = validateCustomerForm({ ...validValues, email: 'inválido' });
    expect(isCustomerFormValid(errors)).toBe(false);
    expect(errors.email).not.toBeNull();
    expect(errors.name).toBeNull();
  });
});

describe('máscaras de exibição (step de revisão) — nunca o dado completo', () => {
  it('maskEmail mantém só a primeira letra do usuário', () => {
    expect(maskEmail('joao@example.com')).toBe('j***@example.com');
  });

  it('maskPhone mantém só DDD e os 4 últimos dígitos', () => {
    expect(maskPhone('11912345678')).toBe('(11) *****-5678');
  });

  it('maskCpf nunca expõe os 9 primeiros dígitos', () => {
    const masked = maskCpf('11144477735');
    expect(masked).toBe('***.***.***-35');
    expect(masked).not.toContain('111444777');
  });
});
