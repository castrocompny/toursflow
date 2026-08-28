import 'server-only';
import { NextResponse } from 'next/server';
import { BookingApiError } from '@/lib/booking-errors';
import { validateBookingInput, validateIdempotencyKey } from '@/lib/booking-validation';
import { getTrustedClientIp } from '@/lib/client-ip';
import { createNauticFlowBooking } from '@/lib/nauticflow-bookings';
import { createToursFlowClientKey } from '@/lib/toursflow-client-key';

/**
 * POST /api/bookings — única rota do ToursFlow que inicia uma reserva.
 *
 * browser -> ESTA ROTA -> NauticFlow (POST /api/marketplace/bookings)
 *
 * O navegador nunca chama o NauticFlow diretamente: o segredo
 * (`TOURSFLOW_API_SECRET`) só existe aqui, do lado do servidor.
 *
 * A identidade de rate limit (`X-ToursFlow-Client-Key`) é SEMPRE
 * recalculada aqui a partir do IP confiável da requisição — mesmo que o
 * navegador mande um header com esse nome, ele nunca é lido (a rota nunca
 * chama `request.headers.get('x-toursflow-client-key')`), então não há
 * como um cliente forjar a própria identidade do rate limiter.
 *
 * IMPORTANTE (2026-08-27): esta rota existe mas ainda NÃO está conectada a
 * nenhum botão da interface pública. Ver docs/RESERVAS-SERVER-TO-SERVER.md.
 *
 * Hardening (2026-08-28, Fase 2): Content-Type restrito a `application/json`,
 * limite de tamanho de corpo sobre os bytes REALMENTE recebidos (não só
 * `Content-Length`, que é só um header — ver `readBodyWithLimit()`), e
 * checagem de origem reforçada com `Sec-Fetch-Site` + allowlist de hosts
 * oficiais — ver docs/SECURITY.md.
 */

/**
 * Hosts oficiais do ToursFlow, além do host da própria requisição (que já
 * cobre produção, cada preview deploy e dev local automaticamente via
 * comparação Origin/Host abaixo). Só nomes de domínio públicos — não é
 * segredo, não precisa vir de env var.
 */
const ALLOWED_ORIGIN_HOSTS = new Set(['toursflow.com.br', 'toursflow.vercel.app']);

/**
 * Checagem best-effort de mesma origem/mesmo site. Não substitui
 * autenticação nem é proteção CSRF completa (não há sessão de usuário
 * nesta etapa) — é só uma primeira barreira contra POST cross-site óbvio.
 *
 * Ordem de sinais:
 * 1. `Sec-Fetch-Site` (enviado automaticamente por navegadores modernos em
 *    toda requisição `fetch`, não pode ser forjado por JS de página): se
 *    o próprio navegador diz "cross-site", rejeita sempre — sinal mais
 *    forte que temos, mesmo que `Origin` esteja ausente ou falsificado por
 *    um cliente não-browser.
 * 2. Sem esse header (navegador antigo, cliente não-browser) ou valor
 *    diferente de "cross-site": cai para `Origin` vs. `Host`/allowlist,
 *    igual à checagem anterior — se `Origin` também estiver ausente,
 *    deixa passar (ver limitação abaixo).
 */
function isTrustedOrigin(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true; // navegadores nem sempre mandam Origin; ver limitação no doc.

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  return originHost === request.headers.get('host') || ALLOWED_ORIGIN_HOSTS.has(originHost);
}

/** ~10KB — generoso para um payload de reserva (nome/e-mail/telefone/CPF/departureId/quantity); nunca deveria chegar perto disso legitimamente. */
const MAX_BODY_BYTES = 10_000;

/** Só `application/json`, com ou sem `charset` — nunca outro tipo de conteúdo. */
function hasAllowedContentType(request: Request): boolean {
  const contentType = request.headers.get('content-type');
  if (!contentType) return false;
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * Lê o corpo da requisição contando bytes reais recebidos, em vez de
 * confiar em `Content-Length` (que é só um header — o cliente pode mentir,
 * omitir, ou mandar mais dado do que declarou). Aborta a leitura e lança
 * 413 assim que os bytes recebidos ultrapassam `MAX_BODY_BYTES`, sem
 * nunca acumular mais que isso mais um chunk em memória. `JSON.parse` só
 * acontece depois desta função retornar — nunca antes da verificação de
 * tamanho.
 */
async function readBodyWithLimit(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new BookingApiError(413, 'INVALID_REQUEST', 'Corpo da requisição excede o tamanho permitido.');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

export async function POST(request: Request) {
  try {
    if (!isTrustedOrigin(request)) {
      throw new BookingApiError(403, 'INVALID_REQUEST', 'Origem não permitida.');
    }

    if (!hasAllowedContentType(request)) {
      throw new BookingApiError(415, 'INVALID_REQUEST', 'Content-Type precisa ser application/json.');
    }

    // Rejeição antecipada quando o próprio Content-Length já admite ser
    // grande demais — evita ler um único byte do corpo nesse caso. Não é
    // a proteção real (o header pode mentir ou estar ausente): essa vem
    // de `readBodyWithLimit()`, que conta os bytes de fato recebidos.
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      throw new BookingApiError(413, 'INVALID_REQUEST', 'Corpo da requisição excede o tamanho permitido.');
    }

    // IP confiável e HMAC calculados aqui, sempre server-side — nunca a
    // partir de um header que o navegador possa ter enviado.
    const clientIp = getTrustedClientIp(request);
    const clientKey = createToursFlowClientKey(clientIp);

    const idempotency = validateIdempotencyKey(request.headers.get('idempotency-key'));
    if (!idempotency.ok) throw idempotency.error;

    const bodyText = await readBodyWithLimit(request);

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(bodyText);
    } catch {
      throw new BookingApiError(400, 'INVALID_REQUEST', 'Corpo da requisição precisa ser JSON válido.');
    }

    const input = validateBookingInput(rawBody);
    if (!input.ok) throw input.error;

    const result = await createNauticFlowBooking(input.data, idempotency.data, clientKey);

    const response = NextResponse.json({ data: result.data }, { status: result.status });
    if (result.replayed) response.headers.set('Idempotency-Replayed', 'true');
    return response;
  } catch (error) {
    if (error instanceof BookingApiError) {
      return NextResponse.json(error.toResponseBody(), { status: error.status });
    }
    // Nunca deixar um erro não mapeado vazar stack trace/detalhe interno ao navegador.
    console.error('[api/bookings] erro não mapeado', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado ao processar a reserva.' } },
      { status: 500 },
    );
  }
}
