import { describe, expect, it } from 'vitest';
import { ajustarDestino, larguraTexto } from './destino.ts';

const OPCOES = { largura: 1104, tamMax: 150, tamMin: 96 };

// Largura real (px a 1000 px de fonte) medida no Chrome com a Archivo 900, por wdth: 62, 80, 100, 118, 125.
const WDTH_MEDIDOS = [62, 80, 100, 118, 125];
const MEDIDOS_NO_CHROME: Array<[string, number[]]> = [
  ['NATAL', [2365, 2957, 3618, 4109, 4298]],
  ["SANTA BÁRBARA D'OESTE", [9410, 11731, 14316, 16563, 17436]],
  ['VILA BELA DA SANTÍSSIMA TRINDADE', [13572, 16855, 20518, 23659, 24878]],
  ['SÃO JOÃO DA BOA VISTA', [8847, 10951, 13298, 15405, 16223]],
  ['PARAÍSO DAS ÁGUAS', [7593, 9419, 11457, 13268, 13971]],
  ['TRÊS PASSOS', [4971, 6203, 7573, 8784, 9255]],
  ['RIO DE JANEIRO', [5806, 7230, 8820, 10138, 10650]],
  ['JAÚ', [1476, 1848, 2263, 2568, 2687]],
];

describe('larguraTexto', () => {
  it.each(MEDIDOS_NO_CHROME)('%s: modelo dentro de 1,5% do Chrome em todo wdth', (texto, medidos) => {
    WDTH_MEDIDOS.forEach((wdth, i) => {
      const erro = Math.abs(larguraTexto(texto, wdth, 1000) / medidos[i] - 1);
      expect(erro, `${texto} em wdth ${wdth}`).toBeLessThan(0.015);
    });
  });

  it('cresce com o wdth e com o tamanho, e conta o tracking', () => {
    expect(larguraTexto('NATAL', 125, 100)).toBeGreaterThan(larguraTexto('NATAL', 62, 100));
    expect(larguraTexto('NATAL', 100, 200)).toBeCloseTo(2 * larguraTexto('NATAL', 100, 100), 6);
    expect(larguraTexto('NATAL', 100, 100, 0.05)).toBeCloseTo(larguraTexto('NATAL', 100, 100) + 25, 6);
  });
});

describe('ajustarDestino', () => {
  it('nome curto fica em wdth 125 no tamanho máximo, sem forçar a largura', () => {
    const { linhas } = ajustarDestino('NATAL', OPCOES);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ texto: 'NATAL', wdth: 125, tamanho: 150 });
    expect(linhas[0].largura).toBeLessThan(OPCOES.largura);
  });

  it('nome médio varia o wdth no tamanho máximo para encostar nas duas margens', () => {
    const { linhas } = ajustarDestino('RIO DE JANEIRO', OPCOES);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].tamanho).toBe(150);
    expect(linhas[0].wdth).toBeGreaterThan(62);
    expect(linhas[0].wdth).toBeLessThan(125);
    expect(linhas[0].largura).toBeLessThanOrEqual(OPCOES.largura);
    expect(linhas[0].largura).toBeGreaterThan(OPCOES.largura * 0.97);
  });

  it('quando nem o wdth 62 basta, reduz o tamanho até caber, sem passar do mínimo', () => {
    const { linhas } = ajustarDestino('SÃO JOÃO DA BOA VISTA', OPCOES);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].wdth).toBe(62);
    expect(linhas[0].tamanho).toBeLessThan(150);
    expect(linhas[0].tamanho).toBeGreaterThanOrEqual(OPCOES.tamMin);
    expect(linhas[0].largura).toBeLessThanOrEqual(OPCOES.largura);
  });

  it('abaixo do tamanho mínimo quebra em 2 linhas, no espaço mais equilibrado', () => {
    const { linhas } = ajustarDestino('VILA BELA DA SANTÍSSIMA TRINDADE', OPCOES);
    expect(linhas.map((l) => l.texto)).toEqual(['VILA BELA DA', 'SANTÍSSIMA TRINDADE']);
    expect(new Set(linhas.map((l) => l.tamanho)).size).toBe(1);
    expect(linhas[0].tamanho).toBe(OPCOES.tamMin);
    for (const l of linhas) expect(l.largura).toBeLessThanOrEqual(OPCOES.largura);
  });

  it('com maxLinhas 1 nunca quebra e nunca passa da largura', () => {
    const { linhas } = ajustarDestino('VILA BELA DA SANTÍSSIMA TRINDADE', { ...OPCOES, maxLinhas: 1 });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].wdth).toBe(62);
    expect(linhas[0].tamanho).toBeLessThan(OPCOES.tamMin);
    expect(linhas[0].largura).toBeLessThanOrEqual(OPCOES.largura);
  });

  it('palavra única comprida que não cabe em tamMin encolhe em vez de estourar a largura', () => {
    const { linhas } = ajustarDestino('PNEUMOULTRAMICROSCOPICOSSILICOVULCANOCONIOTICOS', OPCOES);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].largura).toBeLessThanOrEqual(OPCOES.largura);
  });

  it('é determinística e não altera a entrada', () => {
    const texto = "SANTA BÁRBARA D'OESTE";
    expect(ajustarDestino(texto, OPCOES)).toEqual(ajustarDestino(texto, OPCOES));
    expect(texto).toBe("SANTA BÁRBARA D'OESTE");
  });

  it('largura útil já desconta a margem de segurança: nunca preenche mais de 100%', () => {
    for (const [texto] of MEDIDOS_NO_CHROME) {
      for (const l of ajustarDestino(texto, OPCOES).linhas) expect(l.largura).toBeLessThanOrEqual(OPCOES.largura / 1.005);
    }
  });

  it('texto vazio devolve uma linha vazia', () => {
    expect(ajustarDestino('', OPCOES).linhas).toEqual([{ texto: '', wdth: 125, tamanho: 150, largura: 0 }]);
  });
});
