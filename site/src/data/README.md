# Dados estáticos reais (Fase 0.5)

Tudo aqui, e em `public/mapa/`, é **REAL**: vem do TSE e do IBGE por scripts de ETL (`scripts/etl/`) que rodam uma vez e geram arquivos commitados. O que é fictício (o 2º turno de 2026) mora só nas fixtures de `/contracts` e em `public/data/`, que não vai para produção.

| Arquivo | O que é | Origem |
|---|---|---|
| `municipios.json` | 5.571 municípios: slug, nome, UF, `cod_tse`, `cod_ibge`, lat/lon, eleitores | IBGE + TSE (abaixo) |
| `hist/{slug}.json` | 2º turno de 2022 e 1º turno de 2026 de cada município | TSE |
| `hist-uf/{uf}.json` (27), `hist-br.json` | o mesmo, por UF e para o Brasil | TSE |
| `../../public/mapa/{2018-t1,2018-t2,2022-t1,2022-t2,2026-t1}.json` | camadas do mapa e do gráfico histórico, uma por eleição e turno | TSE |
| `fontes.json` | procedência: URL, tamanho, SHA-256, ETag e Last-Modified de cada arquivo lido | gerado por `baixar` |
| `pesquisas.json` | pesquisas registradas no TSE (hoje `[]`) | manual, ver o fim deste arquivo |

## Como regenerar

```
npm run etl              # tudo: baixar, agregar, municipios, gerar (os zips ficam em site/.builds/etl-cache, fora do git)
npm run etl -- baixar    # só baixa (de novo só o que mudou: compara tamanho e ETag) e atualiza fontes.json
npm run etl -- agregar   # soma os CSV por município (cache/agregado/{id}.json), ~25 s
npm run etl -- municipios
npm run etl -- gerar     # grava public/mapa, hist, hist-uf e hist-br, ~6 s
npm run fixtures         # depois: recalcula as fixtures sobre os dados novos
```

Roda com Node puro (sem Python, sem `unzip`/`tar`): `scripts/etl/zip.ts` lê o ZIP em streaming. A saída é determinística (mesmos zips, mesmos bytes). O TSE regera os arquivos de 2026 enquanto confere a apuração (o `detalhe_votacao_secao_2026.zip` mudou de tamanho durante a escrita deste ETL): rode `baixar` de novo e confira `fontes.json` e `npm test` antes de publicar.

## municipios.json

A contagem vem da fonte: 5.571, a mesma do IBGE, dos centroides do IBGE e do de-para do TSE (o teste compara os quatro números gravados em `fontes.json`).

| Campo | Origem |
|---|---|
| `nome`, `uf`, `cod_ibge` | API do IBGE, `servicodados.ibge.gov.br/api/v1/localidades/municipios` (UF pela região intermediária, que existe também no município novo) |
| `lat`, `lon` | **centroide** do município, malhas do IBGE v4 (`/api/v4/malhas/paises/BR/metadados?intrarregiao=municipio`). A v3 não tem Boa Esperança do Norte; a v4 tem os 5.571 |
| `cod_tse` | de-para **do próprio TSE**: o config de resultados de 2026 (`resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json`) traz o código do TSE (`cd`) e o do IBGE (`cdi`) de cada município. Casou 5.571 de 5.571, sem duplicata e sem sobra. O código do TSE **não** é o do IBGE |
| `eleitores` | eleitorado **apto no 1º turno de 2026** (soma de `QT_APTOS` do `detalhe_votacao_secao_2026`). Não inclui o exterior (916.534); com ele, 158.745.502, o total do relatório do TSE |
| `slug` | `nome-uf` normalizado por `src/lib/slug.ts`; 5.571 únicos |

Conferido à mão (o vínculo IBGE x TSE é o código, não o nome): em 13 municípios o nome do IBGE difere do nome do TSE só por grafia ou nome antigo: Espigão D'Oeste e Alvorada D'Oeste ("DO OESTE"), São Luiz do Anauá ("SÃO LUIZ"), Eldorado do Carajás ("DOS CARAJÁS"), **Januário Cicco (RN), que o TSE ainda lista como "BOA SAÚDE"**, Amparo do São Francisco, Barão do Monte Alto, Dona Euzébia, São Tomé das Letras, São Luiz do Paraitinga, Munhoz de Melo, Santo Antônio de Leverger e Bom Jesus de Goiás ("BOM JESUS"). Todos são o mesmo município nas duas fontes.

Casos especiais:
- **Fernando de Noronha (PE)** está na lista do IBGE e do TSE como município; é o único com longitude maior que -34 (-32,43).
- **Boa Esperança do Norte (MT)**, código IBGE 5101837 e TSE 73709, foi criado depois de 2022 (desmembrado de Sorriso). Não tem votos em 2018 nem em 2022: `hist.t2_2022` é `null` e ele fica fora das camadas de 2018 e 2022. É o único.
- O **exterior** (UF `ZZ` do TSE, 186 cidades estrangeiras) não é município: fica fora de `municipios.json`, das UFs e das linhas de município, mas entra na linha do **Brasil**, como no resultado oficial.

## Camadas do mapa: `public/mapa/{id}.json`

Formato e schema: `src/lib/camada-mapa.ts` e `contracts/schemas/camada-mapa.schema.json`. Um município por linha: `[ibge, pct A, pct B, pct outros, número de quem lidera quando não é A nem B (0 = A ou B), % das seções]`.

| id | A | B | Fonte do TSE (presidente) |
|---|---|---|---|
| `2018-t1`, `2018-t2` | Haddad, 13, PT, cor "13" | Jair Bolsonaro, **17**, PSL, cor "22" | `votacao_candidato_munzona_2018` (votos), `detalhe_votacao_munzona_2018` (eleitorado, comparecimento) |
| `2022-t1`, `2022-t2` | Lula, 13, PT, cor "13" | Jair Bolsonaro, 22, PL, cor "22" | `votacao_candidato_munzona_2022`, `detalhe_votacao_munzona_2022` |
| `2026-t1` | Lula, 13, PT, cor "13" | Flávio Bolsonaro, 22, PL, cor "22" | `votacao_secao_2026_BR` (votos por seção, somados por município), `detalhe_votacao_secao_2026` |

Regras do cálculo (`scripts/etl/camada.ts`):
- **Percentual sobre votos válidos**: votos em candidato, sem brancos e nulos, como o Relatório de Totalização do TSE. Arredondamento comum a 2 casas, em aritmética inteira, como o site do TSE (2.243 de 3.189 votos é 70,34%).
- No **2º turno** não há terceiro: `outros` é 0, `liderOutro` é 0 e o segundo é 100 menos o primeiro, então a linha soma exatamente 100,00. No **1º turno** cada parte é arredondada sozinha (a soma fica em 100 ±0,02).
- `liderOutro` só é diferente de 0 se um terceiro candidato tem **mais votos que A e B**. Aconteceu em 2018, 1º turno: Ciro Gomes (12) lidera em 103 municípios e no Ceará (40,95% dos válidos, conferido no relatório 295 do CE). Em 2022 e 2026 nenhum terceiro lidera em lugar nenhum.
- **% das seções = 100** em toda linha: são resultados finais. O relatório do TSE de 2026 registra 0 seções não apuradas (41 não instaladas, 423 eleitores).
- `atualizado` é a data e hora de geração do arquivo no TSE (`DT_GERACAO`/`HH_GERACAO`, horário de Brasília), não a da eleição. O TSE regerou os arquivos de 2022 em 04/10/2026.
- **1º turno de 2026: o candidato nº 28 (Leonardo Alves de Araújo, 5.246 votos) não conta como voto válido.** O relatório do TSE lista esses votos como "nulos técnicos" (candidatura indeferida); o arquivo por seção os traz como um candidato qualquer. Sem tirá-los o total de válidos seria 119.306.034 e não os 119.300.788 do relatório. A exclusão está em `scripts/etl/fontes.ts` (`nulosTecnicos`). Nos arquivos por zona de 2018 e 2022 o TSE já os separa (`QT_VOTOS_NOMINAIS_VALIDOS`).
- Município sem nenhum voto válido não entra na camada: nada de 0/0 inventado. Hoje nenhum.
- Brasil = soma de todas as seções, **com** o exterior. As 27 UFs somam só os seus municípios.

Tamanho, em bytes (cru, gzip nível 9, brotli):

| Arquivo | cru | gzip | brotli |
|---|---|---|---|
| `2018-t1.json` | 193.335 | 59.919 | 52.615 |
| `2018-t2.json` | 172.249 | 46.057 | 33.987 |
| `2022-t1.json` | 188.612 | 58.318 | 50.563 |
| `2022-t2.json` | 172.335 | 45.670 | 33.575 |
| `2026-t1.json` | 188.867 | 58.451 | 50.625 |

## hist, hist-uf, hist-br

Mesmo schema (`contracts/schemas/hist.schema.json`): `t2_2022` (null sem 2022) e `t1_2026` (`13`, `22`, `outros`), mais `comparecimento_pct` (comparecimento / eleitorado apto das seções, 2 casas). Cada um repete a linha correspondente das camadas `2022-t2` e `2026-t1` (testado). `hist-uf` soma os municípios da UF; `hist-br` soma tudo, com o exterior.

`lib/dados.ts` carrega os 5.571 `hist/*.json` com `import.meta.glob` eager e não precisou mudar: o build de 5.608 páginas (5.571 cidades, 27 UFs e as demais) leva 28 s (`npx astro build`, medido em 06/10/2026), então não virou arquivo único.

## Conferência com as fontes oficiais

Os testes (`tests/etl-dados.test.ts`) guardam os itens 1 a 3; os itens 4 e 5 foram feitos uma vez, com os scripts descartados, e valem para os zips listados em `fontes.json`.

1. **Totais nacionais** contra o PDF "Relatório Resultado da Totalização" do TSE (Brasil), das cinco eleições. Batem **no voto**: votos válidos, votos de A e B, eleitorado apto e comparecimento.

   | Eleição | Válidos | A | B | Percentuais (A, B) | Comparecimento |
   |---|---|---|---|---|---|
   | 2018, 1º turno | 107.050.749 | Haddad 31.342.051 | Bolsonaro 49.277.010 | 29,28 e 46,03 | 79,67% |
   | 2018, 2º turno | 104.838.753 | Haddad 47.040.906 | Bolsonaro 57.797.847 | 44,87 e **55,13** | 78,70% |
   | 2022, 1º turno | 118.229.719 | Lula 57.259.504 | Bolsonaro 51.072.345 | 48,43 e 43,20 | 79,05% |
   | 2022, 2º turno | 118.552.353 | Lula 60.345.999 | Bolsonaro 58.206.354 | **50,90** e 49,10 | 79,42% |
   | 2026, 1º turno | 119.300.788 | Lula 53.879.538 | Flávio 56.104.503 | 45,16 e 47,03 | 78,92% |

   (O relatório de 2022 2T escreve 79,41% e o de 2026, 78,91%: o TSE trunca; arredondado, 124.252.796 de 156.454.011 dá 79,42 e 125.275.835 de 158.745.502 dá 78,92.)
2. **UFs** contra os relatórios de totalização por UF do TSE (percentuais de A e B e comparecimento): SP, RS e MA em 2022 (2º turno) e em 2026 (1º turno); SP em 2018 (2º turno); CE em 2018 (1º turno, Ciro na frente). Diferença zero.
3. **Três cidades contra o site do TSE** (`resultados.tse.jus.br`, 1º turno de 2026, conferido em 06/10/2026, resultado de 05/10/2026 12:51:05):
   - **São Luís (MA)**: Lula 337.598 (54,51%), Flávio 229.253 (37,02%), 619.322 votos válidos, comparecimento 642.000 de 761.443 aptos (84,31%). O ETL gera 54,51 / 37,02 / outros 8,47, comparecimento 84,31.
   - **São Paulo (SP)**: Lula 3.052.349 (46,58%), Flávio 2.760.747 (42,13%), 6.552.820 válidos. O ETL gera 46,58 / 42,13 / 11,29.
   - **Boa Esperança do Norte (MT)**: Lula 764 (23,96%), Flávio 2.243 (70,34%), 3.189 válidos. O ETL gera 23,96 / 70,34 / 5,71.
   - Também batem Curitiba (30,37 e 57,50) e Borá (SP, 30,05 e 65,33).
   O site do TSE já não serve 2018 nem 2022 (o `ele-c.json` dele só lista a partir de 2024), por isso o 2022 foi conferido pelos relatórios por UF e pelo item 4.
4. **Cruzamento zona x seção** (única vez, fora dos testes): os votos por município dos arquivos por zona (a fonte do ETL) contra os arquivos por seção (`votacao_secao_2018_BR` e `votacao_secao_2022_BR`, os boletins de urna), todos os candidatos, 1º e 2º turnos. 5.741 de 5.741 municípios iguais em 2018 2T, 5.751 de 5.751 em 2022 1T e em 2022 2T, e 5.740 de 5.741 em 2018 1T: a diferença é Salvador, onde o arquivo por seção traz 746 votos no código 97 ("anulados e apurados em separado", os mesmos 746 do relatório), que não são voto válido.
5. **Código do TSE estável entre as eleições**: todo código de município dos arquivos de 2018 e 2022 existe no de-para de 2026, na mesma UF; só 7 (2018) e 4 (2022) mudaram de grafia ou de nome (Arês/Arez, Camacã/Camacan, Tabocão/Fortaleza do Tabocão…). Só Boa Esperança do Norte não tem votos em 2018 e 2022.

## pesquisas.json (pesquisas reais, registradas no TSE)

Alimenta o bloco "Pesquisas registradas no TSE" da home (só no modo `pre`). Hoje é `[]`: sem pesquisa real, o bloco não aparece. Contrato em `contracts/schemas/pesquisas.schema.json`; `npm test` valida o arquivo (schema, ids e registros únicos, fim da coleta depois do início, sem `ficticio`).

**Só entra pesquisa REAL, com registro no PesqEle.** Pesquisa fictícia nunca entra neste arquivo: divulgar pesquisa falsa é crime. Os exemplos fictícios ficam em `contracts/fixtures/pesquisas.exemplo.json` (todos com `"ficticio": true`) e só aparecem em `/design/pesquisas`, que o build remove do deploy. O teste falha se algum item daqui tiver `ficticio: true`, e o componente descarta qualquer um que tenha.

Um objeto por pesquisa, em qualquer ordem: o site ordena pelo fim da coleta (a mais recente primeiro) e mostra no máximo 5. Modelo (os `<...>` são lacunas, de propósito: não é JSON válido para ninguém colar sem preencher):

```
{
  "id": "<instituto>-<fim da coleta>",
  "instituto": "<nome como consta no registro>",
  "contratante": "<quem contratou>" ou null,
  "registro": "BR-NNNNN/AAAA",
  "coleta": { "inicio": "AAAA-MM-DD", "fim": "AAAA-MM-DD" },
  "entrevistas": <inteiro>,
  "margem_pp": <número>,
  "confianca_pct": <número>,
  "tipo": "votos_totais" ou "votos_validos",
  "cenario": "2turno",
  "resultados": { "13": <pct>, "22": <pct>, "brancos_nulos": <pct, só se divulgado>, "indecisos": <pct, só se divulgado> },
  "divulgada_em": "AAAA-MM-DD",
  "fonte_url": "https://<divulgação do instituto ou de veículo que a publicou>"
}
```

Regras:

- **Copie os números como o instituto divulgou.** 47 é `47`, 47,3 é `47.3`. Não arredonde, não some, não complete o que faltou. O site escreve cada número como veio e a largura de cada folha da barra é o percentual divulgado: o que o instituto não divulgou fica vazio.
- **Nada nosso sobre pesquisas:** sem média, agregação, tendência, série histórica ou "quem está na frente nas pesquisas".
- `tipo`: `votos_totais` ou `votos_validos`, como o instituto divulgou. Os dois não se comparam, e o site mostra qual é.
- `resultados`: `13` e `22` são obrigatórios; `brancos_nulos` e `indecisos` só se o instituto os divulgou.
- `contratante`: quem contratou, como consta no registro. Se o registro não informa contratante, `null` (a chave é obrigatória: `null` é uma decisão, não um esquecimento).
- `registro`: número do PesqEle, no formato `BR-01234/2026`.
- `fonte_url`: `https://` da divulgação do instituto ou de veículo que a publicou. Vira o link "ver divulgação original".
- Res. TSE 23.600, art. 10: sem período de coleta, margem de erro, nível de confiança, número de entrevistas, instituto e contratante (quando houver) e número de registro, a pesquisa não pode ser divulgada. O site descarta em silêncio um item incompleto; por isso rode `npm test` depois de editar, que acusa o que faltou.
