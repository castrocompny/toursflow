/**
 * Suspense boundary automática do App Router — aparece assim que o
 * turista clica em "Ver passeio"/data/horário de um card, sem esperar
 * `getTour`/`listDepartures` responderem. Só feedback visual, nenhum dado
 * real (ver `prefers-reduced-motion` em `globals.css`, que já zera a
 * duração do `animate-pulse` abaixo).
 */
export default function TourLoading() {
  return (
    <div className="shell py-8 sm:py-12" aria-hidden>
      <div className="h-4 w-64 animate-pulse rounded-full bg-ink/10" />

      <div className="mt-5 max-w-3xl space-y-4">
        <div className="h-6 w-28 animate-pulse rounded-full bg-ink/10" />
        <div className="h-10 w-full max-w-xl animate-pulse rounded-full bg-ink/10" />
        <div className="h-4 w-48 animate-pulse rounded-full bg-ink/10" />
      </div>

      <div className="mt-8 aspect-[16/9] animate-pulse rounded-card bg-ink/10" />

      <div className="mt-8 h-32 animate-pulse rounded-card bg-ink/10" />

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="h-4 w-full animate-pulse rounded-full bg-ink/10" />
          <div className="h-4 w-full animate-pulse rounded-full bg-ink/10" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-ink/10" />
        </div>
        <div className="h-64 animate-pulse rounded-card bg-ink/10" />
      </div>
    </div>
  );
}
