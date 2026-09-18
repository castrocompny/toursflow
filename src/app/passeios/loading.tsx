/**
 * Suspense boundary automática do App Router — aparece assim que a
 * navegação pra `/passeios` começa (clique em "Buscar passeios", num
 * filtro, destino ou paginação), sem esperar `listTours`/`listDestinations`
 * responderem. Só feedback visual: nenhum dado real aqui, nada que possa
 * ser confundido com resultado (ver `prefers-reduced-motion` em
 * `globals.css`, que já zera a duração do `animate-pulse` abaixo).
 */
export default function ToursLoading() {
  return (
    <div className="shell py-8 sm:py-12" aria-hidden>
      <div className="h-4 w-40 animate-pulse rounded-full bg-ink/10" />

      <div className="mt-5 max-w-2xl space-y-3">
        <div className="h-9 w-72 animate-pulse rounded-full bg-ink/10" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-full bg-ink/10" />
      </div>

      <div className="mt-8 h-14 animate-pulse rounded-card bg-ink/10" />

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-card border border-ink/10">
            <div className="aspect-[4/3] animate-pulse bg-ink/10" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-3/4 animate-pulse rounded-full bg-ink/10" />
              <div className="h-4 w-1/2 animate-pulse rounded-full bg-ink/10" />
              <div className="h-4 w-full animate-pulse rounded-full bg-ink/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
