'use client';

import type { Departure } from '@/types';
import type { CustomerFormValues } from '@/lib/customer-form';
import { maskCpf, maskEmail, maskPhone } from '@/lib/customer-form';
import { formatDepartureDateTime, formatPrice, priceTypeLabel } from '@/lib/format';

interface BookingReviewProps {
  departure: Departure;
  quantity: number;
  estimatedTotal: number;
  customer: CustomerFormValues;
  onEdit: () => void;
  onBack: () => void;
  /** Presente só quando `BOOKING_CHECKOUT_ENABLED` está ligada (`src/lib/feature-flags.ts`) — hoje nunca é passado pela UI real. */
  onConfirm?: () => void;
  submitting?: boolean;
  errorMessage?: string | null;
}

/**
 * Step de revisão. Exibe os dados já preenchidos, com e-mail/telefone/CPF
 * mascarados (nunca o valor completo no DOM). O botão "Confirmar reserva"
 * só existe quando `onConfirm` é passado (`BOOKING_CHECKOUT_ENABLED`
 * ligada em `BookingSelector`) — chama `onConfirm` (que dispara
 * `POST /api/bookings`) — nunca "Pagar": pagamento não existe ainda.
 * Desabilitado enquanto `submitting` é true, para nunca permitir duplo
 * clique/múltiplas submissões simultâneas.
 *
 * Sem `onConfirm` (hoje, real): mesmo estado seguro de antes da Fase 3 —
 * nenhum botão funcional, só o aviso para falar com o operador.
 */
export function BookingReview({
  departure,
  quantity,
  estimatedTotal,
  customer,
  onEdit,
  onBack,
  onConfirm,
  submitting = false,
  errorMessage = null,
}: BookingReviewProps) {
  const { date, time } = formatDepartureDateTime(departure.departsAt);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-6">
      <p className="eyebrow">Revisão da reserva</p>
      <h3 className="mt-2 font-display text-xl font-bold">Confira os dados</h3>
      <p className="mt-2 text-sm text-ink-muted">
        {onConfirm
          ? 'Confira os dados antes de confirmar a reserva.'
          : 'Reserva online chega em breve. Por enquanto, confira o resumo abaixo e fale com o operador para confirmar.'}
      </p>

      <dl className="mt-5 space-y-2 rounded-2xl bg-sand p-4 text-sm">
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
          <dd className="font-semibold">{quantity}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Modelo de preço</dt>
          <dd className="font-semibold">{priceTypeLabel(departure.priceType)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-ink/10 pt-2">
          <dt className="text-ink-muted">Total estimado</dt>
          <dd className="font-display text-base font-bold">{formatPrice(estimatedTotal)}</dd>
        </div>
      </dl>

      <dl className="mt-4 space-y-2 rounded-2xl bg-sand p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Nome</dt>
          <dd className="font-semibold">{customer.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">E-mail</dt>
          <dd className="font-semibold">{maskEmail(customer.email)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Telefone</dt>
          <dd className="font-semibold">{maskPhone(customer.phone)}</dd>
        </div>
        {customer.cpf ? (
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">CPF</dt>
            <dd className="font-semibold">{maskCpf(customer.cpf)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-2 text-xs text-ink-muted">
        Valor estimado. O preço final é sempre confirmado pelo operador no momento da reserva.
      </p>

      {errorMessage ? (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} disabled={submitting} className="btn-secondary flex-1">
          Voltar
        </button>
        <button type="button" onClick={onEdit} disabled={submitting} className="btn-secondary flex-1">
          Editar dados
        </button>
      </div>

      {onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="btn-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Confirmando...' : 'Confirmar reserva'}
        </button>
      ) : null}
    </div>
  );
}
