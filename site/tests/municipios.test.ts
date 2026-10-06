import { describe, expect, it } from 'vitest';
import { slugMunicipio } from '../src/lib/slug.ts';
import municipios from '../src/data/municipios.json';
import hist from '../src/data/hist/boa-esperanca-do-norte-mt.json';

describe('municipios.json (stub de 50 cidades)', () => {
  it('slugs únicos', () => {
    const slugs = municipios.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('slug bate com a regra nome-uf', () => {
    for (const m of municipios) expect(m.slug, m.nome).toBe(slugMunicipio(m.nome, m.uf));
  });

  it('inclui as 27 UFs, nomes longos e o município sem 2022', () => {
    expect(new Set(municipios.map((m) => m.uf)).size).toBe(27);
    const slugs = municipios.map((m) => m.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        'santa-barbara-doeste-sp',
        'sao-joao-da-boa-vista-sp',
        'vila-bela-da-santissima-trindade-mt',
        'boa-esperanca-do-norte-mt',
        'serra-da-saudade-mg',
        'bora-sp',
      ]),
    );
    expect(hist.t2_2022).toBeNull();
  });
});
