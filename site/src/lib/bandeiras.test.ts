import { describe, expect, it } from 'vitest';
import { UFS } from './contratos.ts';
import { altBandeira, rasterBandeira, urlBandeiraPng } from './bandeiras.ts';

const SIGLAS = [...UFS.map((uf) => uf.toLowerCase()), 'br'];

/** [largura do arquivo, densidade] de cada candidato do srcset. */
const candidatos = (srcset: string): Array<[number, number]> =>
  srcset.split(', ').map((parte) => {
    const [url, densidade] = parte.split(' ');
    return [Number(/-(\d+)[^/?]*\.webp/.exec(url)?.[1]), Number.parseInt(densidade, 10)];
  });

describe('urlBandeiraPng', () => {
  it.each(SIGLAS)('%s tem o PNG de 160 px', (uf) => {
    expect(urlBandeiraPng(uf)).toMatch(new RegExp(`/${uf}-160[^/?]*\\.png`));
  });

  it('aceita a sigla em maiúsculas (o contrato usa "MA")', () => {
    expect(urlBandeiraPng('MA')).toBe(urlBandeiraPng('ma'));
    expect(urlBandeiraPng('BR')).toBe(urlBandeiraPng('br'));
  });

  it('sigla desconhecida falha com a sigla no erro, em vez de devolver undefined', () => {
    expect(() => urlBandeiraPng('xx')).toThrow(/xx/);
  });
});

describe('rasterBandeira', () => {
  it('escolhe, para cada densidade, o menor raster que cobre largura x densidade', () => {
    expect(candidatos(rasterBandeira('ma', 40).srcset)).toEqual([[50, 1], [100, 2], [160, 3]]);
    expect(candidatos(rasterBandeira('ma', 48).srcset)).toEqual([[50, 1], [100, 2], [160, 3]]);
    expect(candidatos(rasterBandeira('ma', 64).srcset)).toEqual([[100, 1], [160, 2], [200, 3]]);
    expect(candidatos(rasterBandeira('ma', 24).srcset)).toEqual([[50, 1], [50, 2], [100, 3]]);
  });

  it('acima do maior raster usa o maior (não inventa arquivo)', () => {
    expect(candidatos(rasterBandeira('rj', 200).srcset)).toEqual([[200, 1], [200, 2], [200, 3]]);
  });

  it('src é o candidato de 1x', () => {
    const { src, srcset } = rasterBandeira('br', 40);
    expect(srcset.startsWith(`${src} 1x`)).toBe(true);
  });

  it.each(SIGLAS)('%s tem raster nas quatro larguras', (uf) => {
    const larguras = new Set(candidatos(rasterBandeira(uf, 24).srcset).concat(candidatos(rasterBandeira(uf, 64).srcset)).map(([largura]) => largura));
    expect([...larguras].sort((a, b) => a - b)).toEqual([50, 100, 160, 200]);
  });

  it('sigla desconhecida falha com a sigla no erro', () => {
    expect(() => rasterBandeira('xx', 40)).toThrow(/xx/);
  });
});

describe('altBandeira', () => {
  it.each([
    ['br', 'Bandeira do Brasil'],
    ['ac', 'Bandeira do Acre'],
    ['ba', 'Bandeira da Bahia'],
    ['al', 'Bandeira de Alagoas'],
    ['df', 'Bandeira do Distrito Federal'],
    ['rj', 'Bandeira do Rio de Janeiro'],
    ['sp', 'Bandeira de São Paulo'],
    ['pb', 'Bandeira da Paraíba'],
  ] as const)('%s -> %s', (uf, esperado) => {
    expect(altBandeira(uf)).toBe(esperado);
  });
});
