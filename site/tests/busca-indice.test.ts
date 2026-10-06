import { describe, expect, it } from 'vitest';
import type { EntradaIndice } from '../src/lib/busca.ts';
import municipios from '../src/data/municipios.json';
import { GET } from '../src/pages/busca.json.ts';

const indice = (await (GET({} as Parameters<typeof GET>[0]) as Response).json()) as EntradaIndice[];

describe('/busca.json (índice de busca)', () => {
  it('tem uma entrada por município', () => {
    expect(indice).toHaveLength(municipios.length);
    expect(new Set(indice.map((entrada) => entrada[0])).size).toBe(municipios.length);
  });

  it('cada entrada é [slug, nome, uf, lat, lon, eleitores]', () => {
    for (const [slug, nome, uf, lat, lon, eleitores] of indice) {
      expect(typeof slug).toBe('string');
      expect(typeof nome).toBe('string');
      expect(uf).toMatch(/^[A-Z]{2}$/);
      expect(lat).toBeGreaterThanOrEqual(-34);
      expect(lat).toBeLessThanOrEqual(6);
      expect(lon).toBeGreaterThanOrEqual(-74);
      expect(lon).toBeLessThanOrEqual(-34);
      expect(Number.isInteger(eleitores)).toBe(true);
    }
  });

  it('vem ordenado por eleitores desc', () => {
    const eleitores = indice.map((entrada) => entrada[5]);
    expect(eleitores).toEqual([...eleitores].sort((a, b) => b - a));
  });

  it('responde JSON', () => {
    const resposta = GET({} as Parameters<typeof GET>[0]) as Response;
    expect(resposta.headers.get('Content-Type')).toContain('application/json');
  });
});
