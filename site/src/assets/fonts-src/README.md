# Fonte completa (origem dos subsets)

`archivo.ttf`: variável (eixos wght 100–900 e wdth 62–125), licença SIL OFL 1.1, de `github.com/google/fonts` (`ofl/archivo`).

Usos:
- `npm run fonts` gera `public/fonts/archivo/archivo-display.woff2` (wght 900, wdth 62–125), `archivo-caps.woff2` (o mesmo 900, só os glifos de caixa-alta que a interface usa) e `archivo-text.woff2` (wght 500, wdth 100), subset latino. `styles/fonts.css` carrega o caps; o display completo só baixa se algum texto em 900 usar um glifo fora dele.
- O subset do card (SVG com `@font-face` base64, só os glifos necessários) parte deste arquivo com `subset-font`.

Não importar este TTF no bundle do site.
