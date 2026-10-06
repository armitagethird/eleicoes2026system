import { describe, expect, it } from 'vitest';
import type { EntradaIndice } from '../lib/busca.ts';
import { CHAVES, estiloNome, indicePorSlug, itensDoRanking, parseRankings } from './rankings.ts';

const indice: EntradaIndice[] = [
  ['sao-luis-ma', 'São Luís', 'MA', -2.53, -44.3, 800000],
  ['manaus-am', 'Manaus', 'AM', -3.12, -60.02, 1500000],
  ['santa-barbara-doeste-sp', "Santa Bárbara d'Oeste", 'SP', -22.75, -47.41, 150000],
];

describe('parseRankings', () => {
  it('lê as quatro listas, na ordem recebida', () => {
    const lidos = parseRankings({ dividida: ['a', 'b'], unanime: ['c'], virada: [], capitais: ['d', 'e', 'f'] });
    expect(lidos).toEqual({ dividida: ['a', 'b'], unanime: ['c'], virada: [], capitais: ['d', 'e', 'f'] });
  });

  it('tolera lista ausente ou que não é lista: vira vazia, sem lançar', () => {
    expect(parseRankings({ dividida: ['a'] })).toEqual({ dividida: ['a'], unanime: [], virada: [], capitais: [] });
    expect(parseRankings({ dividida: 'a', unanime: null, virada: 3, capitais: {} })).toEqual({
      dividida: [],
      unanime: [],
      virada: [],
      capitais: [],
    });
  });

  it('descarta o que não é slug e ignora chave desconhecida', () => {
    const lidos = parseRankings({ dividida: ['a', 7, null, '', 'b'], extra: ['x'] });
    expect(lidos.dividida).toEqual(['a', 'b']);
    expect(lidos).not.toHaveProperty('extra');
  });

  it('corpo que não é objeto vira quatro listas vazias', () => {
    for (const bruto of [null, undefined, 'x', 42, []]) {
      expect(parseRankings(bruto)).toEqual({ dividida: [], unanime: [], virada: [], capitais: [] });
    }
  });

  it('as chaves seguem a ordem das listas na página', () => {
    expect(CHAVES).toEqual(['dividida', 'unanime', 'virada', 'capitais']);
  });
});

describe('itensDoRanking', () => {
  const nomes = indicePorSlug(indice);

  it('liga cada slug ao nome e à UF, mantendo a ordem e numerando a partir de 1', () => {
    expect(itensDoRanking(['manaus-am', 'sao-luis-ma'], nomes)).toEqual([
      { slug: 'manaus-am', nome: 'Manaus', uf: 'AM', posicao: 1 },
      { slug: 'sao-luis-ma', nome: 'São Luís', uf: 'MA', posicao: 2 },
    ]);
  });

  it('slug fora do índice some, e quem vem depois mantém a posição da lista', () => {
    const itens = itensDoRanking(['manaus-am', 'nao-existe-xx', 'sao-luis-ma'], nomes);
    expect(itens.map((i) => [i.slug, i.posicao])).toEqual([
      ['manaus-am', 1],
      ['sao-luis-ma', 3],
    ]);
  });

  it('lista vazia dá lista vazia', () => {
    expect(itensDoRanking([], nomes)).toEqual([]);
  });
});

describe('estiloNome', () => {
  const valor = (estilo: string, propriedade: string): string => estilo.match(new RegExp(`${propriedade}:([^;]+)`))?.[1] ?? '';

  it('nome curto fica no tamanho máximo, na largura máxima da fonte', () => {
    const estilo = estiloNome('Una', 28);
    expect(valor(estilo, 'font-stretch')).toBe('125%');
    expect(valor(estilo, 'font-size')).toMatch(/^min\(28px,/);
  });

  it('nome longo comprime pelo eixo wdth, nunca pelo glifo, e nunca passa do tamanho máximo', () => {
    const estilo = estiloNome('Vila Bela da Santíssima Trindade', 28);
    const wdth = Number.parseFloat(valor(estilo, 'font-stretch'));
    expect(wdth).toBeGreaterThanOrEqual(62);
    expect(wdth).toBeLessThan(125);
    expect(valor(estilo, 'font-size')).toMatch(/^min\(28px,/);
    expect(estilo).not.toMatch(/scale|textLength/);
  });

  it('o tamanho em cqi acompanha a coluna: quanto mais comprido o nome, menor', () => {
    const cqi = (nome: string): number => Number.parseFloat(valor(estiloNome(nome, 28), 'font-size').split(',')[1]);
    expect(cqi('Vila Bela da Santíssima Trindade')).toBeLessThan(cqi('Una'));
  });
});
