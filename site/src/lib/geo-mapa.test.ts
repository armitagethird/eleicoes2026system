import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UFS, type UF } from './contratos.ts';
import {
  arcosDeBorda,
  CODIGO_DA_UF,
  codificar,
  codificarAneis,
  codificarArcos,
  codificarDeltas,
  lerMalha,
  projetar,
  tracarFeicao,
  type Feicao,
  type Malha,
  type MalhaJson,
} from './geo-mapa.ts';

const geo = (caminho: string): Malha => lerMalha(JSON.parse(readFileSync(new URL(`../../public/geo/${caminho}`, import.meta.url), 'utf8')) as MalhaJson);

/** Anéis da feição como listas de pontos, gravados pelo mesmo traçado que o canvas usa. */
function aneisDe(m: Malha, f: Feicao): Array<Array<[number, number]>> {
  const aneis: Array<Array<[number, number]>> = [];
  tracarFeicao(m, f, {
    moveTo: (x, y) => aneis.push([[x, y]]),
    lineTo: (x, y) => aneis[aneis.length - 1].push([x, y]),
    closePath: () => {},
  });
  return aneis;
}

const areaComSinal = (pts: Array<[number, number]>) =>
  pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0) / 2;
const areaAnel = (pts: Array<[number, number]>) => Math.abs(areaComSinal(pts));

/** Ponto dentro pela regra par-ímpar, a mesma do canvas ('evenodd'). */
const dentro = (x: number, y: number, aneis: Array<Array<[number, number]>>) =>
  aneis.reduce((d, anel) => {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [ax, ay] = anel[i];
      const [bx, by] = anel[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) d = !d;
    }
    return d;
  }, false);

describe('formato', () => {
  // Dois quadrados lado a lado, de UFs diferentes, dividindo o arco do meio (usado ao contrário pelo da direita).
  const pequena: MalhaJson = {
    v: 1,
    largura: 20,
    altura: 10,
    metros: 100,
    projecao: [-54, -12, -2, -22, 0, 0],
    arcos: codificarArcos([
      [[10, 0], [10, 10]],
      [[10, 10], [0, 10], [0, 0], [10, 0]],
      [[10, 0], [20, 0], [20, 10], [10, 10]],
    ]),
    codigos: codificarDeltas([2111300, 2211001]),
    aneis: codificarAneis([[[0, 1]], [[2, ~0]]]),
    rotulos: [5, 5, 5, 15, 5, 5],
    nomes: ['São Luís', 'Teresina'],
  };

  it('polyline: os exemplos da documentação do Google', () => {
    expect(codificar([-17998321])).toBe('`~oia@');
    expect(codificar([3850000, -12020000, 220000, -75000, 255200, -550300])).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('lê arcos, códigos, anéis, caixas, rótulos e nomes', () => {
    const m = lerMalha(pequena);
    expect(m.feicoes.map((f) => [f.codigo, f.uf, f.nome])).toEqual([
      [2111300, 'MA', 'São Luís'],
      [2211001, 'PI', 'Teresina'],
    ]);
    expect(m.feicoes[1].caixa).toEqual([10, 0, 20, 10]);
    expect(m.feicoes[1].rotulo).toEqual([15, 5, 5]);
    expect(aneisDe(m, m.feicoes[0])).toEqual([[[10, 0], [10, 10], [0, 10], [0, 0], [10, 0]]]);
    expect(aneisDe(m, m.feicoes[1])).toEqual([[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]]);
  });

  it('borda: o arco entre UFs diferentes e os de fora', () => {
    expect(arcosDeBorda(lerMalha(pequena))).toEqual([0, 1, 2]);
    const mesmaUf = lerMalha({ ...pequena, codigos: codificarDeltas([2111300, 2111409]) });
    expect(arcosDeBorda(mesmaUf)).toEqual([1, 2]);
  });

  it('falha cedo com contexto', () => {
    expect(() => lerMalha({ ...pequena, v: 2 } as unknown as MalhaJson)).toThrow('versão');
    expect(() => lerMalha({ ...pequena, aneis: codificarAneis([[[0, 7]], [[2]]]) })).toThrow('arco 7');
  });
});

describe('public/geo: a malha do IBGE inteira', () => {
  const nacional = geo('municipios.json');
  const ufs = geo('ufs.json');
  const codigos = nacional.feicoes.map((f) => f.codigo);

  it('5.571 municípios, sem repetição, com Boa Esperança do Norte (MT, instalado em 2025)', () => {
    expect(codigos).toHaveLength(5571);
    expect(new Set(codigos).size).toBe(5571);
    expect(codigos).toContain(5101837);
  });

  it('todo município tem polígono com área', () => {
    for (const f of nacional.feicoes) {
      expect(aneisDe(nacional, f).reduce((s, anel) => s + areaAnel(anel), 0), String(f.codigo)).toBeGreaterThan(0);
    }
  });

  it('anel externo com área positiva e buraco com negativa (o canvas junta vizinhos e pinta com "nonzero")', () => {
    for (const f of nacional.feicoes) {
      const aneis = aneisDe(nacional, f);
      const maior = aneis.reduce((a, b) => (areaAnel(b) > areaAnel(a) ? b : a));
      expect(areaComSinal(maior), String(f.codigo)).toBeGreaterThan(0);
    }
    // Enclaves: Ladário fica dentro de Corumbá (MS), e Arroio do Padre dentro de Pelotas (RS).
    for (const [envolve, enclave] of [[5003207, 5005103], [4314407, 4301073]]) {
      const [fora, dentroDele] = [envolve, enclave].map((c) => nacional.feicoes.find((f) => f.codigo === c) as Feicao);
      expect(aneisDe(nacional, fora).map((anel) => Math.sign(areaComSinal(anel))).sort(), String(envolve)).toEqual([-1, 1]);
      expect(aneisDe(nacional, dentroDele).every((anel) => areaComSinal(anel) > 0), String(enclave)).toBe(true);
    }
  });

  it('as 27 UFs, cada uma com polígono e rótulo dentro dela', () => {
    expect(ufs.feicoes.map((f) => f.uf).sort()).toEqual([...UFS].sort());
    for (const f of ufs.feicoes) {
      const aneis = aneisDe(ufs, f);
      expect(aneis.reduce((s, anel) => s + areaAnel(anel), 0), f.uf).toBeGreaterThan(0);
      expect(f.codigo).toBe(CODIGO_DA_UF[f.uf]);
      expect(dentro((f.rotulo as number[])[0], (f.rotulo as number[])[1], aneis), f.uf).toBe(true);
    }
  });

  it('os arquivos por UF somam os mesmos municípios, com nome e rótulo dentro do polígono', () => {
    const vistos: number[] = [];
    for (const uf of UFS) {
      const m = geo(`uf/${uf.toLowerCase()}.json`);
      for (const f of m.feicoes) {
        expect(f.uf).toBe(uf);
        expect(f.nome, String(f.codigo)).toBeTruthy();
        const [x, y] = f.rotulo as number[];
        expect(dentro(x, y, aneisDe(m, f)), `rótulo de ${f.nome}`).toBe(true);
        vistos.push(f.codigo);
      }
    }
    expect(vistos.sort((a, b) => a - b)).toEqual([...codigos].sort((a, b) => a - b));
  });

  it('projeção: a sede de São Luís cai dentro de São Luís, e a de Boa Esperança do Norte dentro dela', () => {
    const casos: Array<[UF, number, number, number]> = [
      ['MA', 2111300, -44.3028, -2.5307],
      ['MT', 5101837, -54.9417, -13.4632],
      ['RS', 4314902, -51.2177, -30.0346],
    ];
    for (const [uf, codigo, lon, lat] of casos) {
      const m = geo(`uf/${uf.toLowerCase()}.json`);
      const f = m.feicoes.find((x) => x.codigo === codigo) as Feicao;
      expect(dentro(...projetar(m, lon, lat), aneisDe(m, f)), String(codigo)).toBe(true);
    }
  });

  it('mesma grade em todos os arquivos: o rótulo de cada UF (grade de 200 m) cai num município dela (grade de 20 m)', () => {
    for (const f of ufs.feicoes) {
      const d = geo(`uf/${f.uf.toLowerCase()}.json`);
      const [x, y] = (f.rotulo as number[]).map((v) => (v * ufs.metros) / d.metros);
      expect(d.feicoes.some((m) => dentro(x, y, aneisDe(d, m))), f.uf).toBe(true);
    }
  });

  it('um polígono para cada município da API de localidades do IBGE', async () => {
    const resposta = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado');
    expect(resposta.ok).toBe(true);
    const oficiais = ((await resposta.json()) as Array<{ 'municipio-id': number }>).map((l) => l['municipio-id']);
    expect([...oficiais].sort((a, b) => a - b)).toEqual([...codigos].sort((a, b) => a - b));
  }, 60_000);
});
