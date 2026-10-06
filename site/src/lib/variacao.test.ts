import { describe, expect, it } from 'vitest';
import { variacaoDe } from './variacao.ts';

describe('variacaoDe', () => {
  it('usa a chave do próprio candidato', () => {
    expect(variacaoDe({ '13': -0.48, '22': 0.48 }, 22, 13)).toBe(0.48);
    expect(variacaoDe({ '13': -0.48, '22': 0.48 }, 13, 22)).toBe(-0.48);
  });

  it('com uma chave só, a outra é o espelho (o contrato aceita só uma)', () => {
    expect(variacaoDe({ '13': -3.4 }, 22, 13)).toBe(3.4);
    expect(variacaoDe({ '22': 2.6 }, 13, 22)).toBe(-2.6);
  });

  it('sem variação conhecida devolve undefined', () => {
    expect(variacaoDe({}, 13, 22)).toBeUndefined();
    expect(variacaoDe(undefined, 13, 22)).toBeUndefined();
  });

  it('ignora valor que não é número finito', () => {
    expect(variacaoDe({ '13': Number.NaN, '22': 1.2 }, 13, 22)).toBe(-1.2);
    expect(variacaoDe({ '13': Number.NaN }, 22, 13)).toBeUndefined();
  });
});
