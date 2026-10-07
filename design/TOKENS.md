# Tokens

Os valores vivem em `site/src/styles/tokens.css`. Cada linha abaixo diz por que o token tem esse valor. Contrastes calculados pela fórmula WCAG 2.x.

## Cor

| Token | Valor | Por quê |
|---|---|---|
| `--bg` | `#0E1411` | Preto levemente esverdeado: o tema Brasil, leve (decisão do Romero, 06/10). O fundo escuro vem do card (brief, seção 3). |
| `--ink` | `#F4F1E6` | Branco de papel de cartaz para o texto principal: 16,48:1 contra `--bg`. |
| `--ink-2` | `#95A097` | Cinza esverdeado para texto secundário: 6,88:1 contra `--bg` e 5,09:1 contra `--surface-2`. |
| `--cand-13` | `#F2464B` | Vermelho do Lula (decisão do Romero, 06/10: cor fixa por candidato, como Globo, G1 e CNN). Dá 5,11:1 contra `--bg`, o que serve como texto; `--bg` sobre ele também fica em 5,11:1. |
| `--cand-22` | `#6CC4FF` | Azul claro do Flávio Bolsonaro: 9,74:1 contra `--bg`; `--bg` sobre ele fica em 9,74:1. Tem luminância bem diferente do vermelho (1,91:1 entre os dois), então os dois se distinguem também em escala de cinza e para daltônicos. |
| `--accent` | `#F5C518` | Amarelo-ouro, só no selo: 11,43:1 contra `--bg`, e `--bg` sobre ele também. Não se confunde com o vermelho nem com o azul dos candidatos. |
| `--verde` | `#2BB673` | Verde da marca (faixa, wordmark, favicon): 7,14:1 contra `--bg`. Nunca em dado. |
| `--amarelo` | `#F5C518` | Amarelo da marca, o mesmo do acento. Nunca em dado. |
| `--surface-1` | `#16201B` | Superfície de placa e de campo. |
| `--surface-2` | `#223029` | "Outros" no 1º turno, separadores e município sem dado. `--ink-2` sobre ela fica em 5,09:1. |

Alternativas do selo, só no playground para aprovação: verde `#2BB673` (7,14:1) e violeta `#B57BFF`, o anterior.

## Tipo

| Token | Valor | Por quê |
|---|---|---|
| `--fs-1` | 13px | Meta em caixa-alta com tracking, o mínimo legível em rótulo curto. |
| `--fs-2` | 16px | Corpo e campos. Abaixo disso o iOS dá zoom no foco. |
| `--fs-3` | 22px | Nomes de candidato e títulos de seção. |
| `--fs-4` | 32px | Percentuais secundários e placar compacto. |
| `--fs-5` | clamp(44px, 11vw, 72px) | Destinos e títulos. É o limite mínimo do ajuste de largura. |
| `--fs-6` | clamp(64px, 18vw, 144px) | Percentuais do placar principal. |

Pesos e larguras:
- **Família:** Archivo, só ela.
- **900 display:** largura variável de 62% a 125%.
- **500 texto:** largura 100%.
- **Tracking de caixa-alta:** `--track-caps` vale 0,04em.

O card tem escala própria, documentada em `Card.ts`, com estes mínimos: texto ≥ 28 px e percentuais > 100 px.

## Espaço, forma e movimento

| Token | Valor | Por quê |
|---|---|---|
| `--sp-1` a `--sp-8` | 8, 16, 24, 32, 40, 48, 64, 96 px | Múltiplos de 8 (brief). |
| `--stroke-1` / `--stroke-2` | 2px / 4px | Filetes e costuras. São traço, não espaçamento. |
| `--radius` | 8px | Só em controles. Folhas, placas e card são retos (papel cortado). |
| `--dur-1` / `--dur-3` | 120 / 480 ms | Foco, hover e entrada das placas do mapa / entrada das folhas do comparativo. |
| `--ease` | cubic-bezier(.2,.7,.1,1) | Arranque rápido e assentamento seco, como uma placa mecânica. |

Sem token de sombra: o brief aceita "uma sombra ou nenhuma" e o site ficou com nenhuma. A placa que vira (2 × 120 ms por algarismo) mede o tempo em `lib/flap.ts`, não em token.
