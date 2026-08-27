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
 */

/**
 * Checagem best-effort de mesma origem. Não substitui autenticação nem é
 * proteção CSRF completa (não há sessão de usuário nesta etapa) — é só uma
 * primeira barreira contra POST cross-site óbvio. Compara o host do
 * cabeçalho `Origin` (quando o navegador o envia) com o host da própria
 * requisição, então funciona igual em produção, preview e localhost, sem
 * depender de uma env var fixa.
 */
function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // navegadores nem sempre mandam Origin; ver limitação no doc.
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    if (!isTrustedOrigin(request)) {
      throw new BookingApiError(403, 'INVALID_REQUEST', 'Origem não permitida.');
    }

    // IP confiável e HMAC calculados aqui, sempre server-side — nunca a
    // partir de um header que o navegador possa ter enviado.
    const clientIp = getTrustedClientIp(request);
    const clientKey = createToursFlowClientKey(clientIp);

    const idempotency = validateIdempotencyKey(request.headers.get('idempotency-key'));
    if (!idempotency.ok) throw idempotency.error;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
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
