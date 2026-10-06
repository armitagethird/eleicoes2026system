import { describe, expect, it } from 'vitest';
import { slugMunicipio } from './slug.ts';

describe('slugMunicipio', () => {
  it.each([
    ['São Luís', 'MA', 'sao-luis-ma'],
    ['Santa Bárbara d\'Oeste', 'SP', 'santa-barbara-doeste-sp'],
    ['Santa Bárbara d’Oeste', 'SP', 'santa-barbara-doeste-sp'],
    ['Ji-Paraná', 'RO', 'ji-parana-ro'],
    ['Vila Bela da Santíssima Trindade', 'MT', 'vila-bela-da-santissima-trindade-mt'],
    ['Brasília', 'DF', 'brasilia-df'],
  ])('%s (%s) -> %s', (nome, uf, esperado) => {
    expect(slugMunicipio(nome, uf)).toBe(esperado);
  });
});
