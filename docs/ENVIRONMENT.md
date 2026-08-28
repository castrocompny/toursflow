# Variáveis de ambiente

Lista completa. Valores reais nunca aparecem aqui nem em `.env.example` —
só o propósito, o formato esperado e o efeito de estar ausente.

| Variável | Pública? | Obrigatória | Efeito se ausente |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Sim (`NEXT_PUBLIC_*`, vai pro bundle do cliente) | Sim | Usada em metadados/SEO (canonical, OG, sitemap). Ex.: `https://toursflow.com.br` |
| `NAUTICFLOW_API_URL` | Não (server-only) | Não | **Ausente:** o site usa o `mock-source` local automaticamente (`src/data/repository.ts`) — comportamento esperado em dev sem setup. **Presente:** aponta para a API pública do NauticFlow (ex.: `https://nauticflow.com.br`), usada por `nauticflow-source.ts` para catálogo e disponibilidade |
| `TOURSFLOW_API_SECRET` | Não (server-only, nunca `NEXT_PUBLIC_`) | Só para `/api/bookings` funcionar | **Ausente:** `POST /api/bookings` falha com `INTERNAL_ERROR` — nunca cria reserva simulada. Precisa ser **o mesmo valor** configurado nos dois lados (ToursFlow e NauticFlow); usado tanto como Bearer de autenticação quanto como chave do HMAC do rate limit (`X-ToursFlow-Client-Key`, domain-separated com o prefixo `rate-limit:v1:`) |

`VERCEL` (variável que a própria Vercel injeta automaticamente, não
configurada manualmente) determina em `src/lib/client-ip.ts` se a fonte
confiável de IP é `x-vercel-forwarded-for` (`VERCEL === '1'`) ou o
fallback `x-forwarded-for` (fora da Vercel — dev local, testes).

## Onde configurar

- **Local:** `.env.local` (git-ignorado; nunca commitar).
- **Vercel (preview/produção):** Project Settings → Environment Variables,
  por ambiente. Ver [DEPLOYMENT.md](DEPLOYMENT.md).

## Checklist ao adicionar uma variável nova

1. Adicionar em `.env.example` com comentário explicando propósito e
   formato — nunca um valor real.
2. Documentar aqui (esta tabela).
3. Se for um segredo, confirmar que o módulo que a lê tem
   `import 'server-only'` no topo.
4. Se afetar deploy, atualizar [DEPLOYMENT.md](DEPLOYMENT.md).
