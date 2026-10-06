# Contratos de dados

Fonte de verdade do formato dos JSON que o front lê. O worker (depois) será escrito contra estes schemas. Draft 2020-12, `additionalProperties: false`: acrescentar um campo é mudar o contrato.

| Arquivo servido | Schema | Observação |
|---|---|---|
| `/data/status.json` | `schemas/status.schema.json` | `modo`: `pre`, `live` ou `final` |
| `/data/br.json`, `/data/uf/{uf}.json` | `schemas/placar.schema.json` | mesma forma; `governador` só em AC, AM, DF, ES, RJ, RN e TO |
| `/data/c/{slug}.json` | `schemas/cidade.schema.json` | `secoes_pct < 1` = "aguardando primeiras seções" |
| `/data/rankings.json` | `schemas/rankings.schema.json` | `{ dividida, unanime, virada, capitais }`, listas de slugs já ordenadas |
| `src/data/municipios.json` | `schemas/municipios.schema.json` | embutido no build |
| `src/data/hist/{slug}.json` | `schemas/hist.schema.json` | embutido no build; `t2_2022` é `null` sem 2022 |

`schemas/common.schema.json` guarda as definições compartilhadas (candidato, UF, slug, data-hora).

Regras que o schema não expressa e o teste `site/tests/contracts.test.ts` confere: `cand` sempre em ordem crescente de número de urna (13 antes de 22); percentuais dos dois candidatos somam ~100; `eleito` nunca é inferido de percentual; `governador` só nas 7 UFs.

## Fixtures: o que é real e o que é fictício

`npm run fixtures` (em `/site`) gera `contracts/fixtures/` e copia para `site/public/data/`. É determinístico (semeado pelo slug/UF, sem relógio). `npm run fixtures -- --modo=live` (ou `final`) faz `public/data/status.json` ser `status.live.json` (ou `status.final.json`); o padrão é `pre`.

**Real:** nomes dos candidatos à presidência (13 Lula/PT, 22 Flávio Bolsonaro/PL); slug, nome, UF, código IBGE e lat/lon das 50 cidades do stub.

**FICTÍCIO (só para desenvolvimento, nunca exibir como dado oficial):**

- todos os números do 2º turno de 2026: votos, percentuais, brancos, nulos, `secoes_pct`, comparecimento, `diferenca_votos`, `selos`, `rank`, `virou`;
- `variacao_2022` de `br.json` e das UFs (não existe hist por UF) e a variação das cidades (calculada contra o hist, que hoje também é stub fictício);
- os candidatos a governador (`Fictício A`, nº 12, e `Fictícia B`, nº 45, partido `FIC`);
- o eleitorado por UF (aproximação grosseira) e os horários (`atualizado` fixo em 25/10 18:42:10, `status.final` às 21:03);
- `cod_tse` e `eleitores` do stub de municípios (ver `site/src/data/README.md`).

Convenções das fixtures: `eleito` é `false` em tudo (cidade não elege; os placares são parciais). Para testar o card final use `npm run simular` (Fase 3). `variacao_2022` é `{}` quando a cidade não tem 2022 e para governador (o card de governador mostra a margem entre os dois).

Casos de borda forçados (ver `CENARIOS` em `scripts/fixtures.ts`): margem de 0,2 e 0,1 ponto (`santa-barbara-doeste-sp`, `sao-joao-da-boa-vista-sp`); 100% para o 22 (`serra-da-saudade-mg`); `secoes_pct < 1` (`bora-sp`); sem 2022 (`boa-esperanca-do-norte-mt`); `virou: true` (5 forçadas por espelhamento, mais as que viram por sorteio); `sao-luis-ma` com 87,3% das seções, como no brief. `rankings.json` e `rank`/`selos` são calculados só entre as 50 cidades do stub.

`selos` aceitos: `mais_dividida_br`, `mais_dividida_uf`, `mais_unanime_br`, `maior_virada_br`, `maior_virada_uf` (enum proposto no schema; o brief só cita `mais_dividida_uf`).
