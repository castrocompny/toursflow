'use client';

import { useState } from 'react';
import type { CustomerFormErrors, CustomerFormValues } from '@/lib/customer-form';
import { formatCpfMask, formatPhoneMask, validateCustomerForm, isCustomerFormValid } from '@/lib/customer-form';

interface CustomerFormProps {
  values: CustomerFormValues;
  onChange: (values: CustomerFormValues) => void;
  onSubmit: (values: CustomerFormValues) => void;
  onBack: () => void;
}

type TouchedFields = Record<keyof CustomerFormValues, boolean>;

const NO_FIELDS_TOUCHED: TouchedFields = { name: false, email: false, phone: false, cpf: false };

/**
 * Formulário de dados do comprador — Fase 2. Controlado pelo componente
 * pai (`BookingSelector`), que é quem guarda `values` em estado: assim os
 * dados sobrevivem a ida-e-volta entre os steps de seleção/formulário/
 * revisão, sem se perder ao desmontar este componente.
 *
 * Nunca chama `fetch`, nunca persiste em localStorage/sessionStorage,
 * nunca coloca PII em URL — só repassa `values` validados para o pai via
 * `onSubmit`, que decide o que fazer a seguir (avançar para a revisão).
 */
export function CustomerForm({ values, onChange, onSubmit, onBack }: CustomerFormProps) {
  const [touched, setTouched] = useState<TouchedFields>(NO_FIELDS_TOUCHED);
  const errors: CustomerFormErrors = validateCustomerForm(values);

  function update<K extends keyof CustomerFormValues>(field: K, value: CustomerFormValues[K]) {
    onChange({ ...values, [field]: value });
  }

  function markTouched(field: keyof CustomerFormValues) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ name: true, email: true, phone: true, cpf: true });
    if (isCustomerFormValid(errors)) onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-card border border-ink/10 bg-white p-6">
      <p className="eyebrow">Próxima etapa</p>
      <h3 className="mt-2 font-display text-xl font-bold">Dados do comprador</h3>
      <p className="mt-2 text-sm text-ink-muted">Esses dados ainda não são enviados a nenhum servidor nesta etapa.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="customer-name" className="text-sm font-semibold text-ink">
            Nome completo
          </label>
          <input
            id="customer-name"
            name="name"
            type="text"
            autoComplete="name"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            onBlur={() => markTouched('name')}
            aria-invalid={touched.name && !!errors.name}
            aria-describedby={touched.name && errors.name ? 'customer-name-error' : undefined}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink outline-none focus-visible:border-sea"
          />
          {touched.name && errors.name ? (
            <p id="customer-name-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="customer-email" className="text-sm font-semibold text-ink">
            E-mail
          </label>
          <input
            id="customer-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => update('email', event.target.value)}
            onBlur={() => markTouched('email')}
            aria-invalid={touched.email && !!errors.email}
            aria-describedby={touched.email && errors.email ? 'customer-email-error' : undefined}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink outline-none focus-visible:border-sea"
          />
          {touched.email && errors.email ? (
            <p id="customer-email-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="customer-phone" className="text-sm font-semibold text-ink">
            Telefone
          </label>
          <input
            id="customer-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            value={values.phone}
            onChange={(event) => update('phone', formatPhoneMask(event.target.value))}
            onBlur={() => markTouched('phone')}
            aria-invalid={touched.phone && !!errors.phone}
            aria-describedby={touched.phone && errors.phone ? 'customer-phone-error' : undefined}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink outline-none focus-visible:border-sea"
          />
          {touched.phone && errors.phone ? (
            <p id="customer-phone-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="customer-cpf" className="text-sm font-semibold text-ink">
            CPF <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input
            id="customer-cpf"
            name="cpf"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="123.456.789-09"
            value={values.cpf}
            onChange={(event) => update('cpf', formatCpfMask(event.target.value))}
            onBlur={() => markTouched('cpf')}
            aria-invalid={touched.cpf && !!errors.cpf}
            aria-describedby={touched.cpf && errors.cpf ? 'customer-cpf-error' : undefined}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink outline-none focus-visible:border-sea"
          />
          {touched.cpf && errors.cpf ? (
            <p id="customer-cpf-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.cpf}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">
          Voltar
        </button>
        <button type="submit" className="btn-primary flex-1">
          Revisar reserva
        </button>
      </div>
    </form>
  );
}
