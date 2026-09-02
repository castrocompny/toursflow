import 'server-only';
import { isIP } from 'node:net';

/**
 * IP confiável do visitante — só para gerar a identidade pseudônima do
 * rate limit (`toursflow-client-key.ts`). Nunca persistido, nunca logado,
 * nunca devolvido ao navegador.
 *
 * Fonte em produção (Vercel): `x-vercel-forwarded-for` — a Vercel garante
 * esse header no seu edge, o cliente não consegue forjá-lo. Nunca aceitar
 * um header customizado vindo do navegador (`X-Client-IP` e similares),
 * nem IP no body ou em query string.
 *
 * Fora da Vercel (dev local, testes): fallback controlado para
 * `x-forwarded-for`, detectado por `process.env.VERCEL !== '1'` — a
 * variável que a própria Vercel define automaticamente em todo ambiente
 * dela (produção, preview e `vercel dev`). Em produção real, se o header
 * confiável não existir ou for inválido, falha fechado — nunca gera uma
 * identidade compartilhada tipo "unknown"/"anonymous"/"0.0.0.0".
 */

const MAX_HEADER_LENGTH = 2048;
const IPV4_MAPPED_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

/**
 * Extrai e valida um único IP de um valor de header cru — que pode vir
 * como lista ("cliente, proxy1, proxy2"), com porta, ou com colchetes de
 * IPv6. Retorna `null` se não for possível extrair um IP válido.
 */
export function normalizeClientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > MAX_HEADER_LENGTH) return null;

  // O primeiro item da lista é o mais próximo do cliente original.
  const first = raw.split(',')[0]?.trim();
  if (!first) return null;

  let candidate = first;
  if (candidate.startsWith('[')) {
    // "[::1]:12345" -> "::1"
    const closing = candidate.indexOf(']');
    if (closing < 0) return null;
    candidate = candidate.slice(1, closing);
  } else if ((candidate.match(/:/g) ?? []).length === 1) {
    // Um único ":" só pode ser "IPv4:porta" — IPv6 puro tem vários ":".
    candidate = candidate.split(':')[0];
  }
  candidate = candidate.trim();

  const version = isIP(candidate);
  if (version === 0) return null;

  if (version === 6) {
    candidate = candidate.toLowerCase();
    // IPv4-mapped ("::ffff:1.2.3.4"): normaliza para o IPv4 puro, senão o
    // mesmo visitante vira duas identidades diferentes conforme a pilha
    // de rede que o proxy relatar.
    const mapped = candidate.match(IPV4_MAPPED_RE);
    if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  }

  return candidate;
}

/**
 * IP confiável da requisição atual, já normalizado. Chama `onUnavailable()`
 * (nunca retorna uma identidade compartilhada) quando não é possível
 * determinar um IP confiável.
 *
 * `onUnavailable` é injetado (em vez desta função lançar um erro fixo)
 * para cada rota poder lançar o próprio tipo de erro (`BookingApiError`,
 * `PaymentApiError`, ...) sem este módulo depender de nenhum deles —
 * mesmo padrão de `readBodyWithLimit()` em `http-guards.ts`.
 */
export function getTrustedClientIp(request: Request, onUnavailable: () => never): string {
  const onVercel = process.env.VERCEL === '1';

  if (onVercel) {
    const ip = normalizeClientIp(request.headers.get('x-vercel-forwarded-for'));
    if (ip) return ip;
    onUnavailable();
  }

  // Fallback só fora da Vercel — nunca em produção real.
  const fallback = normalizeClientIp(request.headers.get('x-forwarded-for'));
  if (fallback) return fallback;

  onUnavailable();
}
