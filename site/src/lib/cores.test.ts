import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corCandidato } from './cores.ts';

describe('corCandidato', () => {
  it('13 é vermelho e 22 é azul claro, em qualquer coluna', () => {
    expect(corCandidato(13, 0)).toEqual({ hex: '#f2464b', css: 'var(--cand-13)' });
    expect(corCandidato(13, 1).hex).toBe('#f2464b');
    expect(corCandidato(22, 1)).toEqual({ hex: '#6cc4ff', css: 'var(--cand-22)' });
    expect(corCandidato(22, 0).hex).toBe('#6cc4ff');
  });

  it('número sem cor definida fica neutro, distinto por coluna', () => {
    expect(corCandidato(45, 0).css).toBe('var(--ink)');
    expect(corCandidato(12, 1).css).toBe('var(--ink-2)');
  });

  it('os hex espelham os tokens', () => {
    const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
    expect(tokens).toContain(`--cand-13: ${corCandidato(13, 0).hex};`);
    expect(tokens).toContain(`--cand-22: ${corCandidato(22, 0).hex};`);
  });
});
