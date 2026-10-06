// Gera os subsets latinos woff2 de public/fonts/ a partir dos TTFs completos em src/assets/fonts-src/.
// Rodar só quando mudar a fonte ou o intervalo de glifos: npm run fonts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src/assets/fonts-src');
const out = join(root, 'public/fonts');

// Mesmo intervalo "latin" do Google Fonts (cobre todo o português: Latin-1, aspas, travessão, ×, −).
const latin: Array<[number, number]> = [
  [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6, 0x02c6],
  [0x02da, 0x02da], [0x02dc, 0x02dc], [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122],
  [0x2191, 0x2191], [0x2193, 0x2193], [0x2212, 0x2212], [0x2215, 0x2215],
];
const text = latin
  .flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)))
  .join('');

// tnum é obrigatório (números que atualizam não podem pular); o resto é o mínimo para texto corrido.
const keepFeatures = ['tnum', 'lnum', 'kern', 'liga', 'ccmp', 'locl', 'mark', 'mkmk'];

// Archivo é a única família (design/DIRECTION.md). Dois pesos, cada um num arquivo com o eixo wght fixado:
// display = 900 com o eixo de largura vivo (62-125), que ajusta o nome da cidade à largura como um letreiro de destino;
// texto = 500 em largura normal.
type Eixo = number | { min: number; max: number };
type Job = { file: string; dest: string; variationAxes: Record<string, Eixo> };
const jobs: Job[] = [
  { file: 'archivo.ttf', dest: 'archivo/archivo-display.woff2', variationAxes: { wght: 900, wdth: { min: 62, max: 125 } } },
  { file: 'archivo.ttf', dest: 'archivo/archivo-text.woff2', variationAxes: { wght: 500, wdth: 100 } },
];

for (const { file, dest, variationAxes } of jobs) {
  const buffer = await subsetFont(await readFile(join(src, file)), text, {
    targetFormat: 'woff2',
    keepFeatures,
    variationAxes,
  });
  const target = join(out, dest);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  console.log(`${dest}  ${(buffer.length / 1024).toFixed(1)} KB`);
}
