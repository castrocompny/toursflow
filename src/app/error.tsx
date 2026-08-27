'use client';

import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Boundary de erro do App Router: captura falhas de `DataSourceError`
 * (rede, timeout, resposta inválida da API do NauticFlow) lançadas pelas
 * páginas. Isso é o que garante que uma API fora do ar nunca aparece como
 * "nenhum passeio encontrado" — aparece como isto aqui.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[error.tsx]', error);
  }, [error]);

  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sand text-sun">
        <WifiOff size={22} aria-hidden />
      </span>
      <p className="eyebrow mt-4">Erro temporário</p>
      <h1 className="mt-2 text-3xl font-extrabold">Não conseguimos carregar agora</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        Não foi possível buscar os dados no momento. Isso costuma ser temporário — tente de novo em
        instantes.
      </p>
      <button type="button" onClick={reset} className="btn-primary mt-8">
        Tentar de novo
      </button>
    </div>
  );
}
