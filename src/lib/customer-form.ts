/**
 * Validação/normalização/máscara do formulário de dados do comprador —
 * Fase 2 do fluxo de reserva. Lógica pura, sem DOM, para ser testável sem
 * renderizar componente.
 *
 * Os limites de tamanho (name/email/phone/cpf) espelham exatamente o que
 * `src/lib/booking-validation.ts` já aceita no backend — nunca inventa um
 * limite mais apertado nem mais permissivo que o contrato real. CPF
 * continua opcional aqui pela mesma razão que é opcional em
 * `BookingCustomerInput` (`src/types/booking.ts`): o NauticFlow não exige.
 *
 * A regra de "10 ou 11 dígitos" para telefone é UX própria do ToursFlow
 * (dar um erro específico e cedo ao turista), não um requisito do
 * contrato do NauticFlow — o backend só exige uma string não vazia de até
 * 40 caracteres, sem validar formato.
 */

export interface CustomerFormValues {
  name: string;
  email: string;
  phone: string;
  cpf: string;
}

export const EMPTY_CUSTOMER_FORM_VALUES: CustomerFormValues = { name: '', email: '', phone: '', cpf: '' };

const NAME_MAX = 200;
const EMAIL_MAX = 200;
const PHONE_MAX = 40;
const CPF_DIGITS = 11;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Informe o nome completo.';
  if (trimmed.length > NAME_MAX) return `Nome muito longo (máximo ${NAME_MAX} caracteres).`;
  return null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim();
}

export function validateEmail(raw: string): string | null {
  const trimmed = normalizeEmail(raw);
  if (!trimmed) return 'Informe o e-mail.';
  if (trimmed.length > EMAIL_MAX) return 'E-mail muito longo.';
  if (!EMAIL_RE.test(trimmed)) return 'E-mail inválido.';
  return null;
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function validatePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Informe o telefone.';
  if (trimmed.length > PHONE_MAX) return 'Telefone muito longo.';
  const digits = normalizePhone(raw);
  if (digits.length < 10 || digits.length > 11) return 'Telefone inválido. Use DDD + número.';
  return null;
}

/** Máscara visual "(11) 91234-5678" enquanto o turista digita — nunca é a fonte de verdade, só normalizePhone() é. */
export function formatPhoneMask(raw: string): string {
  const digits = normalizePhone(raw).slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

function cpfChecksumDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

function isCpfChecksumValid(digits: string): boolean {
  if (digits.length !== CPF_DIGITS) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // sequência repetida (ex.: 111.111.111-11) nunca é CPF real
  return cpfChecksumDigit(digits, 9) === Number(digits[9]) && cpfChecksumDigit(digits, 10) === Number(digits[10]);
}

/** CPF é opcional — string vazia é válida (não confunde "não informado" com "inválido"). */
export function validateCpf(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = normalizeCpf(trimmed);
  if (!isCpfChecksumValid(digits)) return 'CPF inválido.';
  return null;
}

/** Máscara visual "123.456.789-09" enquanto o turista digita. */
export function formatCpfMask(raw: string): string {
  const digits = normalizeCpf(raw).slice(0, CPF_DIGITS);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export interface CustomerFormErrors {
  name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
}

export function validateCustomerForm(values: CustomerFormValues): CustomerFormErrors {
  return {
    name: validateName(values.name),
    email: validateEmail(values.email),
    phone: validatePhone(values.phone),
    cpf: validateCpf(values.cpf),
  };
}

export function isCustomerFormValid(errors: CustomerFormErrors): boolean {
  return !errors.name && !errors.email && !errors.phone && !errors.cpf;
}

// --- Máscaras para exibição (step de revisão) — nunca o dado completo. ---

/** "j***@dominio.com" — mantém só a primeira letra do usuário visível. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  const visible = user.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

/** "(11) *****-5678" — mantém DDD e os 4 últimos dígitos visíveis. */
export function maskPhone(raw: string): string {
  const digits = normalizePhone(raw);
  if (digits.length < 6) return '****';
  const ddd = digits.slice(0, 2);
  const last4 = digits.slice(-4);
  return `(${ddd}) *****-${last4}`;
}

/** "***.***.***-XX" — só os 2 dígitos verificadores ficam visíveis. */
export function maskCpf(raw: string): string {
  const digits = normalizeCpf(raw);
  if (digits.length !== CPF_DIGITS) return '';
  return `***.***.***-${digits.slice(9)}`;
}
