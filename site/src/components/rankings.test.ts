import { describe, expect, it } from 'vitest';
import { estiloNome } from './rankings.ts';

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
