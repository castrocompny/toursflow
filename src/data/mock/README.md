# Dados MOCK — temporários

Tudo nesta pasta existe apenas para o desenvolvimento da interface pública do ToursFlow.

Regras:

1. Nada aqui vai para o banco. Não criar migrations, seeds ou inserts com estes registros.
2. Nenhum componente importa arquivos desta pasta. O acesso é sempre por `src/data/repository.ts`.
3. Para trocar por dados reais, implemente `ToursDataSource` (ver `src/data/source.ts`) em `src/data/sources/nauticflow-source.ts` e altere a constante `source` no repositório. A pasta `mock` pode então ser removida por inteiro, junto com `public/img/mock`.

Campos que dependem do NauticFlow e hoje estão simulados:

| Campo | Origem futura |
| --- | --- |
| `rating` | Avaliações pós-passeio (ainda não existem no NauticFlow) |
| `boardingPoint.latitude/longitude` | Cadastro do ponto de embarque do operador |
| `maxPeople` | Capacidade da embarcação |
| `priceFrom` | Menor tarifa entre as saídas publicadas |
| disponibilidade por data | Saídas do NauticFlow (não implementado) |
