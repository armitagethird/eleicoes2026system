import { describe, expect, it } from 'vitest';
import { parseStatus } from './status.ts';

describe('parseStatus', () => {
  it('lê um status.json válido', () => {
    const bruto = { v: 1, modo: 'live', inicio: '2026-10-25T17:00:00-03:00', atualizado: '2026-10-25T18:42:10-03:00' };
    expect(parseStatus(bruto)).toEqual(bruto);
  });

  it('modo desconhecido ou ausente vira "pre"', () => {
    expect(parseStatus({ modo: 'apurando' }).modo).toBe('pre');
    expect(parseStatus({}).modo).toBe('pre');
  });

  it('tolera lixo sem lançar', () => {
    for (const lixo of [null, undefined, 42, 'live', [], { modo: 7, inicio: 3 }]) {
      expect(parseStatus(lixo).modo).toBe('pre');
    }
    expect(parseStatus({ modo: 7, inicio: 3 })).toEqual({ v: 1, modo: 'pre', inicio: null, atualizado: null });
  });
});
