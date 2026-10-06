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

`hist-uf/{uf}.json` (27) e `hist-br.json` são **FICTÍCIOS, porém plausíveis**: mesmo schema do hist de cidade (`contracts/schemas/hist.schema.json`), escritos à mão para o mapa e o placar terem números com cara de eleição (o 13 forte no Nordeste, o 22 no Centro-Sul e no Norte agrícola, "outros" entre 7% e 15% no 1º turno, o Brasil quase empatado). Não são resultados do TSE e não vêm de agregação das cidades do stub. Somam 100 (testado em `src/lib/mapa-dados.test.ts`). O mapa no modo `pre` lê o `t1_2026` deles; as fixtures do 2º turno das UFs e do Brasil partem deles (`contracts/scripts/fixtures.ts`). A Fase 0.5 os gera dos CSVs do TSE, agregando por UF.

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
