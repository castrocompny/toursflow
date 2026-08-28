# Decisões de arquitetura (ADR)

Registro das decisões técnicas relevantes já tomadas neste projeto, no
formato Contexto / Decisão / Motivo / Alternativas rejeitadas /
Consequências. Só decisões realmente tomadas — nada especulativo.

---

## ADR-001 — Repositório de dados escolhido por variável de ambiente

**Contexto:** o catálogo precisa funcionar em dev local sem exigir setup
de credencial/rede, e em produção precisa sempre usar dados reais do
NauticFlow.

**Decisão:** `src/data/repository.ts` escolhe `nauticflow-source` ou
`mock-source` puramente pela presença de `NAUTICFLOW_API_URL`, atrás de um
único contrato (`ToursDataSource`). Nenhum componente sabe qual está
ativo.

**Motivo:** permite dev sem setup (mock automático) sem risco de mock
vazar pra produção (lá a env var está sempre presente) e sem duplicar
lógica de UI por fonte de dado.

**Alternativas rejeitadas:** flag booleana explícita (`USE_MOCK=true`) —
rejeitada por criar um segundo lugar pra errar (esquecer de setar/desetar);
mock sempre ativo com "modo real" opt-in — rejeitada por inverter o padrão
seguro (produção deveria ter que optar por dado real, não o contrário).

**Consequências:** se `NAUTICFLOW_API_URL` for setada por engano em dev
local, o mock para de ser usado silenciosamente — comportamento aceito
como correto (reflete produção), documentado em
[ENVIRONMENT.md](ENVIRONMENT.md).

---

## ADR-002 — Cache dividido: conteúdo com ISR, disponibilidade sempre fresca

**Contexto:** dados de catálogo (nome, descrição, fotos) mudam pouco;
disponibilidade de saída (`soldOut`, vagas) muda a cada reserva e nunca
pode estar desatualizada.

**Decisão:** `nauticflow-source.ts` usa `next: { revalidate: 300 }` para
tours/destinos/categorias, e `cache: 'no-store'` para `listDepartures`.

**Motivo:** evitar reserva de uma saída que já esgotou entre o cache e a
tentativa real (o NauticFlow revalida tudo de novo no momento da reserva,
mas a UI não deveria nem oferecer a opção com dado óbvio desatualizado).

**Alternativas rejeitadas:** ISR uniforme para tudo — rejeitada por poder
mostrar `soldOut: false` por até 5 minutos depois de esgotar de verdade;
`no-store` uniforme para tudo — rejeitada por eliminar o ganho de
performance do ISR em dado que muda pouco.

**Consequências:** publicar/despublicar um passeio no NauticFlow pode
levar até 5 min para refletir no catálogo do ToursFlow (sem
`revalidateTag`/revalidação sob demanda ainda — ver PLANEJADO abaixo).
Disponibilidade, porém, é sempre a mais recente possível.

---

## ADR-003 — `/passeios/[destino]/[slug]` é `force-dynamic`, sem `generateStaticParams`

**Contexto:** a página do passeio mostra saídas com disponibilidade
(`listDepartures`, `no-store`) — não pode ser pré-renderizada em build
sem congelar esse dado.

**Decisão:** a rota é marcada `export const dynamic = 'force-dynamic'` e
não implementa `generateStaticParams`.

**Motivo:** consistência com ADR-002 — não faz sentido ter cache de
conteúdo inteligente na busca (`fetch`) e depois anular isso com uma
página 100% estática que só atualiza no próximo build.

**Alternativas rejeitadas:** SSG + revalidação periódica da página inteira
— rejeitada pela mesma razão do ADR-002 (disponibilidade não pode ter
janela de staleness).

**Consequências:** cada acesso à página do passeio é uma renderização
server-side real (custo de compute maior que uma página estática pura),
aceito como o trade-off correto para não vender saída já esgotada.

---

## ADR-004 — Rate limit do visitante via HMAC do IP, não IP em claro

**Contexto:** o NauticFlow precisa de uma identidade por visitante para
aplicar rate limit em `/api/marketplace/bookings`, mas o ToursFlow não
deve repassar IP em claro a um sistema terceiro nem manter estado próprio
de rate limit.

**Decisão:** `X-ToursFlow-Client-Key = HMAC-SHA256(TOURSFLOW_API_SECRET,
"rate-limit:v1:" + ip)`, calculado só no servidor do ToursFlow, a partir
do IP confiável da requisição (`x-vercel-forwarded-for` em produção),
nunca de um header vindo do navegador.

**Motivo:** o NauticFlow ganha uma identidade estável por visitante sem
nunca ver o IP real; o segredo compartilhado (já existente para
autenticação) é reaproveitado com domain separation em vez de introduzir
um segredo novo.

**Alternativas rejeitadas:** enviar o IP em claro — rejeitado por
desnecessário e por aumentar a superfície de dado pessoal trafegado;
cliente gerar a própria identidade (ex.: UUID em cookie) — rejeitado por
ser trivialmente forjável/reiniciável pelo próprio visitante, anulando o
rate limit.

**Consequências:** rate limit por visitante depende de o IP confiável
estar disponível — quando não está, a rota falha fechada
(`CLIENT_IP_UNAVAILABLE`) em vez de deixar passar sem limite. Ver
[SECURITY.md](SECURITY.md).

---

## ADR-005 — Whitelist explícita do payload de reserva, nunca objeto repassado direto

**Contexto:** o corpo de `POST /api/bookings` vem do navegador — não pode
ser confiável como fonte de preço, operador ou identificadores internos.

**Decisão:** `validateBookingInput()` extrai campo por campo
(`departureId`, `quantity`, `customer.{...}`) para um novo objeto — nunca
faz spread do body recebido nem repassa chaves desconhecidas adiante.

**Motivo:** impedir que um cliente malicioso injete `price`, `total`,
`companyId`, `status` etc. tentando influenciar o resultado da reserva.

**Alternativas rejeitadas:** blacklist de campos perigosos — rejeitada por
exigir manutenção reativa toda vez que um campo novo e sensível for
adicionado ao contrato; whitelist é segura por padrão mesmo se o contrato
crescer.

**Consequências:** todo campo novo do contrato de reserva precisa ser
adicionado explicitamente à whitelist antes de funcionar — fricção
aceita como o preço de não confiar no cliente por padrão.

---

## ADR-006 — Tipos de reserva separados dos tipos de catálogo

**Contexto:** `src/types/index.ts` (catálogo) e `src/types/booking.ts`
(reserva) poderiam, em tese, compartilhar um único arquivo de tipos.

**Decisão:** mantidos em arquivos separados.

**Motivo:** catálogo é lido por qualquer Server Component; reserva envolve
tipos que só o backend server-only manipula (`BookingErrorCode`,
payload de request/response do NauticFlow) — separar deixa explícito o que
é seguro importar de onde, e evita que um Client Component importe
acidentalmente um tipo que "puxa" um módulo server-only via barrel file.

**Alternativas rejeitadas:** um único `types/index.ts` — rejeitada pelo
motivo acima.

**Consequências:** duas fontes de tipo para conferir ao mexer em algo que
toca os dois domínios (ex.: `Departure.priceType` usado tanto no catálogo
quanto na validação de reserva).

---

## PLANEJADO / NÃO IMPLEMENTADO

- Revalidação sob demanda (`revalidateTag`) para eliminar a janela de até
  5 min entre publicar/despublicar um passeio no NauticFlow e isso
  refletir no catálogo (ADR-002).
- Rate limit próprio do ToursFlow na rota `/api/bookings` (hoje o limite
  real mora só no NauticFlow).
