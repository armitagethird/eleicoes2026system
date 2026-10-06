# Rasters das bandeiras

Gerados por `npm run flags:raster` a partir dos SVGs de `../*.svg` (oficiais, domínio público; ver `../README.md`). Não editar à mão.

- **Motor:** o Chrome renderiza cada SVG a 8x o tamanho final; o script reduz por média de área (cobertura exata de cada pixel, sem halo) e o sharp só codifica.
- **WebP lossless** em 50, 100, 160, 200 px de largura (`{uf}-{largura}.webp`). Cobrem caixas de 24 a 64 px CSS em 1x, 2x e 3x. Lossless porque o lossy 4:2:0 deixa franja de crominância nas bordas vermelho/verde (erro de até 180/255) e nem fica menor.
- **PNG de 160 px** por UF (`{uf}-160.png`), para embutir no card.
- **Proporção:** cada raster tem a proporção da própria bandeira; a altura é a largura dividida pela razão do viewBox, arredondada. O SVG se encaixa inteiro, sem esticar nem recortar. A caixa 10:7 e o `object-fit: contain` ficam a cargo de `Bandeira.astro`.
- **Sem alfa:** a bandeira é um retângulo opaco; o canal alfa foi descartado porque o rasterizador deixa alfa < 1 nas costuras entre formas e em meio pixel de sobra na borda, o que sobre fundo escuro vira uma linha fina. As cores não mudam.
- **Conferência:** cada raster é comparado com o SVG renderizado direto no tamanho final, nos pixels que o Chrome marca como opacos. Pior caso: erro médio de 7.03/255 por canal (ap 50px) e até 7.89% dos pixels a mais de 40/255 de distância. A diferença vem de o Chrome alinhar à grade de pixels as linhas retilíneas de ~1 px (Amapá: 0/255 onde a cobertura real é 76/255) e de vazar a base nas junções entre formas coladas; o raster usa a cobertura exata. O WebP decodificado é idêntico, pixel a pixel, ao raster.

## Peso

| UF | WebP 50 | WebP 100 | WebP 160 | WebP 200 | PNG 160 |
|---|---:|---:|---:|---:|---:|
| ac | 0.3 KB | 0.5 KB | 0.8 KB | 0.9 KB | 1.3 KB |
| al | 0.7 KB | 1.9 KB | 3.5 KB | 4.6 KB | 5.0 KB |
| am | 0.4 KB | 0.8 KB | 1.2 KB | 2.2 KB | 3.1 KB |
| ap | 0.4 KB | 0.6 KB | 0.8 KB | 0.9 KB | 1.5 KB |
| ba | 0.3 KB | 0.4 KB | 0.5 KB | 0.5 KB | 1.0 KB |
| br | 0.6 KB | 1.3 KB | 2.3 KB | 3.0 KB | 5.1 KB |
| ce | 0.7 KB | 1.7 KB | 3.1 KB | 4.2 KB | 5.7 KB |
| df | 0.3 KB | 0.5 KB | 0.6 KB | 0.7 KB | 1.4 KB |
| es | 0.2 KB | 0.4 KB | 0.8 KB | 1.5 KB | 2.0 KB |
| go | 0.4 KB | 0.6 KB | 0.8 KB | 1.0 KB | 2.0 KB |
| ma | 0.3 KB | 0.5 KB | 0.6 KB | 0.7 KB | 1.3 KB |
| mg | 0.4 KB | 0.7 KB | 1.4 KB | 1.8 KB | 3.3 KB |
| ms | 0.3 KB | 0.5 KB | 0.6 KB | 0.7 KB | 1.2 KB |
| mt | 0.6 KB | 1.0 KB | 1.5 KB | 2.1 KB | 4.7 KB |
| pa | 0.5 KB | 0.9 KB | 1.7 KB | 2.1 KB | 3.3 KB |
| pb | 0.2 KB | 0.3 KB | 0.4 KB | 0.5 KB | 1.2 KB |
| pe | 0.8 KB | 1.6 KB | 2.7 KB | 3.1 KB | 4.5 KB |
| pi | 0.4 KB | 0.6 KB | 0.8 KB | 1.1 KB | 1.8 KB |
| pr | 1.3 KB | 3.2 KB | 6.0 KB | 7.9 KB | 8.7 KB |
| rj | 1.0 KB | 2.9 KB | 5.9 KB | 8.2 KB | 7.8 KB |
| rn | 0.9 KB | 2.3 KB | 4.7 KB | 6.5 KB | 5.5 KB |
| ro | 0.5 KB | 0.7 KB | 1.0 KB | 1.2 KB | 1.9 KB |
| rr | 0.5 KB | 0.8 KB | 1.2 KB | 1.4 KB | 2.1 KB |
| rs | 1.0 KB | 2.2 KB | 4.1 KB | 5.6 KB | 5.3 KB |
| sc | 1.0 KB | 3.0 KB | 6.2 KB | 8.8 KB | 7.8 KB |
| se | 0.4 KB | 0.4 KB | 0.8 KB | 0.7 KB | 1.9 KB |
| sp | 0.6 KB | 1.0 KB | 1.7 KB | 2.1 KB | 2.7 KB |
| to | 0.5 KB | 0.9 KB | 1.5 KB | 1.9 KB | 2.9 KB |

Total: WebP 50 px 15.4 KB, WebP 100 px 32.2 KB, WebP 160 px 57.2 KB, WebP 200 px 76.0 KB, PNG 160 px 95.9 KB; tudo junto 276.7 KB (os 28 SVGs pesam 852.1 KB). A página baixa só um raster por bandeira.
