# Direção visual: DESTINO

Síntese de quatro propostas (letreiro, lambe-lambe, placa, coringa) e das críticas de conformidade. O brief (`BRIEF-FRONTEND.md`) continua mandando: este arquivo só decide o que o brief deixou em aberto. Em conflito, vale o brief.

## A ideia em uma frase

Cada cidade é um destino de letreiro de ônibus. O nome dela, em caixa-alta Archivo 900, ocupa a largura inteira, de margem a margem. O eixo de largura da fonte (wdth 62–125) estica NATAL e comprime SANTA BÁRBARA D'OESTE, então cada cidade tem uma silhueta tipográfica própria que se reconhece a 350 px antes de ler qualquer número. Embaixo vêm duas folhas de lambe-lambe coladas lado a lado: 13 sempre à esquerda, 22 sempre à direita, quem lidera em tinta clara, o segundo em cinza. O violeta só aparece onde algo **mudou desde 2022** e no selo.

## Os quatro gestos (é isto que torna o site memorável)

1. **O DESTINO (ajuste à largura pelo eixo wdth).** `lib/destino.ts` calcula, para um texto e uma largura-alvo, o `font-stretch` (62%–125%) e o tamanho da fonte para o texto encostar nas duas margens. Faz isso de forma pura e determinística, com uma tabela de avanços por glifo medida da fonte real. Os passos são estes:
   - Primeiro varia o wdth no tamanho máximo.
   - Se nem com wdth 62 couber, reduz o tamanho até o mínimo.
   - Abaixo do mínimo, quebra em 2 linhas no espaço mais equilibrado.
   - Nomes curtos (UNA, JAÚ) ficam em wdth 125 no tamanho máximo, alinhados à esquerda, sem forçar.

   Onde aparece: o nome da cidade no card, o H1 da página de cidade (renderizado no build, sem JS), o título "QUAL É A SUA CIDADE?" da home e as sugestões da busca. Nunca escala o glifo (nada de `textLength`/`lengthAdjust`, nada de `transform: scaleX`), só o eixo da fonte.

2. **A FOLHA (cor da posição).** Quem lidera veste `--ink` e o segundo veste `--ink-2`. A cor muda de dono quando a liderança muda; as colunas nunca trocam de lugar (13 à esquerda, 22 à direita, sempre). A barra horizontal tem dois segmentos proporcionais, uma costura de 4 px em `--bg` e uma marca de 50%. No segmento do líder, quando ele é largo o bastante, vai o rótulo "LIDERA" em `--bg` (só em parcial).

3. **A SETA DE DESLOCAMENTO (acento como verbo).** A variação vs 2022 é um número em `--accent` acompanhado de uma seta que aponta para o **lado** de quem ganhou terreno (◀ = 13, que está à esquerda; ▶ = 22, à direita). A seta codifica movimento, não candidato. Se não há 2022 (cidade nova, governador), não há seta nem acento: o site fica monocromático. As 28 bandeiras são a única outra cor.

4. **O PAINEL QUE VIRA (letreiro split-flap).** Os números que mudam viram como placas de painel de rodoviária. Vira só o algarismo que mudou, da direita para a esquerda, em `transform: scaleY` 2D, com até 240 ms por algarismo. Não há textura de LED nem número falso: a placa nunca mostra um valor que não seja o real. No modo `pre` o painel é a contagem regressiva "APURAÇÃO DO 2º TURNO EM 18 D 06 H 12 MIN", que vira a cada minuto. Com `prefers-reduced-motion`, o número apenas é trocado.

## Tipografia

- **Archivo**, uma família só, dois pesos. Os arquivos estão em `public/fonts/archivo/`.
  - **900, display** (`archivo-display.woff2`, wdth 62–125, 29 KB): nome de cidade, percentuais, números, títulos, botões, rótulos em caixa-alta.
  - **500, texto** (`archivo-text.woff2`, wdth 100, 12 KB): texto corrido, legendas, meta.
- `font-variant-numeric: tabular-nums` em todo número (`base.css` já aplica no body; não desligar).
- Caixa-alta com `letter-spacing: var(--track-caps)` em rótulos.
- No card, só o peso 900, num subset base64 com os glifos necessários. Peso pesado sobrevive à redução para 350 px.
- Fora da lista: Bebas Neue, Oswald, Inter, fonte do sistema como estilo.

## Cor

Os tokens estão em `site/src/styles/tokens.css` e a justificativa em `design/TOKENS.md`.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#121110` | fundo (preto quente, muro à noite) |
| `--ink` | `#F2EEE3` | líder, texto principal (16,3:1) |
| `--ink-2` | `#8B867A` | segundo colocado, texto secundário (5,2:1) |
| `--accent` | `#B57BFF` | variação vs 2022 e selo, nada mais (6,5:1) |
| `--surface-1` | `#1B1A18` | placas, campos |
| `--surface-2` | `#2B2924` | "outros" no 1º turno, separadores |

Regras de uso:
- O foco do teclado é `--ink`, nunca `--accent`.
- Indicador de "ao vivo" não usa acento.
- Nenhum vermelho, azul, verde ou amarelo fora das bandeiras.
- O playground pode alternar o acento (`data-acento="teal" | "coral"`) só para aprovação.

## Forma

- O raio de 8 px vale só para controles (campo de busca, botões, selo).
- Folhas, placas do mapa e o card são retângulos retos: papel cortado.
- Sem sombra, textura, grão, gradiente decorativo, inclinação, blur ou vidro.
- Filetes de 2 ou 4 px (`--stroke-1`, `--stroke-2`).
- Espaçamento só em `--sp-*` (múltiplos de 8).

## Bandeiras

- Use sempre `<Bandeira uf="ma" largura={40} />` (`src/components/Bandeira.astro`).
- A caixa é fixa na proporção 10:7 e a bandeira fica inteira dentro dela (`object-fit: contain`).
- Nunca recortar, aplicar filtro ou opacidade, usar como fundo, recolorir, girar ou animar a bandeira em si.
- O Brasil aparece **sempre junto das 27**, no **mesmo tamanho**, como mais uma placa do sistema. Não ganha contorno, destaque, posição de herói nem tamanho maior. No cabeçalho do placar BR, a bandeira do Brasil tem o mesmo tamanho das placas do mapa.

## Card (1200×675, `components/Card.ts`, `renderCard(dados): string`)

### Zonas (y em px)

| Zona | y | Conteúdo |
|---|---|---|
| A | 48–92 | bandeira da UF (caixa 56×39), linha meta `MA · 2º TURNO 2026 · PARCIAL · 87% DAS SEÇÕES` em 28–30 px (`--ink-2`, números em `--ink`), selo à direita (placa `--accent`, texto `--bg`, raio 8, ≥ 28 px) |
| B | 104–236 | DESTINO: nome da cidade com ajuste de largura em 1104 px, tamanho máximo de ~150 px; em 2 linhas o tamanho é menor e a zona B cresce até 268 |
| C | 252–306 | variação: `◀ +3,4 PONTOS PARA LULA EM RELAÇÃO A 2022` em `--accent` (número ≥ 56 px, resto ≥ 30 px); se a margem atual for < 1 ponto, `DIFERENÇA DE 312 VOTOS` em `--ink` |
| D | 318–362 | barra de 1104×40, dois segmentos proporcionais, costura de 4 px, marca de 50%, "LIDERA" dentro do líder |
| E | 380–572 | duas colunas: `13 · LULA · PT` à esquerda e `22 · FLÁVIO BOLSONARO · PL` alinhado à direita (≥ 30 px, número em plaquinha); percentuais de 132 a 160 px, líder `--ink`, segundo `--ink-2` |
| F | 596–628 | rodapé: `DOMINIO.COM.BR · @CONTA` à esquerda e `FONTE: TSE · 18:42` à direita, ≥ 28 px |

### Regras gerais

- Margens laterais de 48 px.
- **Área segura:** nada crítico acima de y=44 nem abaixo de y=631, por causa do recorte 2:1 do link card do X. O canto inferior esquerdo pode ser coberto pelo selo de domínio do X, por isso o domínio fica justamente ali (fica redundante) e a hora fica à direita.
- Texto secundário ≥ 28 px e percentuais > 100 px. O sinal de "%" pode ser menor, mas o número não.
- Vocabulário só de `lib/copy.ts`: "lidera" só em parcial; em `final`, a cidade não usa rótulo de posição (a cor já diz quem teve mais votos); "eleito(a)" só com `eleito: true` no JSON.
- **Modos:**
  - `parcial`: comportamento padrão.
  - `final`: `FINAL · 100% DAS SEÇÕES`.
  - `palpite`: as folhas viram contorno de 4 px (sem preenchimento), com o selo `SEU PALPITE`, sem "lidera", sem barra cheia e com o rodapé `PALPITE · NÃO É RESULTADO`.
  - `governador`: o cargo entra na linha meta; sem seta 2022, mostra a margem entre os dois.
- Para o PNG sair idêntico, a fonte vai embutida como `@font-face` com `data:` base64 (subset). Esse subset só é carregado quando o botão Compartilhar for tocado; inline na página, o SVG usa a fonte já carregada.

## Home (mobile primeiro; 360–390 px é o alvo principal)

### Ordem vertical (primeira dobra a 390×844)

1. **Cabeçalho**: wordmark (`SITE_NAME`, 900, wdth 125, caixa-alta) e uma pílula de estado:
   - `pre`: `1º TURNO APURADO · 2º TURNO 25 OUT`;
   - `live`: `AO VIVO · 87% · 18:42`.
2. **"QUAL É A SUA CIDADE?"** como DESTINO, de margem a margem.
3. **Campo de busca como letreiro**:
   - faixa de largura total, altura ≥ 56 px, filete de 3 a 4 px em `--ink`, raio 8, texto 900 em caixa-alta;
   - foco = filete mais grosso e cursor visível (não inverter para fundo `--ink`, que significa "líder");
   - sugestões = linhas de destino (nome com ajuste de largura + sigla da UF);
   - logo abaixo, o botão secundário `USAR MINHA LOCALIZAÇÃO`.
4. **Painel**:
   - `pre`: contagem regressiva split-flap até `status.inicio`, mais o placar BR do 1º turno 2026 (13 · outros · 22, sendo "outros" em `--surface-2`) comparado ao 2º turno de 2022;
   - `live`: o placar BR em folha.
5. **MAPA**: o muro de 28.
6. **Minhas cidades**, quando houver (Fase 3), e o rodapé (Fonte: TSE, aviso de dados fictícios enquanto as fixtures estiverem no ar).

### Desktop (≥ 1024 px)

Grade de 12 colunas: à esquerda (5 colunas) a busca, o painel e o placar; à direita (7 colunas) o mapa, `sticky`.

### Movimento

Uma única entrada orquestrada: as placas do mapa entram em 20 ms de escalonamento, com `opacity` e `translateY(8px)`, em menos de 700 ms no total. Ela nunca atrasa o elemento de LCP (título e busca aparecem no primeiro quadro). O resto é o painel que vira.

## Mapa: o muro de 28 (`components/Mapa.astro`)

- **Cartograma de placas iguais** (Brasil + 27 UFs) numa grade aproximadamente geográfica (cerca de 7×8). Não há polígonos, e nunca mapa municipal.
- **Brasil** é a 28ª placa, numa célula vazia do oceano, com o mesmo tamanho e o mesmo tratamento das outras.
- **Placa** (cerca de 48–56 px no mobile):
  - a bandeira intacta no topo;
  - a sigla em 900;
  - a mini-barra de 2 segmentos (13 à esquerda, 22 à direita, líder `--ink`, segundo `--ink-2`);
  - quando há variação vs 2022 de magnitude ≥ 0,5 ponto, a seta de deslocamento em `--accent` (no desktop, com o número).
- **Proibido:** pintar a placa pela cor de quem lidera; legenda "esquerda/direita" com sentido ideológico. A legenda diz literalmente `13 À ESQUERDA · 22 À DIREITA (ORDEM DO NÚMERO DE URNA)` ou equivalente neutro.
- **Interação:**
  - foco ou hover mostra uma placa de detalhe (nome da UF, os dois percentuais, a variação e o link) num painel fixo, não em tooltip flutuante;
  - toque ou clique leva a `/uf/{uf}`;
  - JS ≤ 3 KB gzip.
- **Modos:**
  - `pre`: 1º turno 2026 por UF (13 · outros · 22), sem seta;
  - `parcial`/`final`: 2º turno, com seta.

## Desempenho (não negociável)

- Página de cidade: ≤ 50 KB de JS gzip.
- Home: ≤ 20 KB de JS gzip.
- LCP < 1,5 s em 4G.
- CLS ≈ 0: o card SVG tem caixa fixa e os números são tabulares.
- Bandeiras: raster gerado a partir do SVG oficial pelo Chrome, em tamanho 2× ou 3× da caixa, com `loading="lazy"` fora da primeira dobra.
- CSS escopado por componente.
- Nada de biblioteca de UI, gráfico ou autocomplete.

## Pendências de aprovação do Romero (sinalizar no checkpoint, não decidir sozinho)

1. Fonte Archivo e acento violeta `#B57BFF`. O playground alterna teal e coral.
2. `--ink` claro no fundo escuro: o brief diz "tinta escura" para o líder, mas o card tem fundo escuro, então foi interpretado como a tinta de maior contraste.
3. Seta e número em acento nas placas do mapa: é variação vs 2022, mas amplia o uso do acento.
4. Governador sem comparação com 2022 (mostra a margem); cidade em `final` sem rótulo de posição.
5. Selos ainda sem texto final em `copy.ts`; "virada" nos selos de ranking vem do próprio brief, não é "virada confirmada".
