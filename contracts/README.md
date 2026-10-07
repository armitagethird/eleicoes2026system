# Contratos de dados

Fonte de verdade do formato dos JSON que o front lê. O worker (depois) será escrito contra estes schemas. Draft 2020-12, `additionalProperties: false`: acrescentar um campo é mudar o contrato.

| Arquivo servido | Schema | Observação |
|---|---|---|
| `/data/status.json` | `schemas/status.schema.json` | `modo`: `pre`, `live` ou `final` |
| `/data/br.json`, `/data/uf/{uf}.json` | `schemas/placar.schema.json` | mesma forma; `governador` só em AC, AM, DF, ES, RJ, RN e TO |
| `/data/c/{slug}.json` | `schemas/cidade.schema.json` | `secoes_pct < 1` = "aguardando primeiras seções" |
| `/data/rankings.json` | `schemas/rankings.schema.json` | `{ dividida, unanime, virada, capitais }`, listas de slugs já ordenadas |
| `/data/apuracao.json` | `schemas/camada-mapa.schema.json` | camada `ao-vivo` do mapa da `/apuracao`: um município por linha, 5.571 linhas (o worker publica; as fixtures são fictícias) |
| `/mapa/{id}.json` (`2018-t1`, `2018-t2`, `2022-t1`, `2022-t2`, `2026-t1`) | `schemas/camada-mapa.schema.json` | camadas históricas REAIS, geradas pelo ETL (`site/scripts/etl`) e servidas de `site/public/mapa/`; ver `site/src/data/README.md` |
| `src/data/municipios.json` | `schemas/municipios.schema.json` | embutido no build; 5.571 municípios REAIS (IBGE + TSE) |
| `src/data/hist/{slug}.json`, `hist-uf/{uf}.json`, `hist-br.json` | `schemas/hist.schema.json` | embutido no build, REAL (TSE); `t2_2022` é `null` sem 2022 (só Boa Esperança do Norte) |
| `/data/mapa.json` (**PROPOSTA**, aguarda aprovação) | `schemas/mapa.schema.json` | os 28 placares do mapa numa requisição; ver abaixo |

`schemas/common.schema.json` guarda as definições compartilhadas (candidato, UF, slug, data-hora).

Regras que o schema não expressa e o teste `site/tests/contracts.test.ts` confere: `cand` sempre em ordem crescente de número de urna (13 antes de 22); percentuais dos dois candidatos somam ~100; `eleito` nunca é inferido de percentual; `governador` só nas 7 UFs.

## Fixtures: o que é real e o que é fictício

`npm run fixtures` (em `/site`) gera `contracts/fixtures/` e copia para `site/public/data/`. É determinístico (semeado pelo slug/UF, sem relógio). `npm run fixtures -- --modo=live` (ou `final`) faz `public/data/status.json` ser `status.live.json` (ou `status.final.json`); o padrão é `pre`.

**Real:** nomes dos candidatos à presidência (13 Lula/PT, 22 Flávio Bolsonaro/PL); todos os 5.571 municípios (nome, UF, códigos IBGE e TSE, centroide, eleitorado apto de 2026); o `hist`, `hist-uf` e `hist-br` (2º turno de 2022 e 1º de 2026, do TSE). A variação vs 2022 compara o 2º turno fictício de 2026 com o 2022 real: a base é real, a diferença não é.

**FICTÍCIO (só para desenvolvimento, nunca exibir como dado oficial):**

- todos os números do 2º turno de 2026: votos, percentuais, brancos, nulos, `secoes_pct`, comparecimento, `diferenca_votos`, `selos`, `rank`, `virou`, e as linhas de `apuracao.json`;
- os candidatos a governador (`Fictício A`, nº 12, e `Fictícia B`, nº 45, partido `FIC`);
- os horários (`atualizado` fixo em 25/10 18:42:10, `status.final` às 21:03).

**Os números nascem por município e sobem por soma.** O script sorteia o 2º turno de cada um dos 5.571 municípios (13 = o 13 do 1º turno real mais uma fatia sorteada dos "outros"; seções entre 35% e 99,5%; brancos 3%, nulos 4%). Cada UF é a soma dos seus municípios e o Brasil é a soma das UFs. Por isso `apuracao.json` (mapa ao vivo), `br.json`, `uf/*.json` e `c/*.json` contam a mesma história: a linha de cada UF e do Brasil em `apuracao.json` é exatamente o placar de `uf/{uf}.json` e `br.json`, e a de cada cidade da amostra é a de `c/{slug}.json` (`site/tests/etl-fixtures.test.ts` confere). Município com menos de 1% das seções fica com percentual 0 e 0 ("aguardando primeiras seções").

**`c/{slug}.json` existe só para uma amostra de 50 cidades** (27 capitais, nomes longos, apóstrofo, hífen, Borá/SP, o menor eleitorado do país, e Boa Esperança do Norte, sem 2022): não se versionam 5.571 arquivos. A lista está em `AMOSTRA` no `scripts/fixtures.ts`; ranks, selos e `rankings.json` são calculados **só entre essas 50**, as únicas com `c/`. `apuracao.json` tem as 5.571 linhas (cerca de 177 KB, 57 KB em gzip).

Convenções das fixtures: `eleito` é `false` em tudo (cidade não elege; os placares são parciais). Para ver a página se mover e testar o card final use `npm run simular` (em `/site`): reescreve `site/public/data` de 5% a 100% das seções em 2 minutos (`--duracao=60 --intervalo=3` muda o ritmo), com o Brasil somando as UFs, e termina em `status` final, com `eleito: true` no líder do Brasil e nos governadores, tudo FICTÍCIO. Sem `--manter-final`, 30 s depois volta ao pre sozinho; Ctrl+C também restaura. `--restaurar` volta ao pre se o processo morrer à força (no Windows o sinal não chega) e `--destino=<pasta>` escreve noutro lugar, sem tocar no que o dev serve. `variacao_2022` é `{}` quando a cidade não tem 2022 e para governador (o card de governador mostra a margem entre os dois).

Casos de borda forçados (ver `CENARIOS` em `scripts/fixtures.ts`, só valem para a amostra): margem de 0,2 e 0,1 ponto (`santa-barbara-doeste-sp`, `sao-joao-da-boa-vista-sp`); 100% para o 22 (`serra-da-saudade-mg`); `secoes_pct < 1` (`bora-sp`); sem 2022 (`boa-esperanca-do-norte-mt`); `virou: true` (5 forçadas por espelhamento, mais as que viram por sorteio); `sao-luis-ma` com 87,3% das seções, como no brief.

`selos` aceitos: `mais_dividida_br`, `mais_dividida_uf`, `mais_unanime_br`, `maior_virada_br`, `maior_virada_uf` (enum proposto no schema; o brief só cita `mais_dividida_uf`).

## Proposta: `/data/mapa.json` (aguarda aprovação do Romero)

No modo ao vivo (Fase 3), o mapa da home precisa dos 28 placares (Brasil + 27 UFs) a cada 20 s. Lidos de `br.json` e `uf/{uf}.json` seriam 28 requisições; `mapa.json` junta numa só o que o mapa usa de cada um, com os mesmos nomes de campo: `secoes_pct`, `presidente.cand[].{n, pct}` (13 antes de 22) e `presidente.variacao_2022`. Não substitui nenhum arquivo. O worker o publicaria junto dos placares, no mesmo instante. `site/src/lib/mapa-dados.test.ts` confere que a fixture valida contra o schema e que ela dá exatamente o mesmo mapa que os 28 arquivos. Se não for aprovado, o mapa ao vivo lê os 28 arquivos (`mapaApuracao` aceita os dois).
