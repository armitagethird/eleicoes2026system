import { describe, expect, it } from 'vitest';
import { lerCamada } from './camada-mapa.ts';

const base = {
  v: 1,
  id: '2018-t2',
  rotulo: '2º turno 2018',
  atualizado: '2018-10-28T21:00:00-03:00',
  candidatos: [
    { n: 13, nome: 'Fernando Haddad', partido: 'PT', cor: '13' },
    { n: 17, nome: 'Jair Bolsonaro', partido: 'PSL', cor: '22' },
  ],
  br: [44.87, 55.13, 0, 0, 100],
  ufs: { MA: [73.26, 26.74, 0, 0, 100] },
  municipios: [
    [2111300, 60.1, 39.9, 0, 0, 100],
    [3550308, 40, 50, 10, 12, 100],
  ],
};

describe('lerCamada', () => {
  it('lê candidatos, Brasil, UFs e municípios', () => {
    const c = lerCamada(base);
    expect(c?.candidatos.map((x) => [x.n, x.cor])).toEqual([[13, '13'], [17, '22']]);
    expect(c?.br).toEqual({ a: 44.87, b: 55.13, outros: 0, liderOutro: null, secoes: 100 });
    expect(c?.ufs.get('MA')?.a).toBe(73.26);
    expect(c?.municipios.get(2111300)?.b).toBe(39.9);
  });

  it('guarda o número de quem lidera quando não é nenhum dos dois', () => {
    expect(lerCamada(base)?.municipios.get(3550308)?.liderOutro).toBe(12);
  });

  it('descarta linhas inválidas sem quebrar', () => {
    const c = lerCamada({ ...base, municipios: [[1, 120, 0, 0, 0, 100], ['x', 1, 1, 1, 0, 100], [2111300, 60, 40, 0, 0, 100]] });
    expect([...(c?.municipios.keys() ?? [])]).toEqual([2111300]);
  });

  it('cor desconhecida vira neutra', () => {
    const c = lerCamada({ ...base, candidatos: [base.candidatos[0], { n: 45, nome: 'X', partido: 'Y', cor: 'azul' }] });
    expect(c?.candidatos[1].cor).toBeNull();
  });

  it('sem os dois candidatos não há camada', () => {
    expect(lerCamada({ ...base, candidatos: [base.candidatos[0]] })).toBeNull();
    expect(lerCamada(null)).toBeNull();
  });
});
