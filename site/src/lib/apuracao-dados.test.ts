import { describe, expect, it } from 'vitest';
import municipiosJson from '../data/municipios.json';
import {
  CAPITAIS,
  REFERENCIA,
  abas,
  comDados,
  destaques,
  estadoCamada,
  lerIndice,
  linhasIndice,
  linhasTabela,
  mesclarAoVivo,
  quemLidera,
  urlCamada,
  valorDe,
  variacao,
  type Lugar,
} from './apuracao-dados.ts';
import { lerCamada, type Camada, type Linha, type Valor } from './camada-mapa.ts';
import { NOME_UF, UFS, type Municipio, type UF } from './contratos.ts';

const v = (a: number, b: number, outros = 0, secoes = 100, liderOutro: number | null = null): Valor => ({ a, b, outros, liderOutro, secoes });

function camada(id: string, municipios: Array<[number, ...Linha]>, extra: Partial<Record<'br', Linha>> = {}, atualizado = '2022-10-30T20:00:00-03:00'): Camada {
  const c = lerCamada({
    v: 1,
    id,
    rotulo: id,
    atualizado,
    candidatos: [
      { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
      { n: 22, nome: 'Jair Bolsonaro', partido: 'PL', cor: '22' },
    ],
    br: extra.br ?? [50.9, 49.1, 0, 0, 100],
    ufs: { MA: [71.1, 28.9, 0, 0, 100], SP: [44.8, 55.2, 0, 0, 100] },
    municipios,
  });
  if (!c) throw new Error('camada de teste inválida');
  return c;
}

const lugar = (ibge: number, nome: string, uf: UF): Lugar => ({ ibge, slug: nome.toLowerCase(), nome, uf, eleitores: 1 });

describe('abas e referência', () => {
  it('antes do dia 25: as três apuradas, com o 2º turno de 2022 como padrão', () => {
    expect(abas('pre')).toEqual({ ids: ['2022-t2', '2022-t1', '2026-t1'], padrao: '2022-t2' });
  });

  it('a partir do dia 25 o ao vivo vem na frente e é o padrão, também no final', () => {
    for (const modo of ['live', 'final'] as const) {
      expect(abas(modo)).toEqual({ ids: ['ao-vivo', '2022-t2', '2022-t1', '2026-t1'], padrao: 'ao-vivo' });
    }
  });

  it('cada aba compara com o mesmo turno da eleição anterior', () => {
    expect(REFERENCIA['ao-vivo']).toBe('2022-t2');
    expect(REFERENCIA['2026-t1']).toBe('2022-t1');
    expect(REFERENCIA['2022-t2']).toBe('2018-t2');
    expect(REFERENCIA['2022-t1']).toBe('2018-t1');
  });

  it('toda aba tem referência, e a referência é do mesmo turno', () => {
    for (const modo of ['pre', 'live'] as const) {
      for (const id of abas(modo).ids) {
        const ref = REFERENCIA[id];
        expect(ref, id).not.toBeNull();
        expect(ref?.slice(-2)).toBe(id === 'ao-vivo' ? 't2' : id.slice(-2));
      }
    }
  });

  it('o histórico sai de /mapa e o ao vivo de /data', () => {
    expect(urlCamada('2018-t1')).toBe('/mapa/2018-t1.json');
    expect(urlCamada('ao-vivo')).toBe('/data/apuracao.json');
  });
});

describe('valor e variação', () => {
  const c = camada('2022-t2', [[2111300, 60, 40, 0, 0, 100]]);

  it('lê Brasil, UF e município pela seleção', () => {
    expect(valorDe(c, null)?.a).toBe(50.9);
    expect(valorDe(c, { tipo: 'uf', uf: 'MA' })?.a).toBe(71.1);
    expect(valorDe(c, { tipo: 'municipio', ibge: 2111300, uf: 'MA' })?.b).toBe(40);
    expect(valorDe(c, { tipo: 'uf', uf: 'AC' })).toBeNull();
    expect(valorDe(null, null)).toBeNull();
  });

  it('abaixo de 1% das seções não há dado', () => {
    expect(comDados(v(60, 40, 0, 0.9))).toBe(false);
    expect(comDados(v(60, 40, 0, 1))).toBe(true);
    expect(comDados(v(0, 0))).toBe(false);
    expect(comDados(null)).toBe(false);
  });

  it('a variação é a fatia de A entre os dois, como na página de cidade', () => {
    expect(variacao(v(55, 45), v(50, 50))).toBeCloseTo(5);
    // 1º turno: 40 de A e 40 de B sobre 80 = 50% para A; antes 60 × 40 = 60%.
    expect(variacao(v(40, 40, 20), v(60, 40))).toBeCloseTo(-10);
  });

  it('sem dado de um dos lados, sem variação', () => {
    expect(variacao(v(55, 45), null)).toBeNull();
    expect(variacao(v(55, 45, 0, 0.5), v(50, 50))).toBeNull();
  });

  it('quem lidera entre os dois, e o empate sem líder', () => {
    expect(quemLidera(v(51, 49))).toBe(0);
    expect(quemLidera(v(49, 51))).toBe(1);
    expect(quemLidera(v(50, 50))).toBeNull();
  });
});

describe('índice de municípios', () => {
  it('é compacto, ordenado pelo código IBGE e lido de volta', () => {
    const linhas = linhasIndice(municipiosJson as Municipio[]);
    expect(linhas).toHaveLength(municipiosJson.length);
    expect(linhas.map((l) => l[0])).toEqual([...linhas.map((l) => l[0])].sort((a, b) => a - b));
    const indice = lerIndice(JSON.parse(JSON.stringify(linhas)));
    expect(indice.get(2111300)).toEqual(expect.objectContaining({ slug: 'sao-luis-ma', nome: 'São Luís', uf: 'MA' }));
  });

  it('descarta linha malformada sem lançar', () => {
    const indice = lerIndice([[1, 'a', 'A', 'XX', 1], ['2', 'b', 'B', 'MA', 1], [3, 'c', 'C', 'MA', null], 'x']);
    expect([...indice.keys()]).toEqual([3]);
    expect(indice.get(3)?.eleitores).toBe(0);
    expect(lerIndice(null).size).toBe(0);
  });

  it('as 27 capitais existem no índice, uma por UF, na UF certa', () => {
    const indice = lerIndice(linhasIndice(municipiosJson as Municipio[]));
    for (const uf of UFS) expect(indice.get(CAPITAIS[uf])?.uf, uf).toBe(uf);
  });
});

describe('destaques', () => {
  const indice = new Map<number, Lugar>(
    [
      lugar(1, 'Alfa', 'MA'),
      lugar(2, 'Beta', 'MA'),
      lugar(3, 'Gama', 'SP'),
      lugar(4, 'Delta', 'SP'),
      lugar(5, 'Épsilon', 'SP'),
      lugar(CAPITAIS.MA, 'São Luís', 'MA'),
      lugar(CAPITAIS.SP, 'São Paulo', 'SP'),
    ].map((l) => [l.ibge, l]),
  );
  const agora = camada('ao-vivo', [
    [1, 50.5, 49.5, 0, 0, 80],
    [2, 90, 10, 0, 0, 80],
    [3, 45, 55, 0, 0, 80],
    [4, 52, 48, 0, 0, 0.5],
    [5, 30, 20, 50, 12, 80],
    [9, 50, 50, 0, 0, 80],
    [CAPITAIS.SP, 47, 53, 0, 0, 80],
  ]);
  const antes = camada('2022-t2', [
    [1, 45, 55, 0, 0, 100],
    [2, 85, 15, 0, 0, 100],
    [3, 52, 48, 0, 0, 100],
    [CAPITAIS.SP, 53, 47, 0, 0, 100],
  ]);

  it('mais dividida e mais unânime pela margem, sem quem está fora do índice, sem dado ou com um terceiro na frente', () => {
    const d = destaques(agora, antes, indice, null);
    expect(d.dividida.map((x) => x.ibge)).toEqual([1, CAPITAIS.SP, 3, 2]);
    expect(d.unanime.map((x) => x.ibge)).toEqual([2, 3, CAPITAIS.SP, 1]);
  });

  it('maior virada: só quem mudou de lado entre os dois, pela maior variação', () => {
    const d = destaques(agora, antes, indice, null);
    expect(d.virada.map((x) => x.ibge)).toEqual([3, CAPITAIS.SP, 1]);
    expect(d.virada[0].variacao).toBeCloseTo(-7);
  });

  it('sem referência não há virada', () => {
    expect(destaques(agora, null, indice, null).virada).toEqual([]);
  });

  it('capitais do foco em ordem alfabética, mesmo sem dado', () => {
    const d = destaques(agora, antes, indice, null);
    expect(d.capitais.map((x) => x.lugar.nome)).toEqual(['São Luís', 'São Paulo']);
    expect(d.capitais[0].valor).toBeNull();
    expect(destaques(agora, antes, indice, 'SP').capitais.map((x) => x.ibge)).toEqual([CAPITAIS.SP]);
  });

  it('o foco restringe à UF e o limite corta cada lista', () => {
    const d = destaques(agora, antes, indice, 'MA', 1);
    expect(d.dividida.map((x) => x.ibge)).toEqual([1]);
    expect(d.unanime.map((x) => x.ibge)).toEqual([2]);
    expect(d.virada.map((x) => x.ibge)).toEqual([1]);
  });

  it('empate de margem sai pelo código IBGE, nas duas pontas', () => {
    const c = camada('2022-t2', [
      [3, 60, 40, 0, 0, 100],
      [1, 40, 60, 0, 0, 100],
    ]);
    expect(destaques(c, null, indice, null).dividida.map((x) => x.ibge)).toEqual([1, 3]);
    expect(destaques(c, null, indice, null).unanime.map((x) => x.ibge)).toEqual([1, 3]);
  });
});

describe('tabela', () => {
  const indice = new Map<number, Lugar>([lugar(2, 'Zé Doca', 'MA'), lugar(1, 'Açailândia', 'MA'), lugar(3, 'Bauru', 'SP')].map((l) => [l.ibge, l]));
  const agora = camada('2022-t2', [[1, 60, 40, 0, 0, 100]]);
  const antes = camada('2018-t2', [[1, 50, 50, 0, 0, 100]]);

  it('Brasil: as 27 UFs pelo nome, com e sem dado', () => {
    const linhas = linhasTabela(agora, antes, indice, null, (uf) => NOME_UF[uf]);
    expect(linhas).toHaveLength(27);
    expect(linhas[0].nome).toBe('Acre');
    expect(linhas.find((l) => l.chave === 'MA')?.variacao).toBeCloseTo(0);
    expect(linhas.find((l) => l.chave === 'AC')?.valor).toBeNull();
  });

  it('UF em foco: os municípios dela do índice, pelo nome', () => {
    const linhas = linhasTabela(agora, antes, indice, 'MA', (uf) => NOME_UF[uf]);
    expect(linhas.map((l) => l.nome)).toEqual(['Açailândia', 'Zé Doca']);
    expect(linhas[0].variacao).toBeCloseTo(10);
    expect(linhas[1].valor).toBeNull();
  });
});

describe('ao vivo', () => {
  const as = (hora: string) => camada('ao-vivo', [], {}, `2026-10-25T${hora}:00-03:00`);

  it('a leitura nova substitui a anterior', () => {
    const nova = as('18:42');
    expect(mesclarAoVivo(as('18:22'), nova)).toBe(nova);
    expect(mesclarAoVivo(null, nova)).toBe(nova);
  });

  it('nunca volta no tempo, e leitura inválida mantém a anterior', () => {
    const anterior = as('18:42');
    expect(mesclarAoVivo(anterior, as('18:22'))).toBe(anterior);
    expect(mesclarAoVivo(anterior, null)).toBe(anterior);
  });

  it('estados: carregando, erro, sem conexão, aguardando e ok', () => {
    expect(estadoCamada(null, false)).toBe('carregando');
    expect(estadoCamada(null, true)).toBe('erro');
    expect(estadoCamada(as('18:42'), true)).toBe('sem-conexao');
    expect(estadoCamada(camada('ao-vivo', [], { br: [0, 0, 0, 0, 0] }), false)).toBe('aguardando');
    expect(estadoCamada(camada('ao-vivo', [], { br: [50, 50, 0, 0, 0.4] }), false)).toBe('aguardando');
    expect(estadoCamada(as('18:42'), false)).toBe('ok');
  });
});
