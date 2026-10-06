# Dados estáticos (STUB da Fase 0)

`municipios.json` tem 50 cidades reais e variadas (27 capitais, nomes longos, apóstrofo, hífen, minúsculas e Boa Esperança do Norte/MT, que não tem 2022). A Fase 0.5 substitui por todos os 5.571 municípios; o formato é o mesmo (`contracts/schemas/municipios.schema.json`).

| Campo | Origem |
|---|---|
| `nome`, `uf`, `cod_ibge` | REAL: API do IBGE, `servicodados.ibge.gov.br/api/v1/localidades/municipios` |
| `lat`, `lon` | REAL: dataset `kelvins/municipios-brasileiros` (GitHub), chave `codigo_ibge` |
| `eleitores` | ESTIMATIVA: 76% da população do Censo 2022 (IBGE SIDRA, tabela 4714). Boa Esperança do Norte não tem Censo 2022: 4.200 fictício. **TODO: trocar pelo eleitorado do TSE.** |
| `cod_tse` | FICTÍCIO (90001 a 90050). **TODO: trocar pela tabela de-para TSE/IBGE.** O código do TSE não é o do IBGE. |

`slug` = `nome-uf`: sem acento, minúsculo, hífens; o apóstrofo é **removido** (não vira hífen): `Santa Bárbara d'Oeste` (SP) vira `santa-barbara-doeste-sp`. Implementação e testes em `src/lib/slug.ts`.

`hist/{slug}.json` é **fictício** (percentuais sorteados pelo slug, soma 100): o formato é o do brief, seção 6. `t2_2022` é `null` em `boa-esperanca-do-norte-mt`. A Fase 0.5 gera o hist real a partir dos CSVs do TSE.
