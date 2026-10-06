import { describe, expect, it } from 'vitest';
import type { EntradaIndice } from './busca.ts';
import { maisProxima } from './geo.ts';

const indice: EntradaIndice[] = [
  ['sao-paulo-sp', 'São Paulo', 'SP', -23.5505, -46.6333, 9_000_000],
  ['rio-de-janeiro-rj', 'Rio de Janeiro', 'RJ', -22.9068, -43.1729, 4_800_000],
  ['sao-luis-ma', 'São Luís', 'MA', -2.5307, -44.3068, 760_000],
  ['natal-rn', 'Natal', 'RN', -5.7945, -35.211, 600_000],
  ['porto-alegre-rs', 'Porto Alegre', 'RS', -30.0346, -51.2177, 1_100_000],
];

describe('maisProxima', () => {
  it('devolve a própria cidade quando a posição é a dela', () => {
    expect(maisProxima(indice, -2.5307, -44.3068)).toEqual({ slug: 'sao-luis-ma', nome: 'São Luís', uf: 'MA', eleitores: 760_000 });
  });

  it('devolve a cidade mais próxima de um ponto qualquer', () => {
    // Niterói fica a ~8 km do centro do Rio e a ~350 km de São Paulo.
    expect(maisProxima(indice, -22.8832, -43.1034)?.slug).toBe('rio-de-janeiro-rj');
    // Parnamirim (RN), colada em Natal.
    expect(maisProxima(indice, -5.9157, -35.2627)?.slug).toBe('natal-rn');
  });

  it('usa distância na esfera (haversine), não distância euclidiana em graus', () => {
    // Perto do polo um grau de longitude vale bem menos que um de latitude.
    const polar: EntradaIndice[] = [
      ['longe-na-latitude', 'Longe na latitude', 'AA', 62, 0, 1],
      ['perto-na-longitude', 'Perto na longitude', 'BB', 60, 3, 1],
    ];
    // Euclides: 2° de latitude < 3° de longitude. Haversine: 3° de longitude em 60° de latitude são ~1,5° de arco.
    expect(maisProxima(polar, 60, 0)?.slug).toBe('perto-na-longitude');
  });

  it('não depende da ordem do índice', () => {
    expect(maisProxima([...indice].reverse(), -23.0, -46.0)?.slug).toBe('sao-paulo-sp');
  });

  it('índice vazio devolve null', () => {
    expect(maisProxima([], -10, -50)).toBeNull();
  });

  it.each([
    [Number.NaN, -50],
    [-10, Number.NaN],
    [Number.POSITIVE_INFINITY, -50],
  ])('coordenada inválida (%s, %s) devolve null, não uma cidade qualquer', (lat, lon) => {
    expect(maisProxima(indice, lat, lon)).toBeNull();
  });
});
