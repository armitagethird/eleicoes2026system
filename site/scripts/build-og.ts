// Gera public/og/fallback.png, a imagem OG das páginas sem card próprio (home, UFs, rankings, 404): 1200x675, só tipografia.
// Nome, domínio e @ vêm de src/lib/site.ts e as cores de src/styles/tokens.css, então trocar um deles é rodar o script de novo.
// Tema Brasil: fundo de --bg, a faixa verde e amarela do topo (a de base.css e do card) e a marca do favicon. Sem vermelho nem azul
// (são cores dos candidatos, nunca da marca). Rodar: npm run og (precisa do Chrome, como card:previews).
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { FONTE_TSE, TURNO_CARD } from '../src/lib/copy.ts';
import { ALTURAS, ajustarDestino } from '../src/lib/destino.ts';
import { SITE_NAME, SITE_URL, X_HANDLE } from '../src/lib/site.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAIDA = join(root, 'public/og/fallback.png');

// Mesmas margens e área segura do card (design/DIRECTION.md): nada crítico acima de y 44 nem abaixo de y 631.
const X0 = 48;
const X1 = 1152;
// Frase do brief (seção 7), a mesma do <title> das cidades, sem o nome do lugar.
const FRASE = 'Resultado da sua cidade, comparado com 2022';

const tokens = await readFile(join(root, 'src/styles/tokens.css'), 'utf8');
const cor = (nome: string): string => {
  const hex = tokens.match(new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  if (!hex) throw new Error(`--${nome} não encontrado em src/styles/tokens.css`);
  return hex;
};
const [bg, ink, ink2, verde, amarelo] = ['bg', 'ink', 'ink-2', 'verde', 'amarelo'].map(cor);
// Faixa de 8 px, verde de 0 a 62% e amarela de 62 a 100%, em cortes retos: a mesma do card (components/Card.ts).
const FAIXA = `<rect width="744" height="8" fill="${verde}"/><rect x="744" width="456" height="8" fill="${amarelo}"/>`;

const maiusculas = (s: string): string => s.toLocaleUpperCase('pt-BR');
const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texto = (x: number, y: number, size: number, wdth: number, fill: string, conteudo: string, ancora = 'start'): string =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${ancora}" style="font-stretch:${wdth}%">${escapar(conteudo)}</text>`;

/** Linhas de destino de um texto: ajustadas a 1104 px, empilhadas a partir de `topo`. Devolve o SVG e onde terminou. */
function destino(conteudo: string, topo: number, tamMax: number, tamMin: number, fill: string): { svg: string; fim: number } {
  let y = topo;
  const svg = ajustarDestino(maiusculas(conteudo), { largura: X1 - X0, tamMax, tamMin }).linhas.map((l) => {
    y += l.tamanho * ALTURAS.cap;
    const linha = texto(X0, y, l.tamanho, l.wdth, fill, l.texto);
    y += l.tamanho * 0.28;
    return linha;
  });
  return { svg: svg.join(''), fim: y };
}

const nome = destino(SITE_NAME, 128, 230, 120, ink);
const frase = destino(FRASE, nome.fim + 56, 96, 84, ink);
// A marca é a do favicon (três barras divididas, verde e amarela), sem o fundo.
const marca = (await readFile(join(root, 'public/favicon.svg'), 'utf8')).match(/<path[^>]*\/>/g)?.join('') ?? '';
const meta = maiusculas(TURNO_CARD);
const dominio = maiusculas(`${new URL(SITE_URL).host} · ${X_HANDLE}`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
<style>@font-face{font-family:Archivo;font-weight:900;font-stretch:62% 125%;src:url(data:font/woff2;base64,${(await readFile(join(root, 'public/fonts/archivo/archivo-caps.woff2'))).toString('base64')}) format('woff2')}text{font-family:Archivo;font-weight:900;font-variant-numeric:tabular-nums}</style>
<rect width="1200" height="675" fill="${bg}"/>
${FAIXA}
${texto(X0, 70 + (30 * ALTURAS.cap) / 2, 30, 100, ink2, meta)}
<svg x="${X1 - 56}" y="44" width="56" height="56" viewBox="0 0 32 32">${marca}</svg>
<rect x="${X0}" y="${Math.round(nome.fim + 8)}" width="${X1 - X0}" height="4" fill="${ink}"/>
${nome.svg}${frase.svg}
${texto(X0, 626, 28, 100, ink2, dominio)}${texto(X1, 626, 28, 100, ink2, maiusculas(FONTE_TSE), 'end')}
</svg>`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-lcd-text'] });
try {
  const pagina = await browser.newPage({ viewport: { width: 1200, height: 675 } });
  await pagina.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block}</style>${svg}`);
  await pagina.evaluate(() => document.fonts.load('900 100px Archivo'));
  const bruto = await pagina.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 675 } });
  await mkdir(dirname(SAIDA), { recursive: true });
  // Paleta de 32 cores: só há cinco tintas e o serrilhado do texto; a diferença para o RGB cheio é de 2/255 por canal e o arquivo cai de 67 para 34 KB.
  const { size } = await sharp(bruto).png({ palette: true, colors: 32, dither: 0, effort: 10 }).toFile(SAIDA);
  console.log(`${SAIDA}  ${(size / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
