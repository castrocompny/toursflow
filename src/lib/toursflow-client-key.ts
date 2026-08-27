import 'server-only';
import { createHmac } from 'node:crypto';
import { BookingApiError } from './booking-errors';

/**
 * Identidade pseudônima e estável do visitante para o rate limit do
 * NauticFlow — HMAC-SHA256 do IP, usando o MESMO `TOURSFLOW_API_SECRET`
 * que já autentica ToursFlow -> NauticFlow. O NauticFlow nunca recebe o
 * IP em claro, só este hash de 64 caracteres hex.
 *
 * `rate-limit:v1:` é domain separation: garante que este HMAC nunca pode
 * ser confundido com o uso do mesmo segredo em outro contexto (o Bearer
 * de autenticação, por exemplo), mesmo que ambos usem a mesma chave.
 */
const DOMAIN_PREFIX = 'rate-limit:v1:';

export function createToursFlowClientKey(normalizedIp: string): string {
  const secret = process.env.TOURSFLOW_API_SECRET;
  if (!secret) {
    // Mesma falha segura do resto da camada de reservas — nunca um HMAC com chave fake.
    throw new BookingApiError(500, 'INTERNAL_ERROR', 'Configuração do serviço de reservas ausente.');
  }
  return createHmac('sha256', secret).update(`${DOMAIN_PREFIX}${normalizedIp}`).digest('hex');
}
