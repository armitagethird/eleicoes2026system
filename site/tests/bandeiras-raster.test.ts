import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const raiz = join(import.meta.dirname, '../src/assets/flags');
const raster = join(raiz, 'raster');

const ufs = (await readdir(raiz)).filter((f) => f.endsWith('.svg')).map((f) => f.replace('.svg', ''));
const arquivos = (await readdir(raster)).filter((f) => /\.(webp|png)$/.test(f));

const razaoDoSvg = async (uf: string): Promise<number> => {
  const viewBox = /viewBox="([^"]+)"/.exec(await readFile(join(raiz, `${uf}.svg`), 'utf8'))?.[1] ?? '';
  const [, , largura, altura] = viewBox.trim().split(/[\s,]+/).map(Number);
  return largura / altura;
};

describe('rasters das bandeiras (src/assets/flags/raster)', () => {
  it('são as 28 bandeiras, cada uma em 4 WebP e 1 PNG, sem arquivo sobrando', () => {
    expect(ufs).toHaveLength(28);
    const esperados = ufs.flatMap((uf) => [50, 100, 160, 200].map((l) => `${uf}-${l}.webp`).concat(`${uf}-160.png`));
    expect([...arquivos].sort()).toEqual(esperados.sort());
  });

  it.each(ufs)('%s: largura do nome = largura do arquivo e proporção = a do SVG (sem esticar)', async (uf) => {
    const razao = await razaoDoSvg(uf);
    for (const arquivo of arquivos.filter((a) => a.startsWith(`${uf}-`))) {
      const largura = Number(/-(\d+)\./.exec(arquivo)?.[1]);
      const { width, height, format } = await sharp(join(raster, arquivo)).metadata();
      expect(width, arquivo).toBe(largura);
      // A altura é a largura / razão arredondada: erro de no máximo meio pixel.
      expect(Math.abs((height ?? 0) - largura / razao), arquivo).toBeLessThanOrEqual(0.5);
      expect(format, arquivo).toBe(arquivo.endsWith('.png') ? 'png' : 'webp');
    }
  });

  it('a bandeira do Brasil é 10:7', async () => {
    expect(await razaoDoSvg('br')).toBeCloseTo(10 / 7, 3);
  });
});
