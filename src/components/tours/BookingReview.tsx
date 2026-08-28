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
}

/**
 * Step de revisão — Fase 2. Só exibe os dados já preenchidos, com
 * e-mail/telefone/CPF mascarados (nunca o valor completo no DOM). Não
 * existe botão de confirmação funcional aqui de propósito: essa etapa é a
 * ponte para a Fase 3 (`POST /api/bookings`), que ainda não existe nesta
 * fase — nenhuma reserva é criada, nenhuma chamada de rede acontece.
 */
export function BookingReview({ departure, quantity, estimatedTotal, customer, onEdit, onBack }: BookingReviewProps) {
  const { date, time } = formatDepartureDateTime(departure.departsAt);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-6">
      <p className="eyebrow">Revisão da reserva</p>
      <h3 className="mt-2 font-display text-xl font-bold">Confira os dados</h3>
      <p className="mt-2 text-sm text-ink-muted">
        Reserva online chega em breve. Por enquanto, confira o resumo abaixo e fale com o operador para confirmar.
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

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">
          Voltar
        </button>
        <button type="button" onClick={onEdit} className="btn-secondary flex-1">
          Editar dados
        </button>
      </div>
    </div>
  );
}
