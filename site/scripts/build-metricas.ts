// Mede no Chrome o avanço de cada caractere latino da Archivo 900 (e o kerning entre maiúsculas) em font-stretch 62, 75, 87.5,
// 100, 112.5 e 125 e grava src/lib/metricas-archivo.json, a tabela que lib/destino.ts usa para ajustar texto à largura sem DOM.
// Os seis pontos servem para provar que a fonte é linear entre os mestres (62, 100, 125): só os mestres vão para o JSON.
// Rodar só quando mudar a fonte: npm run metricas
// Com --validar não grava nada: compara o modelo com strings reais medidas no Chrome (erro máximo tolerado: 1,5%).
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAIDA = join(root, 'src/lib/metricas-archivo.json');
const TAMANHO_MEDIDA = 1000;
const WDTH = [62, 75, 87.5, 100, 112.5, 125];
// Os mestres da fonte variável (62, 100 e 125). Entre eles a Archivo é linear, então só estes vão para o JSON.
const MESTRES = [0, 3, 5];

const faixa = (a: number, b: number): string =>
  Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)).join('');
// Latin-1 imprimível mais a pontuação tipográfica que aparece em nomes e rótulos.
const CARACTERES = faixa(0x20, 0x7e) + faixa(0xa0, 0xff) + '–—‘’“”…−';
// Kerning só entre maiúsculas e pontuação de nomes: o destino é sempre caixa-alta. Acentuadas kernam como a letra-base.
const COM_KERNING = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].concat([...` '’-.,()/`]);

async function abrirPagina(): Promise<{ page: Page; fechar: () => Promise<void> }> {
  const woff2 = await readFile(join(root, 'public/fonts/archivo/archivo-display.woff2'));
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><style>
    @font-face { font-family: M; font-weight: 900; font-stretch: 62% 125%; src: url(data:font/woff2;base64,${woff2.toString('base64')}) format('woff2'); }
    span { font: 900 ${TAMANHO_MEDIDA}px M; font-variant-numeric: tabular-nums; white-space: pre; position: absolute; }
  </style><span></span>`);
  await page.evaluate(() => document.fonts.load('900 1000px M'));
  return { page, fechar: () => browser.close() };
}

type Medida = { texto: string; wdth: number };

/** Largura real, em px a 1000 px de fonte, de cada texto no wdth pedido (com kerning, como o SVG do card renderiza). */
function medir(page: Page, itens: Medida[]): Promise<number[]> {
  return page.evaluate((lista) => {
    const span = document.querySelector('span') as HTMLSpanElement;
    return lista.map(({ texto, wdth }) => {
      span.style.fontStretch = `${wdth}%`;
      span.textContent = texto;
      return span.getBoundingClientRect().width;
    });
  }, itens);
}

/** Altura de maiúscula, topo de acento (Ã, Í...) e descida (Ç, vírgula, parênteses), em milésimos de em. */
function medirVertical(page: Page): Promise<{ cap: number; acento: number; desce: number }> {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    ctx.font = '900 1000px M';
    const extremo = (letras: string, lado: 'actualBoundingBoxAscent' | 'actualBoundingBoxDescent'): number =>
      Math.round(Math.max(...[...letras].map((c) => ctx.measureText(c)[lado])));
    return {
      cap: extremo('HEZ', 'actualBoundingBoxAscent'),
      acento: extremo('ÃÕÁÉÍÓÚÂÊÔÀÜ', 'actualBoundingBoxAscent'),
      desce: extremo('Ç,()/@', 'actualBoundingBoxDescent'),
    };
  });
}

/** Medidas de cada texto nos seis wdth, em milésimos de em. */
async function medirEmTodosOsWdth(page: Page, textos: string[]): Promise<number[][]> {
  const larguras = await medir(page, textos.flatMap((texto) => WDTH.map((wdth) => ({ texto, wdth }))));
  return textos.map((_, i) => larguras.slice(i * WDTH.length, (i + 1) * WDTH.length));
}

/** Guarda só os mestres, depois de conferir que os pontos intermediários medidos caem na reta entre eles (tolerância de 1 milésimo de em). */
function nosDosMestres(medidos: number[], rotulo: string): number[] {
  for (const [de, ate] of [[0, 3], [3, 5]]) {
    for (let i = de + 1; i < ate; i++) {
      const reta = medidos[de] + ((medidos[ate] - medidos[de]) * (WDTH[i] - WDTH[de])) / (WDTH[ate] - WDTH[de]);
      if (Math.abs(medidos[i] - reta) > 1) throw new Error(`${rotulo} não é linear entre os mestres da fonte (wdth ${WDTH[i]}): refaça a tabela com mais pontos.`);
    }
  }
  return MESTRES.map((i) => Math.round(medidos[i]));
}

async function gerar(page: Page): Promise<void> {
  const caracteres = [...CARACTERES];
  const avancos = await medirEmTodosOsWdth(page, caracteres);
  const m = avancos[caracteres.indexOf('M')];
  if (m[m.length - 1] <= m[0]) throw new Error('A fonte não respondeu a font-stretch: o woff2 não carregou.');
  const adv = Object.fromEntries(caracteres.map((c, i) => [c, nosDosMestres(avancos[i], c)]));

  const pares = COM_KERNING.flatMap((a) => COM_KERNING.map((b) => a + b));
  const juntos = await medirEmTodosOsWdth(page, pares);
  const kern: Record<string, number[]> = {};
  pares.forEach((par, i) => {
    const [a, b] = [...par];
    const k = juntos[i].map((v, w) => Math.round(v - avancos[caracteres.indexOf(a)][w] - avancos[caracteres.indexOf(b)][w]));
    if (k.some((v) => v !== 0)) kern[par] = nosDosMestres(k, par);
  });

  const tabela = JSON.stringify({ upm: TAMANHO_MEDIDA, wdth: MESTRES.map((i) => WDTH[i]), ...(await medirVertical(page)), adv, kern });
  await writeFile(SAIDA, tabela);
  console.log(`metricas-archivo.json  ${caracteres.length} caracteres, ${Object.keys(kern).length} pares de kerning, ${(tabela.length / 1024).toFixed(1)} KB`);
}

async function validar(page: Page): Promise<void> {
  const { ajustarDestino, larguraTexto } = await import('../src/lib/destino.ts');
  const municipios = JSON.parse(await readFile(join(root, 'src/data/municipios.json'), 'utf8')) as { nome: string }[];
  const longos = [
    "SANTA BÁRBARA D'OESTE", 'VILA BELA DA SANTÍSSIMA TRINDADE', 'SÃO JOÃO DA BOA VISTA', 'PARAÍSO DAS ÁGUAS',
    'TRÊS PASSOS', 'SÃO JOSÉ DOS CAMPOS', 'SANTO ANTÔNIO DO LESTE', 'CONCEIÇÃO DO MATO DENTRO', 'SÃO GONÇALO DO RIO ABAIXO',
    'PINDAMONHANGABA', 'ESPÍRITO SANTO DO PINHAL', 'BOM JESUS DO ARAGUAIA', 'SÃO MIGUEL DOS CAMPOS', 'FERNANDO DE NORONHA',
    'ALTO PARAÍSO DE GOIÁS', 'PRESIDENTE JUSCELINO KUBITSCHEK', 'SÃO LUÍS DO PARAITINGA', 'UNA', 'JAÚ', 'RIO DE JANEIRO',
  ];
  const textos = [...new Set([...municipios.map((m) => m.nome.toUpperCase()), ...longos])];
  const casos = textos.flatMap((texto) => [62, 80, 100, 125].map((wdth) => ({ texto, wdth })));
  const reais = await medir(page, casos);
  let piorModelo = 0;
  casos.forEach(({ texto, wdth }, i) => {
    const erro = Math.abs(larguraTexto(texto, wdth, TAMANHO_MEDIDA) / reais[i] - 1);
    if (erro > piorModelo) piorModelo = erro;
  });

  const ajuste = textos.map((texto) => ({ texto, r: ajustarDestino(texto, { largura: 1104, tamMax: 150, tamMin: 84 }) }));
  const finais = await page.evaluate(
    (lista) => {
      const span = document.querySelector('span') as HTMLSpanElement;
      return lista.map((linhas) =>
        linhas.map(({ texto, wdth, tamanho }) => {
          span.style.fontSize = `${tamanho}px`;
          span.style.fontStretch = `${wdth}%`;
          span.textContent = texto;
          return span.getBoundingClientRect().width;
        }),
      );
    },
    ajuste.map(({ r }) => r.linhas),
  );
  let estouro = 0;
  let piorPreenchimento = 1;
  ajuste.forEach(({ texto, r }, i) =>
    r.linhas.forEach((linha, j) => {
      const real = finais[i][j];
      if (real > 1104) estouro += 1;
      if (linha.wdth < 125 && real / 1104 < piorPreenchimento) piorPreenchimento = real / 1104;
      if (real > 1104) console.log(`ESTOURA ${texto}: ${real.toFixed(1)} px`);
    }),
  );
  const duasLinhas = ajuste.filter(({ r }) => r.linhas.length === 2).length;
  console.log(`${textos.length} textos x 4 wdth: erro máximo do modelo ${(piorModelo * 100).toFixed(2)}% (tolerado: 1,5%)`);
  console.log(`ajuste a 1104 px: ${estouro} estouros; pior preenchimento com wdth < 125: ${(piorPreenchimento * 100).toFixed(1)}%; ${duasLinhas} em 2 linhas`);
  if (piorModelo > 0.015 || estouro > 0) process.exitCode = 1;
}

const { page, fechar } = await abrirPagina();
try {
  await (process.argv.includes('--validar') ? validar(page) : gerar(page));
} finally {
  await fechar();
}
