import { describe, expect, it } from 'vitest';
import { celulasQueMudam } from './flap.ts';

describe('celulasQueMudam', () => {
  it('texto igual não vira nada', () => {
    expect(celulasQueMudam('18', '18')).toEqual([]);
    expect(celulasQueMudam('49,0%', '49,0%')).toEqual([]);
  });

  it('vira só o algarismo que mudou', () => {
    expect(celulasQueMudam('18', '17')).toEqual([1]);
    expect(celulasQueMudam('49,0%', '49,3%')).toEqual([3]);
  });

  it('ordena da direita para a esquerda', () => {
    expect(celulasQueMudam('09', '10')).toEqual([1, 0]);
    expect(celulasQueMudam('--', '18')).toEqual([1, 0]);
  });

  it('alinha pela direita quando o número ganha um algarismo (índices do texto novo)', () => {
    expect(celulasQueMudam('9,9%', '10,0%')).toEqual([3, 1, 0]);
  });

  it('alinha pela direita quando o número perde um algarismo', () => {
    expect(celulasQueMudam('10,0%', '9,9%')).toEqual([2, 0]);
  });

  it('de vazio para texto vira todas as células', () => {
    expect(celulasQueMudam('', '12')).toEqual([1, 0]);
  });
});
