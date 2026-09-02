/**
 * Guards HTTP compartilhados por toda rota de escrita/leitura protegida
 * do ToursFlow (`/api/bookings`, `/api/bookings/[bookingId]/payment`).
 * Extraído de `src/app/api/bookings/route.ts` (Fase 2) quando a segunda
 * rota precisou exatamente da mesma proteção — nenhuma mudança de
 * comportamento, só compartilhamento.
 */

/**
 * Hosts oficiais do ToursFlow, além do host da própria requisição (que já
 * cobre produção, cada preview deploy e dev local automaticamente via
 * comparação Origin/Host abaixo). Só nomes de domínio públicos — não é
 * segredo, não precisa vir de env var.
 */
export const ALLOWED_ORIGIN_HOSTS = new Set(['toursflow.com.br', 'toursflow.vercel.app']);

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
 *    deixa passar (ver limitação no doc).
 */
export function isTrustedOrigin(request: Request): boolean {
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

/** ~10KB — generoso para qualquer payload real destas rotas; nunca deveria chegar perto disso legitimamente. */
export const MAX_BODY_BYTES = 10_000;

/** Só `application/json`, com ou sem `charset` — nunca outro tipo de conteúdo. */
export function hasAllowedContentType(request: Request): boolean {
  const contentType = request.headers.get('content-type');
  if (!contentType) return false;
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * Lê o corpo da requisição contando bytes reais recebidos, em vez de
 * confiar em `Content-Length` (que é só um header — o cliente pode mentir,
 * omitir, ou mandar mais dado do que declarou). Aborta a leitura e chama
 * `onTooLarge()` assim que os bytes recebidos ultrapassam `maxBytes`, sem
 * nunca acumular mais que isso mais um chunk em memória. `JSON.parse` só
 * deve acontecer depois desta função retornar — nunca antes da
 * verificação de tamanho.
 *
 * `onTooLarge` é injetado (em vez desta função lançar um erro fixo) para
 * cada rota poder lançar o próprio tipo de erro (`BookingApiError`,
 * `PaymentApiError`, ...) sem este módulo depender de nenhum deles.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number, onTooLarge: () => never): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      onTooLarge();
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
