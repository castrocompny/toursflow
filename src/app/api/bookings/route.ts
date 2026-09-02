import 'server-only';
import { NextResponse } from 'next/server';
import { BookingApiError } from '@/lib/booking-errors';
import { getBookingErrorMessage } from '@/lib/booking-error-messages';
import { validateBookingInput, validateIdempotencyKey } from '@/lib/booking-validation';
import { getTrustedClientIp } from '@/lib/client-ip';
import { createNauticFlowBooking } from '@/lib/nauticflow-bookings';
import { createToursFlowClientKey } from '@/lib/toursflow-client-key';
import { MAX_BODY_BYTES, hasAllowedContentType, isTrustedOrigin, readBodyWithLimit } from '@/lib/http-guards';
import { BOOKING_CHECKOUT_ENABLED } from '@/lib/feature-flags';

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
 * `BookingReview` (Fase 3) já chama esta rota de verdade quando
 * `BOOKING_CHECKOUT_ENABLED` está ligada — hoje `false`, ver trava abaixo
 * e docs/RESERVAS-SERVER-TO-SERVER.md.
 *
 * Hardening (2026-08-28, Fase 2): Content-Type restrito a `application/json`,
 * limite de tamanho de corpo sobre os bytes REALMENTE recebidos (não só
 * `Content-Length`, que é só um header — ver `readBodyWithLimit()`), e
 * checagem de origem reforçada com `Sec-Fetch-Site` + allowlist de hosts
 * oficiais — ver docs/SECURITY.md.
 *
 * **Trava server-side do rollout, não só ausência de botão na UI**
 * (mesma lição do ADR-012 aplicada aqui): `BOOKING_CHECKOUT_ENABLED`
 * (`src/lib/feature-flags.ts`) é verificada AQUI, antes de qualquer outra
 * coisa — inclusive antes do Origin check. `BookingReview` não oferecer
 * "Confirmar reserva" nunca é, sozinho, uma proteção de segurança.
 */

/** Mesmo padrão de `throwIfPaymentsDisabled()` na rota de pagamento. */
function throwIfBookingCheckoutDisabled(): void {
  if (!BOOKING_CHECKOUT_ENABLED) {
    throw new BookingApiError(422, 'BOOKING_CHECKOUT_NOT_ENABLED', getBookingErrorMessage('BOOKING_CHECKOUT_NOT_ENABLED'));
  }
}

export async function POST(request: Request) {
  try {
    // Primeiro de tudo — antes de Origin, Content-Type, ou qualquer
    // parsing. Zero trabalho e zero exposição além do estritamente
    // necessário quando a reserva está desligada.
    throwIfBookingCheckoutDisabled();

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
    const clientIp = getTrustedClientIp(request, () => {
      throw new BookingApiError(503, 'CLIENT_IP_UNAVAILABLE', 'Não foi possível iniciar a reserva. Tente novamente.');
    });
    const clientKey = createToursFlowClientKey(clientIp);

    const idempotency = validateIdempotencyKey(request.headers.get('idempotency-key'));
    if (!idempotency.ok) throw idempotency.error;

    const bodyText = await readBodyWithLimit(request, MAX_BODY_BYTES, () => {
      throw new BookingApiError(413, 'INVALID_REQUEST', 'Corpo da requisição excede o tamanho permitido.');
    });

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
