/**
 * Mensagem de compartilhamento manual do comprovante de reserva pelo
 * WhatsApp. Só isso: o turista clica, o WhatsApp abre com o texto já
 * pronto, e ELE decide para quem enviar (`https://wa.me/?text=...`, sem
 * número de destino) — nunca um envio automático para o telefone do
 * comprador nem para o operador. Envio automático via WhatsApp Business
 * API é evolução futura separada (ver ADR-017 em docs/DECISIONS.md), não
 * implementada aqui.
 *
 * `VoucherShareData` é deliberadamente enxuto: só campos públicos da
 * reserva confirmada, sem nenhum campo de PII (nome/CPF/e-mail/telefone
 * do comprador), Idempotency-Key, id técnico de payment provider ou
 * qualquer outro dado interno do NauticFlow — não porque um filtro
 * remove esses campos, mas porque a interface nunca os aceita como
 * entrada. Todo texto já formatado (`date`/`time`/`pricePaidLabel`) é
 * responsabilidade de `src/lib/format.ts`, chamado por quem monta este
 * objeto — este módulo só monta a mensagem e a URL.
 */
export interface VoucherShareData {
  /** Ausente vira uma mensagem sem a linha "Passeio" — nunca um placeholder inventado. */
  tourName?: string;
  bookingId: string;
  /** Já formatada (`formatDepartureDateTime`), nunca recalculada aqui. */
  date: string;
  /** Já formatada (`formatDepartureDateTime`), nunca recalculada aqui. */
  time: string;
  quantity: number;
  /** Já formatado (`formatPrice`), ex.: "R$ 20,00". */
  pricePaidLabel: string;
  /** Ausente vira uma mensagem sem o bloco "Embarque" — nunca um placeholder inventado. */
  boardingPointName?: string;
  /** Referência/endereço curto do embarque, só quando o operador cadastrou. */
  boardingPointReference?: string;
}

export function buildVoucherShareMessage(data: VoucherShareData): string {
  const lines: string[] = ['Reserva confirmada — ToursFlow', ''];

  if (data.tourName) lines.push(`Passeio: ${data.tourName}`);
  lines.push(`Código: ${data.bookingId}`);
  lines.push(`Data: ${data.date}`);
  lines.push(`Horário: ${data.time}`);
  lines.push(`Pessoas: ${data.quantity}`);
  lines.push(`Valor pago: ${data.pricePaidLabel}`);

  if (data.boardingPointName) {
    lines.push('', 'Embarque:', data.boardingPointName);
    if (data.boardingPointReference) lines.push(data.boardingPointReference);
  }

  lines.push('', 'Guarde este código para o dia do passeio.', '', 'ToursFlow');

  return lines.join('\n');
}

/**
 * `wa.me` sem número de destino: abre o seletor de conversa do próprio
 * WhatsApp do turista — nunca aponta para um número específico (nem do
 * operador, nem do comprador). `encodeURIComponent` cobre espaço, quebra
 * de linha e acentuação; é o único encoding aplicado, então o texto
 * decodificado da URL é sempre igual, byte a byte, ao que entrou aqui.
 */
export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
