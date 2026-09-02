import 'server-only';
import { NextResponse } from 'next/server';
import { PaymentApiError } from '@/lib/payment-errors';
import { getPaymentErrorMessage } from '@/lib/payment-error-messages';
import {
  validateBookingId,
  validatePaymentIdempotencyKey,
  validatePaymentMethod,
} from '@/lib/payment-validation';
import { getTrustedClientIp } from '@/lib/client-ip';
import { createToursFlowClientKey } from '@/lib/toursflow-client-key';
import { createNauticFlowPayment, getNauticFlowBookingStatus } from '@/lib/nauticflow-payments';
import { MAX_BODY_BYTES, hasAllowedContentType, isTrustedOrigin, readBodyWithLimit } from '@/lib/http-guards';
import { PAYMENTS_UI_ENABLED } from '@/lib/feature-flags';

/**
 * `POST`/`GET /api/bookings/[bookingId]/payment` — únicas rotas do
 * ToursFlow para o fluxo de pagamento (Pix).
 *
 * browser -> ESTA ROTA -> NauticFlow (POST/GET .../bookings/{id}/payment | .../bookings/{id})
 *
 * Mesmo padrão de segurança de `/api/bookings` (ver esse arquivo e
 * docs/SECURITY.md): Origin/Sec-Fetch-Site, Content-Type restrito
 * (só no POST), limite real de corpo, IP confiável + HMAC calculados
 * sempre aqui — nunca a partir de um header vindo do navegador.
 *
 * **Trava server-side, não só ausência de botão na UI** (2026-09-02):
 * `PAYMENTS_UI_ENABLED === false` (`src/lib/feature-flags.ts`) é
 * verificado AQUI, antes de qualquer outra coisa — inclusive antes do
 * Origin check — em `POST` e `GET`. A ausência do botão "Pagar com Pix"
 * no React nunca foi (e nunca deveria ser tratada como) uma proteção de
 * segurança: qualquer `curl`/`fetch` direto a esta rota chegaria ao
 * NauticFlow sem essa checagem. Ver ADR-012 em docs/DECISIONS.md e
 * docs/PAYMENTS.md — "UI flag != security boundary".
 *
 * Nunca aceita `amount` do corpo — o `POST` só aceita
 * `{ paymentMethod: "pix" }`; o valor cobrado é sempre recalculado pelo
 * NauticFlow a partir do `bookingId`.
 */

/** Mesmo code que o NauticFlow usa quando `MARKETPLACE_PAYMENTS_ENABLED` está off — do ponto de vista do turista, os dois motivos têm o mesmo efeito e a mesma mensagem segura. */
function throwIfPaymentsDisabled(): void {
  if (!PAYMENTS_UI_ENABLED) {
    throw new PaymentApiError(422, 'PAYMENT_PROVIDER_NOT_ENABLED', getPaymentErrorMessage('PAYMENT_PROVIDER_NOT_ENABLED'));
  }
}

function toErrorResponse(error: unknown, logPrefix: string) {
  if (error instanceof PaymentApiError) {
    return NextResponse.json(error.toResponseBody(), { status: error.status });
  }
  // Nunca deixar um erro não mapeado vazar stack trace/detalhe interno ao navegador.
  console.error(logPrefix, error);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado ao processar o pagamento.' } },
    { status: 500 },
  );
}

interface RouteParams {
  params: { bookingId: string };
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    // Primeiro de tudo — antes de Origin, Content-Type, ou qualquer
    // parsing. Zero trabalho e zero exposição além do estritamente
    // necessário quando o pagamento está desligado.
    throwIfPaymentsDisabled();

    if (!isTrustedOrigin(request)) {
      throw new PaymentApiError(403, 'INVALID_REQUEST', 'Origem não permitida.');
    }

    if (!hasAllowedContentType(request)) {
      throw new PaymentApiError(415, 'INVALID_REQUEST', 'Content-Type precisa ser application/json.');
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      throw new PaymentApiError(413, 'INVALID_REQUEST', 'Corpo da requisição excede o tamanho permitido.');
    }

    const bookingId = validateBookingId(params.bookingId);
    if (!bookingId.ok) throw bookingId.error;

    // IP confiável e HMAC calculados aqui, sempre server-side — nunca a
    // partir de um header que o navegador possa ter enviado.
    const clientIp = getTrustedClientIp(request, () => {
      throw new PaymentApiError(503, 'CLIENT_IP_UNAVAILABLE', 'Não foi possível iniciar o pagamento agora. Tente novamente.');
    });
    const clientKey = createToursFlowClientKey(clientIp);

    const idempotency = validatePaymentIdempotencyKey(request.headers.get('idempotency-key'));
    if (!idempotency.ok) throw idempotency.error;

    const bodyText = await readBodyWithLimit(request, MAX_BODY_BYTES, () => {
      throw new PaymentApiError(413, 'INVALID_REQUEST', 'Corpo da requisição excede o tamanho permitido.');
    });

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(bodyText);
    } catch {
      throw new PaymentApiError(400, 'INVALID_REQUEST', 'Corpo da requisição precisa ser JSON válido.');
    }

    const method = validatePaymentMethod(rawBody);
    if (!method.ok) throw method.error;

    const result = await createNauticFlowPayment(bookingId.data, idempotency.data, clientKey);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, '[api/bookings/[bookingId]/payment POST] erro não mapeado');
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    // O GET em si não tem efeito financeiro (só leitura — nunca cria
    // payment, nunca movimenta dinheiro). Bloqueado mesmo assim, por
    // decisão deliberada, não reflexo: (1) com PAYMENTS_UI_ENABLED
    // false, nenhum pagamento pode ter sido criado por este caminho, então
    // não há status legítimo de pagamento para consultar; (2) evita expor
    // uma superfície de leitura (status/holdExpiresAt/quantity de
    // qualquer bookingId) enquanto o recurso inteiro está desligado, sem
    // custo real — nada hoje depende de chamar este GET com a flag off.
    // Ver ADR-012 em docs/DECISIONS.md.
    throwIfPaymentsDisabled();

    if (!isTrustedOrigin(request)) {
      throw new PaymentApiError(403, 'INVALID_REQUEST', 'Origem não permitida.');
    }

    const bookingId = validateBookingId(params.bookingId);
    if (!bookingId.ok) throw bookingId.error;

    const clientIp = getTrustedClientIp(request, () => {
      throw new PaymentApiError(503, 'CLIENT_IP_UNAVAILABLE', 'Não foi possível iniciar o pagamento agora. Tente novamente.');
    });
    const clientKey = createToursFlowClientKey(clientIp);

    const result = await getNauticFlowBookingStatus(bookingId.data, clientKey);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, '[api/bookings/[bookingId]/payment GET] erro não mapeado');
  }
}
