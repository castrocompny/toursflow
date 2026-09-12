'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

/**
 * Empurrão pra abas do ToursFlow já abertas: assina UPDATE em
 * `public.marketplace_catalog_state` (tabela mínima do NauticFlow — só
 * `id`/`version`/`updated_at`, sem dado de passeio/operador/cliente/
 * pagamento nenhum) e chama `router.refresh()` quando a versão muda.
 *
 * Não é o mecanismo que garante dado fresco — isso já é garantido
 * incondicionalmente por `listTours()`/`getTour()` usarem `cache: 'no-store'`
 * (ver `nauticflow-source.ts`): uma aba NOVA, aberta a qualquer momento,
 * SEMPRE recebe o catálogo real na primeira renderização, com ou sem este
 * componente. Isto aqui só evita o visitante precisar apertar F5 numa aba
 * que já estava aberta quando o operador publicou/despublicou/editou algo.
 *
 * `NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL`/`NEXT_PUBLIC_NAUTICFLOW_SUPABASE_ANON_KEY`
 * NÃO são segredos — são os mesmos dois valores já públicos no bundle do
 * navegador do próprio NauticFlow (prefixo `NEXT_PUBLIC_`, protegidos por
 * RLS/policy no banco, nunca por sigilo). O client aqui nunca autentica
 * (sem sessão, sempre `anon`) — a tabela só permite SELECT pra esse role,
 * nenhuma escrita é possível a partir do navegador (ver migration
 * 0069_marketplace_catalog_realtime_state.sql no NauticFlow).
 */
export function CatalogRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_NAUTICFLOW_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_NAUTICFLOW_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
    });

    const channel = supabase
      .channel('marketplace-catalog-refresh')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'marketplace_catalog_state' },
        () => {
          // debounce curto: várias mudanças quase juntas (ex.: publicar +
          // ajustar foto de capa em seguida) viram um único refresh.
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 400);
        },
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
