'use client';

import { useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import type { Departure } from '@/types';
import { formatDepartureDateTime, formatPrice, centsToReais } from '@/lib/format';
import { buildVoucherShareMessage, buildWhatsAppShareUrl } from '@/lib/whatsapp-voucher';
import type { NauticFlowBookingPaymentView } from '@/types/payment';
import { LogoLockup } from '@/components/brand/Logo';

interface BookingVoucherProps {
  departure: Departure;
  bookingId: string;
  payment: NauticFlowBookingPaymentView;
  /** Nome do passeio — vem de `tour.name` (página), não do payment. Ausente: a linha some, nunca um placeholder. */
  tourName?: string;
  /** `tour.boardingPoint.name` — ausente: o bloco "Embarque" some, nunca um placeholder. */
  boardingPointName?: string;
  /** `tour.boardingPoint.reference` — opcional mesmo quando `boardingPointName` existe (nem todo operador cadastra). */
  boardingPointReference?: string;
}

/**
 * Estado final do fluxo (reserva concluída) — só alcançável depois de
 * `PixPayment` reportar `status: 'paid'` (`BookingSelector` só guarda
 * `paymentResult` dentro do `onPaid` daquele componente — ver
 * `BookingSelector.payment.test.tsx`, que prova a cadeia completa
 * seleção → confirmação → pending → paid → voucher). Este componente
 * confia nesse contrato e não reimplementa a checagem: não recebe (nem
 * precisa receber) um campo de status próprio — quem o monta é sempre
 * quem já verificou `paid`.
 *
 * "Comprovante ToursFlow", NÃO o voucher operacional do NauticFlow: o
 * formato/entrega do voucher real (QR de embarque, validação de
 * ingresso) não está definido em nenhum contrato confirmado (mesma
 * ressalva de `src/types/payment.ts`) — se/quando existir, é
 * responsabilidade do NauticFlow (ver docs/PLANO-INTEGRACAO-NAUTICFLOW.md,
 * Fase 10). Esta tela só resume o que o ToursFlow já sabe da reserva
 * confirmada e permite compartilhar isso manualmente — nenhum QR code,
 * nenhuma validação de ingresso.
 *
 * Compartilhamento é sempre uma ação explícita do turista
 * (`https://wa.me/?text=...`, sem número de destino) — nunca um envio
 * automático para o telefone do comprador ou do operador. Ver ADR-017
 * em docs/DECISIONS.md para a evolução futura (WhatsApp Business API).
 */
export function BookingVoucher({
  departure,
  bookingId,
  payment,
  tourName,
  boardingPointName,
  boardingPointReference,
}: BookingVoucherProps) {
  const { date, time } = formatDepartureDateTime(departure.departsAt);
  const pricePaidLabel = formatPrice(centsToReais(payment.totalCents));
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const shareMessage = buildVoucherShareMessage({
    tourName,
    bookingId,
    date,
    time,
    quantity: payment.quantity,
    pricePaidLabel,
    boardingPointName,
    boardingPointReference,
  });
  const whatsAppUrl = buildWhatsAppShareUrl(shareMessage);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 2000);
  }

  return (
    <div className="rounded-card border border-ink/10 bg-white p-6">
      <LogoLockup size={24} />

      <p className="eyebrow mt-4">Reserva confirmada</p>
      <h3 className="mt-2 font-display text-xl font-bold">{tourName ?? 'Pagamento recebido'}</h3>

      <dl className="mt-5 space-y-2 rounded-2xl bg-sand p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Código da reserva</dt>
          <dd className="font-semibold">{bookingId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Data</dt>
          <dd className="font-semibold capitalize">{date}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Horário</dt>
          <dd className="font-semibold">{time}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Pessoas</dt>
          <dd className="font-semibold">{payment.quantity}</dd>
        </div>
        {boardingPointName ? (
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Embarque</dt>
            <dd className="text-right font-semibold">
              {boardingPointName}
              {boardingPointReference ? (
                <span className="block text-xs font-normal text-ink-muted">{boardingPointReference}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-ink/10 pt-2">
          <dt className="text-ink-muted">Valor pago</dt>
          <dd className="font-display text-base font-bold">{pricePaidLabel}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-ink-muted">Apresente o código da reserva no embarque, se solicitado.</p>

      <div className="mt-5 space-y-2">
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full active:scale-[0.98]"
        >
          <MessageCircle size={18} aria-hidden />
          Compartilhar no WhatsApp
        </a>
        <button type="button" onClick={handleCopy} className="btn-secondary w-full active:scale-[0.98]">
          {copyState === 'copied' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copyState === 'copied' ? 'Copiado' : copyState === 'error' ? 'Não foi possível copiar' : 'Copiar dados da reserva'}
        </button>
      </div>
    </div>
  );
}
