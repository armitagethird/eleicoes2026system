import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ALTURA_FOTO, fotoCandidato } from './fotos.ts';

const PASTA = join(import.meta.dirname, '../assets/candidatos');
const LIMITE_2X_BYTES = 8 * 1024;

describe('fotoCandidato', () => {
  it('13 e 22 têm foto, com alt "Foto oficial de {nome} (TSE)" e srcset 1x e 2x', () => {
    const lula = fotoCandidato(13);
    const flavio = fotoCandidato(22);
    expect(lula?.alt).toBe('Foto oficial de Lula (TSE)');
    expect(flavio?.alt).toBe('Foto oficial de Flávio Bolsonaro (TSE)');
    expect(lula?.src).toMatch(/13-56\S*\.webp/);
    expect(lula?.srcset).toMatch(/13-56\S*\.webp\S* 1x, \S*13-112\S*\.webp\S* 2x$/);
    expect(flavio?.srcset).toMatch(/22-56\S*\.webp\S* 1x, \S*22-112\S*\.webp\S* 2x$/);
  });

  it('os dois saem com a mesma caixa (mesmo width e height)', () => {
    const [lula, flavio] = [fotoCandidato(13), fotoCandidato(22)];
    expect([lula?.width, lula?.height]).toEqual([45, ALTURA_FOTO]);
    expect([flavio?.width, flavio?.height]).toEqual([lula?.width, lula?.height]);
  });

  it('número sem foto e altura sem arquivo devolvem null, sem lançar', () => {
    expect(fotoCandidato(0)).toBeNull();
    expect(fotoCandidato(30)).toBeNull();
    expect(fotoCandidato(13, 999)).toBeNull();
  });
});

describe('arquivos de src/assets/candidatos', () => {
  it('13 e 22 têm exatamente os mesmos arquivos', () => {
    const tamanhos = (n: number) =>
      readdirSync(PASTA)
        .filter((f) => f.startsWith(`${n}-`) && f.endsWith('.webp'))
        .map((f) => f.slice(`${n}-`.length));
    expect(tamanhos(13).sort()).toEqual(tamanhos(22).sort());
    expect(tamanhos(13)).toHaveLength(2);
  });

  it.each([13, 22])('%i: 1x e 2x têm a dimensão que fotoCandidato declara (zero CLS) e o 2x pesa até 8 KB', async (n) => {
    const foto = fotoCandidato(n);
    expect(foto).not.toBeNull();
    for (const densidade of [1, 2]) {
      const { width, height } = await sharp(join(PASTA, `${n}-${ALTURA_FOTO * densidade}.webp`)).metadata();
      expect([width, height]).toEqual([(foto?.width ?? 0) * densidade, (foto?.height ?? 0) * densidade]);
    }
    expect(statSync(join(PASTA, `${n}-${ALTURA_FOTO * 2}.webp`)).size).toBeLessThanOrEqual(LIMITE_2X_BYTES);
  });
});
