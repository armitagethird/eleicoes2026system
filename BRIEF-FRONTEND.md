# Brief para o Claude Code — Fase 1: design e front-end

Projeto: site de resultados do 2º turno das eleições brasileiras de 2026 (25 de outubro), em tempo real, mobile-first, feito por uma pessoa só. Este brief cobre **somente design e front-end**. Worker de dados, renderizador de OG e qualquer backend ficam para um brief posterior. Não os construa agora.

Coloque este arquivo na raiz do repositório e referencie-o no `CLAUDE.md`. Trabalhe em fases, na ordem abaixo, com commits pequenos. Ao terminar cada fase: `npm run build`, Lighthouse mobile na página de cidade, e **pare para revisão** antes de seguir.

---

## 0. Pendências do Romero (resolver antes do CHECKPOINT da Fase 1)

- **Nome do site, domínio e @ no X.** Até lá, use constantes em `src/lib/site.ts` (`SITE_NAME`, `SITE_URL`, `X_HANDLE`) e nunca escreva esses valores direto em componente ou template. Trocar depois tem que ser uma linha.
- **Fonte e cor de acento** são escolhidas pelo Claude Code na Fase 1 e aprovadas por mim no playground; não decidir sozinho fora das opções da seção 3.

## 1. O produto em uma frase

"Veja como a sua cidade está votando agora e quanto ela mudou desde 2022, num card que você compartilha em um toque."

O card da cidade é o produto. O site existe para levar a pessoa ao card em um toque e dar motivos para ela postá-lo no X. Toda decisão de design e código responde a: isso encurta o caminho até o card ou dá um motivo a mais para compartilhá-lo?

## 2. Decisões já tomadas (não reabrir)

- **Astro** com `output: 'static'`, sem SSR, sem adapter. Deploy no Cloudflare Pages.
- **Ilhas em JS puro ou Preact**. Nada de React. Página de cidade com no máximo **50 KB de JS gzip**.
- **CSS puro com custom properties**. Sem Tailwind, sem UI kit, sem biblioteca de componentes.
- **Site 100% estático.** Dados ao vivo chegam como arquivos JSON estáticos em `/data/…` (gerados depois por um worker). O front só faz `fetch` desses arquivos a cada 20 s.
- **O card é um template SVG** gerado por uma função TypeScript pura (`renderCard(dados): string`). O mesmo template é usado inline na página, convertido em PNG no navegador para compartilhar e, depois, renderizado no servidor para a OG. Uma fonte de verdade, três usos.
- **Nada de 3D, Three.js, newsletter.** Fora de escopo, decidido.
- **Apuração em tempo real com mapa municipal (decisão do Romero, 06/10/2026).** `/apuracao` substitui `/rankings`: mapa geográfico de verdade (Brasil → UF → município, 5.571 polígonos do IBGE), navegável e interativo, ao vivo no dia 25, com "comparar com 2022". Antes do dia 25 mostra os mapas do 1º e do 2º turno de 2022 (e o 1º turno de 2026). As quatro listas de rankings viram um painel dessa página. No muro de 28 da home, a sigla de cada UF fica na cor de quem tem mais votos ali (exceção aprovada à regra "liderança em texto"; a placa não é pintada). Clicar num estado abre o mesmo painel completo do município (placar, variação, linha de apuração) com o botão VER O CARD, que leva a /uf/{uf}; a página do estado tem o card do estado e o compartilhar, como a da cidade. Sem biblioteca de mapa: geometria projetada no build, desenho em canvas.
- **Comparação histórica (decisão do Romero, 06/10/2026).** Página com gráfico de linha comparando 2018, 2022 e 2026. Abre com o gráfico completo (todas as eleições); a pessoa escolhe ver só 2018, só 2022, só 2026 ou qualquer combinação (seleção múltipla), e o eixo mostra só os turnos das eleições escolhidas. Em 2018 o candidato do Bolsonaro era o 17 (PSL): a cor segue o campo (PT vermelho, Bolsonaro azul), a aprovar.
- **Pesquisas registradas no TSE na home (decisão do Romero, 06/10/2026).** Só pesquisas com registro no PesqEle e todas as informações do art. 10 da Res. TSE 23.600 visíveis junto de cada uma (período de coleta, margem de erro, nível de confiança, número de entrevistas, instituto e contratante, número de registro). Cada pesquisa aparece separada: sem média, agregador ou cálculo próprio sobre pesquisas. Sem enquete. Sem mercado de apostas (o Polymarket está proibido no Brasil desde 24/04/2026). O bloco some nos modos `live` e `final`. Critério de seleção (06/10): a mais recente de cada um dos institutos que mais se aproximaram do resultado do 1º turno de 2026 (hoje Gerp, Quaest e PoderData).
- **Nada de texto de matéria jornalística.** Só números do TSE e cálculos próprios.

## 3. Direção visual

Referência: lambe-lambe, letreiro de ônibus, placa de rua. Tipográfico, denso em informação, alto contraste, sem enfeite. Não é grafite: sem textura, grão, stencil, texto inclinado ou sombra. Tudo isso morre a 350 px de largura na timeline do X.

### Cor pertence ao candidato (decisão do Romero, 06/10/2026)

- Revoga a regra original de "cor pertence à posição". Como fazem os grandes veículos (Globo, G1, CNN), cada candidato tem **cor fixa** em todo o site, no card e no mapa: **13 Lula = vermelho (`--cand-13`)**, **22 Flávio Bolsonaro = azul claro (`--cand-22`)**. A cor não troca quando a liderança troca; quem lidera é indicado por texto ("lidera") e pela barra.
- **Tema Brasil, leve (decisão do Romero, 06/10/2026).** Fundo levemente esverdeado; verde (`--verde`) e amarelo-ouro (`--amarelo`) só em detalhes de marca (faixa no topo, wordmark, favicon) e o **acento** (`--accent`, amarelo-ouro) só no selo. Nunca colorem dado de candidato. A variação vs 2022 usa a cor do candidato que ganhou terreno. Vermelho e azul existem só como cores dos candidatos, nunca como marca.
- Fundo escuro no card (`--bg`). O site herda o card: tema escuro como padrão; tema claro via `prefers-color-scheme` só se custar menos de uma hora.
- Verde e amarelo: nas bandeiras e nos detalhes de marca acima, sempre leves; nunca em barra, mapa ou número de candidato.

### Tipografia

- Uma família grotesca ou condensada pesada, do Google Fonts, com `font-variant-numeric: tabular-nums` obrigatório em todo número que atualiza (senão o layout "pula" a cada 20 s). Candidatas: **Archivo** (Black/Expanded), **Barlow Condensed**, **Space Grotesk**. Escolha uma e no máximo dois pesos.
- **Evite Bebas Neue e Oswald**: são a cara de material de campanha brasileiro.
- No canvas do card (1200×675): texto secundário nunca abaixo de 28 px; percentuais dos candidatos acima de 100 px. Teste visual olhando o PNG a 350 px de largura.

### Tokens

Crie `src/styles/tokens.css` com: 3 cores (`--bg`, `--ink`, `--ink-2`) + `--accent` + 2 tons de superfície; escala de tipo com 6 passos; espaçamento em múltiplos de 8; raio 8; uma sombra ou nenhuma. Escreva os valores em `design/TOKENS.md` com uma linha de justificativa cada.

### Bandeiras como identificadores

- A bandeira do Brasil aparece **sempre junto das 27 bandeiras estaduais**, no mesmo tamanho, como ícone do placar nacional e dos estados. Sistema de 28 ícones, nunca elemento de destaque.
- Sempre intactas: nunca fundo, textura, marca d'água, recorte, recolorida ou distorcida (a Lei 5.700/1971 veda alteração de forma, cores e proporções).
- Use SVGs das bandeiras oficiais (domínio público), otimizados com svgo, em `src/assets/flags/{br,ac,al,…}.svg`.

## 4. Regras inegociáveis na interface

- Candidatos sempre na **mesma ordem: número de urna** (13 antes de 22), em todo lugar, independentemente de quem lidera.
- Vocabulário fixo, em `src/lib/copy.ts`: `lidera` em parcial; `eleito(a)` **somente** quando o JSON marcar `eleito: true`; nunca "venceu", "virada confirmada", "projeção". Todo card traz `parcial · X% das seções · Fonte: TSE · HH:MM`.
- Cores fixas por candidato (13 vermelho, 22 azul claro; seção 3), iguais em todo o site. Nenhum rótulo ideológico. Pesquisa eleitoral só as registradas no TSE, com os dados do art. 10 da Res. 23.600 (seção 2); nunca enquete, média ou odds de apostas.
- **Sem fotos de candidatos.** Só nome, número e partido em texto. Foto pesa, envelhece a página e muda a leitura emocional do card.
- **Palpite é local**: fica em `localStorage`, nunca é enviado a servidor nenhum, nunca vira agregado. Não crie endpoint para isso. (Enquete é proibida no período eleitoral; coletar palpites já seria uma.)
- Formulário "me avisa": consentimento explícito em texto, um envio prometido ("às 17h do dia 25, com o link da sua cidade") e um de resultado final. Nesta fase o `POST` vai para um endpoint placeholder atrás de feature flag.

## 5. Estrutura do repositório

```
/site            Astro (este brief)
/contracts       JSON Schema dos arquivos de dados + fixtures
/design          TOKENS.md, decisões visuais, prints de referência
/worker          (depois) Java/Spring: lê o TSE, publica /data
/renderer        (depois) SVG → PNG para OG
```

Dentro de `/site`:

```
src/
  pages/
    index.astro               home: busca, geolocalização, placar BR, 28 bandeiras
    c/[slug].astro            página da cidade (5.570, geradas no build)
    uf/[uf].astro             página do estado (27)
    rankings.astro            mais dividida, mais unânime, maior virada, capitais
    design.astro              playground do card (só em dev)
    404.astro
  components/
    Card.ts                   renderCard(dados): string  ← SVG, fonte de verdade
    Placar.astro              dois candidatos, barra, ordem fixa
    Busca.astro + busca.ts    ilha: autocomplete + geolocalização
    Compartilhar.ts           ilha: SVG → PNG → Web Share / download
    AoVivo.ts                 ilha: polling 20 s, atualiza DOM
    MinhasCidades.ts          ilha: localStorage
    Palpite.ts                ilha: slider, localStorage, card de palpite
    MeAvisa.astro             formulário atrás de flag
    Bandeira.astro            <Bandeira uf="ma" />
  data/
    municipios.json           slug, nome, uf, cod_tse, cod_ibge, lat, lon, eleitores
    hist/{slug}.json          2022 e 1º turno 2026 por município (embutido no build)
  lib/
    copy.ts                   vocabulário fixo
    format.ts                 números pt-BR, pontos percentuais, horas
    status.ts                 modo pre | live | final
  styles/
    tokens.css, base.css
public/
  data/                       fixtures servidas como se fossem o CDN (dev)
  og/fallback.png             OG genérica da marca
```

## 6. Contratos de dados (congele agora, o worker será escrito contra eles)

Escreva os JSON Schemas em `/contracts` e gere fixtures em `/contracts/fixtures` e `public/data`. **Valores das fixtures são fictícios para desenvolvimento**; marque isso no README. Os nomes dos candidatos são reais (é o que o site vai exibir).

`/data/status.json`

```json
{ "v": 1, "modo": "pre", "inicio": "2026-10-25T17:00:00-03:00", "atualizado": "2026-10-12T10:00:00-03:00" }
```

`modo` ∈ `pre` (antes do dia 25: mostra 1º turno final + 2022, esconde bloco ao vivo, mostra palpite e me-avisa) · `live` (polling ligado) · `final` (100% apurado, card de resultado final, card do palpite).

`/data/br.json` e `/data/uf/{uf}.json`

```json
{
  "v": 1, "turno": 2, "atualizado": "2026-10-25T18:42:10-03:00",
  "secoes_pct": 87.3, "comparecimento_pct": 79.1, "abstencao_pct": 20.9,
  "presidente": {
    "cand": [
      { "n": 13, "nome": "Lula", "partido": "PT", "votos": 0, "pct": 0.0, "eleito": false },
      { "n": 22, "nome": "Flávio Bolsonaro", "partido": "PL", "votos": 0, "pct": 0.0, "eleito": false }
    ],
    "variacao_2022": { "13": 0.0, "22": 0.0 },
    "brancos": 0, "nulos": 0
  },
  "governador": null
}
```

`governador` é `null` fora de AC, AM, DF, ES, RJ, RN e TO; nesses sete, tem a mesma forma de `presidente`.

`/data/c/{slug}.json`

```json
{
  "v": 1, "slug": "sao-luis-ma", "nome": "São Luís", "uf": "MA",
  "cod_tse": 0, "cod_ibge": 0, "eleitores": 0,
  "atualizado": "2026-10-25T18:42:10-03:00", "secoes_pct": 87.3,
  "presidente": { "cand": [], "variacao_2022": {}, "diferenca_votos": 0 },
  "governador": null,
  "selos": ["mais_dividida_uf"],
  "rank": { "dividida_br": 5, "dividida_uf": 1, "virada_uf": null },
  "virou": false
}
```

`src/data/hist/{slug}.json` (embutido no build, não muda no dia)

```json
{ "t2_2022": { "pct": { "13": 0.0, "22": 0.0 }, "comparecimento_pct": 0.0 },
  "t1_2026": { "pct": { "13": 0.0, "22": 0.0, "outros": 0.0 }, "comparecimento_pct": 0.0 } }
```

Regras do front sobre os contratos: tolerar campos ausentes; se `secoes_pct < 1`, mostrar "aguardando primeiras seções"; nunca inferir `eleito` a partir de percentual.

## 7. Fases

### Fase 0 — Setup (meio dia)

- `npm create astro@latest` em `/site`, TypeScript estrito, `output: 'static'`.
- `tokens.css`, `base.css`, fontes auto-hospedadas com `font-display: swap` e subset latino.
- `/contracts` com schemas e fixtures; script `npm run fixtures` que copia para `public/data`.
- `municipios.json` com as 5.570 cidades (slug = `nome-uf` normalizado, único). Se os dados reais ainda não estiverem no repo, gere um stub com 50 cidades reais variadas (capitais e nomes longos como "Santa Bárbara d'Oeste" e "São João da Boa Vista") e marque TODO.
- Config do Cloudflare Pages e `_headers` com `Cache-Control` curto para `/data/*` (15 s) e longo para assets com hash.

### Fase 0.5 — Dados estáticos reais (1 dia, pode rodar em paralelo às Fases 1 e 2)

Não é backend: são scripts de ETL que rodam uma vez e geram arquivos commitados em `src/data/`. Até terminarem, as páginas usam fixtures; quando terminarem, nada no front muda além dos números.

- `scripts/municipios.py` (ou `.ts`): gera `src/data/municipios.json` com as 5.570 cidades. Fontes: lista oficial com código IBGE na API do IBGE (`servicodados.ibge.gov.br/api/v1/localidades/municipios`); latitude e longitude de um dataset público de municípios com código IBGE (há vários no GitHub; escolha um e cite no README); código TSE via tabela de-para TSE↔IBGE (por exemplo, o diretório de municípios da Base dos Dados). **O código de município do TSE não é o do IBGE**; sem o de-para nada bate.
- `scripts/hist.py`: baixa do Portal de Dados Abertos do TSE os CSVs `votacao_candidato_munzona` de 2022 (2º turno) e de 2026 (1º turno), agrega por município e cargo, calcula percentuais sobre votos válidos e comparecimento, e grava `src/data/hist/{slug}.json` no formato da seção 6. Valide: soma dos percentuais ≈ 100, 5.570 arquivos, nenhum slug duplicado.
- Slug = `nome-uf` normalizado (sem acento, minúsculo, hífens). Nomes se repetem entre UFs, nunca dentro da mesma UF, então o sufixo da UF basta.
- `scripts/fixtures.ts` passa a gerar as fixtures de `/data/*` a partir dos dados reais de `hist/`, com números do 2º turno fictícios. Marque no README o que é real e o que é fictício.

Aceite: `npm run build` gera 5.570 páginas com dados históricos reais; o card de qualquer capital mostra a variação 2022 → 1º turno correta conferida à mão contra o site do TSE em três cidades.

### Fase 1 — Design system e o card (1 a 2 dias) → CHECKPOINT

1. `Card.ts`: `renderCard(dados: CardData): string` devolve SVG 1200×675. Entradas: cidade/UF, cargo, dois candidatos (ordem 13, 22), pct, quem lidera, variação vs 2022, `secoes_pct`, hora, selo opcional, modo (`parcial` | `final` | `palpite`), handle e domínio.
2. Layout do card: topo "São Luís (MA) · 2º turno 2026 · parcial, 87% das seções"; centro com os dois candidatos, barra horizontal, percentuais grandes; número forte "+3,4 pontos para X em relação a 2022" (ou "diferença de 312 votos" se a margem for menor que 1 ponto); selo em `--accent`; rodapé "Fonte: TSE · 18:42 · dominio.com.br · @conta". Bandeira da UF pequena, intacta, no topo.
3. Fonte embutida no SVG como `@font-face` com `data:` base64 (subset), para o PNG no navegador sair idêntico. Carregar esse subset só quando o botão Compartilhar for tocado.
4. `pages/design.astro`: playground com uma grade de variantes — parcial 10%, parcial 87%, final, virou, com selo, sem selo, governador, palpite, nome de cidade longo, margem de 0,1 ponto, 100% para um lado (cidade pequena). Esta página é o critério de aceite da fase: eu olho e aprovo.
5. Componentes mínimos: `Placar.astro`, `Bandeira.astro`, botão primário, campo de busca. Nada além disso.

Aceite: card legível a 350 px de largura; 13 sempre vermelho e 22 sempre azul claro; ordem 13 → 22 em todas as variantes; `tabular-nums` em todos os números.

### Fase 2 — Páginas com dados históricos (2 dias) → CHECKPOINT

- `index.astro`: campo de busca na primeira dobra com autocomplete (índice leve em JSON, sem biblioteca), botão "usar minha localização" (geolocalização → cidade mais próxima por lat/lon), placar BR, grade das 28 bandeiras levando às UFs.
- `c/[slug].astro` via `getStaticPaths` para todas as cidades: card inline (SVG), 2022 e 1º turno lado a lado a partir de `hist/`, botão Compartilhar, "minhas cidades", palpite (modo `pre`), me-avisa (flag), Pix discreto que só aparece depois de compartilhar. `<title>` e meta description no padrão "Resultado do 2º turno 2026 em São Luís (MA) — comparado com 2022". Meta OG apontando para `/og/{slug}.png` com fallback para `/og/fallback.png`.
- `uf/[uf].astro`: placar da UF, governador quando existir, lista das cidades da UF ordenada por eleitores.
- `rankings.astro`: quatro listas lidas de `/data/rankings.json` (adicione ao contrato: `{ dividida: [slug…], unanime: [...], virada: [...], capitais: [...] }`).
- Estados vazios e erro: "aguardando primeiras seções", "sem conexão, mostrando última atualização às HH:MM".
- SEO básico: `@astrojs/sitemap` (índice de sitemaps, porque são mais de 5.000 URLs), `robots.txt`, `<link rel="canonical">` sem query string, `lang="pt-BR"`, JSON-LD mínimo de `WebPage` com `dateModified`.

Aceite: build gera todas as páginas; Lighthouse mobile ≥ 90 em performance e acessibilidade na página de cidade; JS ≤ 50 KB gzip; LCP < 1,5 s em 4G simulado.

### Fase 3 — Ilhas ao vivo (1 a 2 dias) → CHECKPOINT

- `AoVivo.ts`: lê `status.json`; em `live`, faz `fetch` do JSON da página a cada 20 s com `If-None-Match`, atualiza números, barra, `secoes_pct`, selos e cor de posição sem re-renderizar a página. Em `final`, troca o card para o modo final. Pausa o polling quando a aba está oculta.
- `Compartilhar.ts`: SVG → `Image` → `canvas` → `Blob` PNG → `navigator.share({ files, text, url })`. Fallback: download do PNG + copiar texto. Texto pré-preenchido: "São Luís: A 61% × B 39%, +3 pts vs 2022 · 87% apurado · dominio.com.br/c/sao-luis-ma?t=1842". **Anexe a hora ao link** (`?t=HHMM`) para o preview no X refletir aquele momento; a URL canônica continua limpa.
- `MinhasCidades.ts`: até 5 cidades em `localStorage`, exibidas na home e em cada página de cidade.
- `Palpite.ts`: slider 0–100 para o candidato 13 (o 22 é o complemento), salvo localmente; gera card no modo `palpite`; em `final`, mostra "você errou por X pontos" e o card correspondente. Nenhuma chamada de rede.
- Simulador de dev: `npm run simular` reescreve as fixtures em `public/data` progressivamente (5% → 100% em 2 minutos) para ver a página se mover.

Aceite: compartilhar funciona no Chrome Android e no Safari iOS (teste real em aparelho); polling para quando a aba some; nenhuma requisição além de `/data/*`.

### Fase 4 — (próximo brief, não fazer agora)

Worker Java que lê o TSE e publica `/data`; renderizador SVG → PNG para `/og/{slug}.png`; teste de carga; ensaio geral.

## 8. Não fazer nesta fase

- Backend, API, SSR, banco de dados, autenticação.
- Ler o TSE diretamente do navegador.
- Three.js, 3D, animações pesadas, parallax.
- Biblioteca de mapa ou de gráfico (o mapa municipal e o gráfico de linha são feitos à mão: canvas e SVG).
- Tailwind, React, bibliotecas de gráficos, bibliotecas de autocomplete.
- Analytics pesado. No máximo Cloudflare Web Analytics, e só na Fase 3.
- Qualquer agregação de palpites; média ou agregação de pesquisas; enquete; odds de mercado de apostas.

## 9. Como trabalhar

- Um commit por item concluído, mensagens em português, no imperativo.
- Testes com Vitest só onde um erro seria vergonhoso em público: `renderCard` (ordem 13 → 22 em todas as variantes, cor de posição, texto de margem < 1 ponto), `format.ts` (pt-BR, pontos percentuais, horas) e os scripts de ETL (soma ≈ 100, 5.570 arquivos, slugs únicos). Nada de teste de componente visual.
- Antes de cada CHECKPOINT: `npm run build`, Lighthouse mobile na página `c/sao-luis-ma`, prints do `design.astro` a 350 px e 1200 px salvos em `/design/prints/`.
- Quando uma decisão deste brief conflitar com algo que você descobrir no código, **pare e pergunte**; não decida sozinho sobre cor, ordem de candidatos, vocabulário ou qualquer coisa da seção 4.
- Prefira menos: uma página de cidade rápida e um card perfeito valem mais do que qualquer feature da Fase 3.
