// Gera os rasters das 28 bandeiras a partir dos SVGs oficiais já otimizados (src/assets/flags/{uf}.svg).
// O Chrome (o motor do visitante) renderiza cada SVG em SUPERAMOSTRAGEM x o tamanho final; o script reduz por média de
// área (cobertura exata de cada pixel, sem halo de Lanczos) e o sharp só codifica:
//   - WebP em LARGURAS_WEBP, lossless: bandeira é cor chapada, e o lossy 4:2:0 deixa franja de crominância nas bordas
//     vermelho/verde (erro de até 180/255 medido) sem nem ficar menor;
//   - PNG de LARGURA_PNG px por UF, para embutir no card (o SVG do card vira PNG no navegador e no servidor).
// Cada bandeira mantém a própria proporção (nunca 10:7 forçado): a altura é arredondada e o SVG se encaixa inteiro
// (meet), sem esticar nem recortar (Lei 5.700/1971). Larguras múltiplas de 10 dão altura inteira em 10:7.
// O canal alfa é descartado: a bandeira é um retângulo opaco, e o rasterizador deixa alfa < 1 só onde duas formas se
// encostam em pixel fracionário (costura) ou onde a altura arredondada sobra meio pixel; sobre fundo escuro isso
// viraria uma linha fina. A cor continua a mesma (o PNG do Chrome guarda cor sem pré-multiplicar), e na média de área
// o erro de cor da costura cai a 1/SUPERAMOSTRAGEM.
// Por que média de área e não o render direto: o Chrome alinha à grade de pixels as bordas retilíneas finas (linha de
// 1,7 px sai 0/255, a cobertura real é 76/255) e deixa vazar a base nas junções entre formas coladas. A média de área
// é a cobertura exata e reduz bem quando o navegador escala o raster de novo (50 -> 40 px etc.).
// Cada raster é conferido contra o SVG renderizado direto no tamanho final: só pode diferir por reamostragem.
// Rodar só para refazer: npm run flags:raster
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import sharp from 'sharp';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../src/assets/flags');
const destino = join(raiz, 'raster');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Cobrem caixas de 24 a 64 px CSS em 1x, 2x e 3x (24 px 1x = 50; 64 px 3x = 192 -> 200).
const LARGURAS_WEBP = [50, 100, 160, 200];
const LARGURA_PNG = 160;
const SUPERAMOSTRAGEM = 8;

// Conferência contra o render direto do Chrome, só nos pixels que ele mesmo marca como opacos (alfa >= 250): erro
// médio por canal (0-255) e fração de pixels com algum canal a mais de 40 de distância. Pior caso medido nas 28
// bandeiras: 7,0 e 7,9% (Amapá a 50 px, linhas de ~1 px); o limite é uma rede contra render quebrado ou desalinhado.
const LIMITE_ERRO_MEDIO = 10;
const LIMITE_FRACAO_DIFERENTE = 0.15;
// Do render em SUPERAMOSTRAGEM x: fração mínima de pixels opacos, para pegar SVG que não renderizou (costura e
// sobra de borda ficam bem abaixo de 2%).
const COBERTURA_MINIMA = 0.98;

async function renderizar(pagina: Page, svg: string, largura: number, altura: number): Promise<Buffer> {
  await pagina.setViewportSize({ width: largura, height: altura });
  const origem = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await pagina.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block;width:${largura}px;height:${altura}px}</style><img id="f" src="${origem}">`,
  );
  await pagina.evaluate(async () => {
    const img = document.getElementById('f');
    if (!(img instanceof HTMLImageElement)) throw new Error('img não encontrada');
    await img.decode();
  });
  const png = await pagina.screenshot({ omitBackground: true, type: 'png' });
  return sharp(png).ensureAlpha().raw().toBuffer();
}

/** Média de área de blocos fator x fator, ignorando o alfa; RGBA grande -> RGB final. */
function reduzir(rgba: Buffer, largura: number, altura: number, fator: number): Buffer {
  const saida = Buffer.alloc(largura * altura * 3);
  const larguraGrande = largura * fator;
  const area = fator * fator;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      for (let canal = 0; canal < 3; canal++) {
        let soma = 0;
        for (let j = 0; j < fator; j++) {
          for (let i = 0; i < fator; i++) soma += rgba[(((y * fator + j) * larguraGrande) + x * fator + i) * 4 + canal];
        }
        saida[(y * largura + x) * 3 + canal] = Math.round(soma / area);
      }
    }
  }
  return saida;
}

function comparar(rgb: Buffer, direto: Buffer): { erroMedio: number; fracaoDiferente: number } {
  let soma = 0;
  let diferentes = 0;
  let comparados = 0;
  for (let p = 0; p < rgb.length / 3; p++) {
    if (direto[p * 4 + 3] < 250) continue;
    const d = [0, 1, 2].map((c) => Math.abs(rgb[p * 3 + c] - direto[p * 4 + c]));
    soma += d[0] + d[1] + d[2];
    if (Math.max(...d) > 40) diferentes++;
    comparados++;
  }
  return { erroMedio: soma / (comparados * 3), fracaoDiferente: diferentes / comparados };
}

function coberturaOpaca(rgba: Buffer): number {
  let opacos = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= 250) opacos++;
  return opacos / (rgba.length / 4);
}

const razaoDe = (svg: string): number => {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!viewBox) throw new Error('SVG sem viewBox');
  const [, , largura, altura] = viewBox.trim().split(/[\s,]+/).map(Number);
  return largura / altura;
};

const kb = (bytes: number) => (bytes / 1024).toFixed(1);

const navegador = await chromium.launch({ executablePath: CHROME });
const pagina = await navegador.newPage();

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

const ufs = (await readdir(raiz)).filter((f) => f.endsWith('.svg')).map((f) => f.replace('.svg', ''));
const pesos: Array<{ uf: string; webp: number[]; png: number }> = [];
let piorErroMedio = 0;
let piorFracao = 0;
let piorCaso = '';
let totalSvg = 0;

for (const uf of ufs) {
  const arquivoSvg = await readFile(join(raiz, `${uf}.svg`), 'utf8');
  totalSvg += Buffer.byteLength(arquivoSvg);
  const svg = arquivoSvg.replace(/^\uFEFF/, '');
  const razao = razaoDe(svg);
  const peso = { uf, webp: [] as number[], png: 0 };

  for (const largura of [...new Set([...LARGURAS_WEBP, LARGURA_PNG])]) {
    const altura = Math.round(largura / razao);
    const grande = await renderizar(pagina, svg, largura * SUPERAMOSTRAGEM, altura * SUPERAMOSTRAGEM);
    const cobertura = coberturaOpaca(grande);
    if (cobertura < COBERTURA_MINIMA) throw new Error(`${uf} ${largura}px: só ${(cobertura * 100).toFixed(1)}% opaco em ${SUPERAMOSTRAGEM}x; o SVG não renderizou inteiro`);

    const rgb = reduzir(grande, largura, altura, SUPERAMOSTRAGEM);
    const reamostragem = comparar(rgb, await renderizar(pagina, svg, largura, altura));
    if (reamostragem.erroMedio > LIMITE_ERRO_MEDIO || reamostragem.fracaoDiferente > LIMITE_FRACAO_DIFERENTE) {
      throw new Error(`${uf} ${largura}px: difere do SVG além de reamostragem (erro médio ${reamostragem.erroMedio.toFixed(2)}, ${(reamostragem.fracaoDiferente * 100).toFixed(2)}% dos pixels)`);
    }
    if (reamostragem.erroMedio > piorErroMedio) {
      piorErroMedio = reamostragem.erroMedio;
      piorCaso = `${uf} ${largura}px`;
    }
    piorFracao = Math.max(piorFracao, reamostragem.fracaoDiferente);

    const imagem = sharp(rgb, { raw: { width: largura, height: altura, channels: 3 } });
    if (LARGURAS_WEBP.includes(largura)) {
      const webp = await imagem.clone().webp({ lossless: true, effort: 6 }).toBuffer();
      const decodificado = await sharp(webp).removeAlpha().raw().toBuffer();
      if (!decodificado.equals(rgb)) throw new Error(`${uf} ${largura}px: o WebP lossless não reproduziu o raster pixel a pixel`);
      await writeFile(join(destino, `${uf}-${largura}.webp`), webp);
      peso.webp.push(webp.length);
    }
    if (largura === LARGURA_PNG) {
      const png = await imagem.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
      await writeFile(join(destino, `${uf}-${largura}.png`), png);
      peso.png = png.length;
    }
  }
  pesos.push(peso);
  console.log(`${uf}  webp ${peso.webp.map((p) => `${kb(p)}K`).join(' ')}  png ${kb(peso.png)}K  razão ${razao.toFixed(3)}`);
}
await navegador.close();

const totalWebp = LARGURAS_WEBP.map((_, i) => pesos.reduce((s, p) => s + p.webp[i], 0));
const totalPng = pesos.reduce((s, p) => s + p.png, 0);
const totalGeral = totalWebp.reduce((s, p) => s + p, 0) + totalPng;
console.log(`total por largura: ${LARGURAS_WEBP.map((l, i) => `${l}px ${kb(totalWebp[i])}K`).join(', ')}; png ${LARGURA_PNG}px ${kb(totalPng)}K; geral ${kb(totalGeral)}K (SVGs: ${kb(totalSvg)}K)`);
console.log(`pior reamostragem: erro médio ${piorErroMedio.toFixed(2)}/255 (${piorCaso}), até ${(piorFracao * 100).toFixed(2)}% dos pixels a mais de 40`);

const cabecalho = `| UF | ${LARGURAS_WEBP.map((l) => `WebP ${l}`).join(' | ')} | PNG ${LARGURA_PNG} |`;
const separador = `|---|${[...LARGURAS_WEBP, LARGURA_PNG].map(() => '---:').join('|')}|`;
const linhas = pesos.map((p) => `| ${p.uf} | ${p.webp.map((w) => `${kb(w)} KB`).join(' | ')} | ${kb(p.png)} KB |`);
await writeFile(
  join(destino, 'README.md'),
  `# Rasters das bandeiras

Gerados por \`npm run flags:raster\` a partir dos SVGs de \`../*.svg\` (oficiais, domínio público; ver \`../README.md\`). Não editar à mão.

- **Motor:** o Chrome renderiza cada SVG a ${SUPERAMOSTRAGEM}x o tamanho final; o script reduz por média de área (cobertura exata de cada pixel, sem halo) e o sharp só codifica.
- **WebP lossless** em ${LARGURAS_WEBP.join(', ')} px de largura (\`{uf}-{largura}.webp\`). Cobrem caixas de 24 a 64 px CSS em 1x, 2x e 3x. Lossless porque o lossy 4:2:0 deixa franja de crominância nas bordas vermelho/verde (erro de até 180/255) e nem fica menor.
- **PNG de ${LARGURA_PNG} px** por UF (\`{uf}-${LARGURA_PNG}.png\`), para embutir no card.
- **Proporção:** cada raster tem a proporção da própria bandeira; a altura é a largura dividida pela razão do viewBox, arredondada. O SVG se encaixa inteiro, sem esticar nem recortar. A caixa 10:7 e o \`object-fit: contain\` ficam a cargo de \`Bandeira.astro\`.
- **Sem alfa:** a bandeira é um retângulo opaco; o canal alfa foi descartado porque o rasterizador deixa alfa < 1 nas costuras entre formas e em meio pixel de sobra na borda, o que sobre fundo escuro vira uma linha fina. As cores não mudam.
- **Conferência:** cada raster é comparado com o SVG renderizado direto no tamanho final, nos pixels que o Chrome marca como opacos. Pior caso: erro médio de ${piorErroMedio.toFixed(2)}/255 por canal (${piorCaso}) e até ${(piorFracao * 100).toFixed(2)}% dos pixels a mais de 40/255 de distância. A diferença vem de o Chrome alinhar à grade de pixels as linhas retilíneas de ~1 px (Amapá: 0/255 onde a cobertura real é 76/255) e de vazar a base nas junções entre formas coladas; o raster usa a cobertura exata. O WebP decodificado é idêntico, pixel a pixel, ao raster.

## Peso

${cabecalho}
${separador}
${linhas.join('\n')}

Total: ${LARGURAS_WEBP.map((l, i) => `WebP ${l} px ${kb(totalWebp[i])} KB`).join(', ')}, PNG ${LARGURA_PNG} px ${kb(totalPng)} KB; tudo junto ${kb(totalGeral)} KB (os 28 SVGs pesam ${kb(totalSvg)} KB). A página baixa só um raster por bandeira.
`,
);
