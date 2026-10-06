# Tokens

Os valores vivem em `site/src/styles/tokens.css`. Cada linha abaixo diz por que o token tem esse valor. Contrastes calculados pela fórmula WCAG 2.x.

## Cor

| Token | Valor | Por quê |
|---|---|---|
| `--bg` | `#121110` | Preto quente, de muro à noite e cartaz colado. O fundo escuro vem do card (brief, seção 3). |
| `--ink` | `#F2EEE3` | Branco de papel de cartaz para o texto principal: 16,27:1 contra `--bg`. |
| `--ink-2` | `#8B867A` | Cinza médio quente para texto secundário: 5,20:1 contra `--bg` (texto AA). |
| `--cand-13` | `#F2464B` | Vermelho do Lula (decisão do Romero, 06/10: cor fixa por candidato, como Globo, G1 e CNN). Dá 5,17:1 contra `--bg`, o que serve como texto; `--bg` sobre ele também fica em 5,17:1. |
| `--cand-22` | `#6CC4FF` | Azul claro do Flávio Bolsonaro: 9,86:1 contra `--bg`; `--bg` sobre ele fica em 9,86:1. Tem luminância bem diferente do vermelho (1,91:1 entre os dois), então os dois se distinguem também em escala de cinza e para daltônicos. |
| `--accent` | `#B57BFF` | Violeta, só no selo: 6,50:1 contra `--bg`. Não compete com o vermelho nem com o azul dos candidatos. |
| `--surface-1` | `#1B1A18` | Superfície de placa e de campo. `--ink` sobre ela fica em 15,0:1. |
| `--surface-2` | `#2B2924` | "Outros" no 1º turno e separadores. `--ink-2` sobre ela fica em 4,01:1. |

Alternativas de acento, só no playground para aprovação: teal `#24CCC1` (9,41:1) e coral `#FF7A66` (7,39:1).

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
