import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerCamada, type Camada, type CamadaJson } from './camada-mapa.ts';
import type { Municipio } from './contratos.ts';
import {
  ANOS,
  COLUNAS,
  IDS_HIST,
  alternarAno,
  anoTravado,
  comAoVivo,
  hashDaSelecao,
  lerAoVivo,
  lerHash,
  lerSerieJson,
  normalizarAnos,
  pontosDaSelecao,
  pontosDe,
  serieJsonBrasil,
  serieJsonUf,
  type Ano,
  type IdHist,
} from './serie-historica.ts';

const haddad = { n: 13, nome: 'Fernando Haddad', partido: 'PT', cor: '13' } as const;
const jair17 = { n: 17, nome: 'Jair Bolsonaro', partido: 'PSL', cor: '22' } as const;
const lula = { n: 13, nome: 'Lula', partido: 'PT', cor: '13' } as const;
const jair22 = { n: 22, nome: 'Jair Bolsonaro', partido: 'PL', cor: '22' } as const;
const flavio = { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', cor: '22' } as const;

const CANDIDATOS: Record<IdHist, CamadaJson['candidatos']> = {
  '2018-t1': [haddad, jair17],
  '2018-t2': [haddad, jair17],
  '2022-t1': [lula, jair22],
  '2022-t2': [lula, jair22],
  '2026-t1': [lula, flavio],
};

// Dois municípios de MA (1 e 2) e um de SP (3). O 2 não existe em 2018 (como Boa Esperança do Norte).
function camadaDe(id: IdHist, deslocamento: number): Camada {
  const camada = lerCamada({
    v: 1,
    id,
    rotulo: id,
    atualizado: '2026-10-05T14:03:29-03:00',
    candidatos: CANDIDATOS[id],
    br: [40 + deslocamento, 50, 10 - deslocamento, 0, 100],
    ufs: { MA: [60 + deslocamento, 30, 10 - deslocamento, 0, 100] },
    municipios: [
      [2111300, 61 + deslocamento, 29, 10 - deslocamento, 0, 100],
      ...(id.startsWith('2018') ? [] : [[2100055, 20 + deslocamento, 70, 10 - deslocamento, 0, 100]]),
      [3550308, 46, 42, 12, 0, 100],
    ],
  });
  if (!camada) throw new Error('camada de teste inválida');
  return camada;
}

const camadas = Object.fromEntries(IDS_HIST.map((id, i) => [id, camadaDe(id, i)])) as Record<IdHist, Camada>;

const municipio = (slug: string, uf: Municipio['uf'], cod_ibge: number): Municipio => ({ slug, nome: slug, uf, cod_tse: 0, cod_ibge, lat: 0, lon: 0, eleitores: 0 });
const municipios = [municipio('sao-luis-ma', 'MA', 2111300), municipio('acailandia-ma', 'MA', 2100055), municipio('sao-paulo-sp', 'SP', 3550308)];

describe('COLUNAS', () => {
  it('são os seis pontos do eixo X, na ordem do tempo, e o último é o ao vivo de 2026', () => {
    expect(COLUNAS).toEqual(['2018-t1', '2018-t2', '2022-t1', '2022-t2', '2026-t1', '2026-t2']);
    expect(IDS_HIST).toEqual(COLUNAS.slice(0, 5));
  });
});

describe('serieJsonBrasil', () => {
  it('traz [A, B, outros] do Brasil de cada camada, na ordem do eixo, com os candidatos de cada eleição', () => {
    const json = serieJsonBrasil(camadas);
    expect(json.nome).toBe('Brasil');
    expect(json.linhas).toEqual([
      [40, 50, 10],
      [41, 50, 9],
      [42, 50, 8],
      [43, 50, 7],
      [44, 50, 6],
    ]);
    expect(json.cand.map((c) => c.id)).toEqual([...IDS_HIST]);
    expect(json.cand[0].b).toEqual(jair17);
    expect(json.cidades).toBeUndefined();
  });

  it('camada sem a linha do Brasil vira null, sem quebrar as outras', () => {
    const semBr = { ...camadas['2022-t1'], br: null };
    expect(serieJsonBrasil({ ...camadas, '2022-t1': semBr }).linhas[2]).toBeNull();
  });
});

describe('serieJsonUf', () => {
  const json = serieJsonUf(camadas, municipios, 'MA');

  it('traz a linha da UF e só as cidades dela, por slug', () => {
    expect(json.nome).toBe('Maranhão');
    expect(json.linhas[0]).toEqual([60, 30, 10]);
    expect(Object.keys(json.cidades ?? {}).sort()).toEqual(['acailandia-ma', 'sao-luis-ma']);
  });

  it('cidade que não existia numa eleição fica com null nela e com dado nas outras', () => {
    const linhas = json.cidades?.['acailandia-ma'];
    expect(linhas?.[0]).toBeNull();
    expect(linhas?.[1]).toBeNull();
    expect(linhas?.[2]).toEqual([22, 70, 8]);
    expect(linhas?.[4]).toEqual([24, 70, 6]);
  });
});

describe('lerSerieJson', () => {
  it('lê o que serieJsonUf escreve, inclusive depois de ir e voltar por JSON', () => {
    const volta = lerSerieJson(JSON.parse(JSON.stringify(serieJsonUf(camadas, municipios, 'MA'))));
    expect(volta?.nome).toBe('Maranhão');
    expect(volta?.cidades?.['sao-luis-ma']?.[4]).toEqual([65, 29, 6]);
  });

  it.each([null, 42, 'x', {}, { v: 1, nome: 'x', cand: [], linhas: [] }, { v: 2 }])('descarta o que não tem o formato (%j)', (bruto) => {
    expect(lerSerieJson(bruto)).toBeNull();
  });

  it('descarta a série com percentual fora de 0 a 100 ou linha de tamanho errado', () => {
    const bom = JSON.parse(JSON.stringify(serieJsonBrasil(camadas)));
    expect(lerSerieJson({ ...bom, linhas: [[140, 50, 10], ...bom.linhas.slice(1)] })).toBeNull();
    expect(lerSerieJson({ ...bom, linhas: [[40, 50], ...bom.linhas.slice(1)] })).toBeNull();
  });
});

describe('pontosDe', () => {
  const json = lerSerieJson(JSON.parse(JSON.stringify(serieJsonBrasil(camadas))));
  const pontos = pontosDe(json!)!;

  it('devolve os seis pontos na ordem do eixo, com ano e turno', () => {
    expect(pontos.map((p) => [p.id, p.ano, p.turno])).toEqual([
      ['2018-t1', 2018, 1],
      ['2018-t2', 2018, 2],
      ['2022-t1', 2022, 1],
      ['2022-t2', 2022, 2],
      ['2026-t1', 2026, 1],
      ['2026-t2', 2026, 2],
    ]);
  });

  it('A (o do PT, 13) vem antes de B (o de Bolsonaro) em todos os pontos', () => {
    for (const p of pontos.slice(0, 5)) {
      expect(p.a?.n).toBe(13);
      expect(p.b?.cor).toBe('22');
    }
  });

  it('em 2018 o candidato de Bolsonaro é o 17 e a cor segue o campo, "22"', () => {
    expect(pontos[0].b).toMatchObject({ n: 17, nome: 'Jair Bolsonaro', cor: '22', pct: 50 });
    expect(pontos[2].b).toMatchObject({ n: 22, cor: '22' });
    expect(pontos[4].b?.nome).toBe('Flávio Bolsonaro');
  });

  it('"outros" só existe no 1º turno', () => {
    expect(pontos.map((p) => p.outros)).toEqual([10, null, 8, null, 6, null]);
  });

  it('o 2º turno de 2026 sai vazio até o ao vivo chegar', () => {
    expect(pontos[5]).toEqual({ id: '2026-t2', ano: 2026, turno: 2, a: null, b: null, outros: null });
  });

  it('cidade: usa as linhas dela; slug que não está no arquivo devolve null', () => {
    const uf = lerSerieJson(JSON.parse(JSON.stringify(serieJsonUf(camadas, municipios, 'MA'))))!;
    const cidade = pontosDe(uf, 'acailandia-ma');
    expect(cidade?.[0]).toMatchObject({ a: null, b: null, outros: null });
    expect(cidade?.[2].a?.pct).toBe(22);
    expect(pontosDe(uf, 'sao-paulo-sp')).toBeNull();
  });
});

describe('lerAoVivo', () => {
  const cand = (n: number, nome: string, pct: number) => ({ n, nome, partido: 'X', votos: 1, pct, eleito: false });
  const placar = (secoes: number, pcts: [number, number] = [49.31, 50.69]) => ({
    v: 1,
    turno: 2,
    atualizado: '2026-10-25T18:42:10-03:00',
    secoes_pct: secoes,
    presidente: { cand: [cand(22, 'Flávio Bolsonaro', pcts[1]), cand(13, 'Lula', pcts[0])] },
  });

  it('parcial: lê os dois candidatos, 13 antes de 22 mesmo se o JSON vier ao contrário, com a cor pelo número', () => {
    const vivo = lerAoVivo(placar(67), 'live');
    expect(vivo).toMatchObject({ fase: 'parcial', secoesPct: 67, atualizado: '2026-10-25T18:42:10-03:00' });
    expect(vivo?.a).toMatchObject({ n: 13, nome: 'Lula', cor: '13', pct: 49.31 });
    expect(vivo?.b).toMatchObject({ n: 22, nome: 'Flávio Bolsonaro', cor: '22', pct: 50.69 });
  });

  it('final quando o site está em final', () => {
    expect(lerAoVivo(placar(100), 'final')?.fase).toBe('final');
  });

  it('no modo pre não há ao vivo, mesmo com arquivo na mão', () => {
    expect(lerAoVivo(placar(67), 'pre')).toBeNull();
  });

  it('menos de 1% das seções é "aguardando primeiras seções": sem ponto', () => {
    expect(lerAoVivo(placar(0.4), 'live')).toBeNull();
  });

  it.each([null, {}, { presidente: { cand: [] } }, { secoes_pct: 50, presidente: { cand: [cand(13, 'Lula', 50)] } }])(
    'descarta o que não tem os dois candidatos (%j)',
    (bruto) => {
      expect(lerAoVivo(bruto, 'live')).toBeNull();
    },
  );

  it('descarta percentual que não é número entre 0 e 100', () => {
    expect(lerAoVivo(placar(67, [Number.NaN, 50]), 'live')).toBeNull();
    expect(lerAoVivo(placar(67, [49, 140]), 'live')).toBeNull();
  });
});

describe('comAoVivo', () => {
  const json = lerSerieJson(JSON.parse(JSON.stringify(serieJsonBrasil(camadas))))!;
  const vivo = lerAoVivo(
    {
      secoes_pct: 67,
      atualizado: '2026-10-25T18:42:10-03:00',
      presidente: {
        cand: [
          { n: 13, nome: 'Lula', partido: 'PT', pct: 49.31 },
          { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', pct: 50.69 },
        ],
      },
    },
    'live',
  );

  it('põe o ao vivo só no último ponto e não mexe no original', () => {
    const base = pontosDe(json)!;
    const com = comAoVivo(base, vivo);
    expect(com[5].a?.pct).toBe(49.31);
    expect(com[5].aoVivo).toEqual({ fase: 'parcial', secoesPct: 67, atualizado: '2026-10-25T18:42:10-03:00' });
    expect(com.slice(0, 5)).toEqual(base.slice(0, 5));
    expect(base[5].a).toBeNull();
  });

  it('sem ao vivo, devolve a série como estava', () => {
    const base = pontosDe(json)!;
    expect(comAoVivo(base, null)).toEqual(base);
  });
});

describe('dados reais (public/mapa)', () => {
  const lerJson = <T>(caminho: string): T => JSON.parse(readFileSync(new URL(caminho, import.meta.url), 'utf8')) as T;
  const reais = Object.fromEntries(
    IDS_HIST.map((id) => [id, lerCamada(lerJson(`../../public/mapa/${id}.json`))]),
  ) as Record<IdHist, Camada>;
  const todos = lerJson<Municipio[]>('../data/municipios.json');

  it('o Brasil é a linha do Brasil de cada camada', () => {
    const { linhas } = serieJsonBrasil(reais);
    expect(linhas[3]).toEqual([50.9, 49.1, 0]);
    expect(linhas[1]).toEqual([44.87, 55.13, 0]);
    expect(linhas[4]).toEqual([45.16, 47.03, 7.81]);
  });

  it('o arquivo de uma UF tem uma entrada por município dela (5.571 no total) e confere com a camada', () => {
    let total = 0;
    for (const uf of new Set(todos.map((m) => m.uf))) {
      const json = serieJsonUf(reais, todos, uf);
      total += Object.keys(json.cidades ?? {}).length;
      expect(Object.keys(json.cidades ?? {}).length, uf).toBe(todos.filter((m) => m.uf === uf).length);
    }
    expect(total).toBe(todos.length);
    const maranhao = serieJsonUf(reais, todos, 'MA');
    expect(maranhao.cidades?.['sao-luis-ma']?.[4]).toEqual([54.51, 37.02, 8.47]);
  });

  it('Boa Esperança do Norte (criada depois de 2022) só tem o 1º turno de 2026', () => {
    const mt = serieJsonUf(reais, todos, 'MT');
    expect(mt.cidades?.['boa-esperanca-do-norte-mt']?.map((l) => l !== null)).toEqual([false, false, false, false, true]);
  });
});

// Seleção de eleições (decisão do Romero, 06/10): qualquer subconjunto não vazio de 2018, 2022 e 2026, sempre na ordem do tempo.
const SUBCONJUNTOS: Ano[][] = [[2018], [2022], [2026], [2018, 2022], [2018, 2026], [2022, 2026], [2018, 2022, 2026]];

describe('ANOS', () => {
  it('são as três eleições da série, na ordem do tempo', () => {
    expect(ANOS).toEqual([2018, 2022, 2026]);
  });
});

describe('normalizarAnos', () => {
  it('põe na ordem 2018 → 2026, sem repetir', () => {
    expect(normalizarAnos([2026, 2018, 2026])).toEqual([2018, 2026]);
    expect(normalizarAnos([2026, 2022, 2018])).toEqual([2018, 2022, 2026]);
  });

  it('descarta o que não é uma das eleições da série', () => {
    expect(normalizarAnos([2019, 2022, 1998, Number.NaN, 2022.5])).toEqual([2022]);
  });

  it('nunca devolve vazio: sem nenhuma eleição válida, volta a todas', () => {
    expect(normalizarAnos([])).toEqual([2018, 2022, 2026]);
    expect(normalizarAnos([2019, 2030])).toEqual([2018, 2022, 2026]);
  });
});

describe('alternarAno', () => {
  it('desliga uma eleição ligada e mantém as outras na ordem', () => {
    expect(alternarAno([2018, 2022, 2026], 2022)).toEqual([2018, 2026]);
    expect(alternarAno([2018, 2022, 2026], 2018)).toEqual([2022, 2026]);
  });

  it('liga uma desligada no lugar dela no tempo, não no fim da lista', () => {
    expect(alternarAno([2022, 2026], 2018)).toEqual([2018, 2022, 2026]);
    expect(alternarAno([2018, 2026], 2022)).toEqual([2018, 2022, 2026]);
    expect(alternarAno([2018], 2026)).toEqual([2018, 2026]);
  });

  it('desligar a última ligada não faz nada: a seleção nunca fica vazia', () => {
    for (const ano of ANOS) expect(alternarAno([ano], ano)).toEqual([ano]);
  });

  it('por nenhuma sequência de cliques a seleção fica vazia nem fora de ordem', () => {
    const percorre = (anos: Ano[], restantes: number): void => {
      expect(anos.length).toBeGreaterThan(0);
      expect(anos).toEqual([...anos].sort((a, b) => a - b));
      if (restantes === 0) return;
      for (const ano of ANOS) percorre(alternarAno(anos, ano), restantes - 1);
    };
    percorre([...ANOS], 6);
  });

  it('não altera a lista recebida', () => {
    const antes: Ano[] = [2018, 2022];
    alternarAno(antes, 2026);
    expect(antes).toEqual([2018, 2022]);
  });
});

describe('anoTravado', () => {
  it('só a única eleição ligada fica travada', () => {
    expect(anoTravado([2022], 2022)).toBe(true);
    expect(anoTravado([2022], 2018)).toBe(false);
    expect(anoTravado([2018, 2022], 2022)).toBe(false);
    expect(anoTravado([...ANOS], 2026)).toBe(false);
  });
});

describe('lerHash', () => {
  it.each<[string, Ano[]]>([
    ['#2018,2026', [2018, 2026]],
    ['#2026', [2026]],
    ['#2018,2022,2026', [2018, 2022, 2026]],
    ['#2026,2018', [2018, 2026]],
    ['#2022,2022,2018', [2018, 2022]],
    ['#2018%2C2026', [2018, 2026]],
    ['2018,2026', [2018, 2026]],
    ['#2018, 2026', [2018, 2026]],
    ['#2018,2019,2026', [2018, 2026]],
  ])('%s vira %j', (hash, esperado) => {
    expect(lerHash(hash)).toEqual(esperado);
  });

  it.each(['', '#', '#2019', '#abc', '#secao-3', '#20182022', '#0x7E2', '#%E0%A4%A'])('"%s" não escolhe nada: abre com todas as eleições', (hash) => {
    expect(lerHash(hash)).toEqual([2018, 2022, 2026]);
  });
});

describe('hashDaSelecao', () => {
  it('todas as eleições é a página limpa, sem hash', () => {
    expect(hashDaSelecao([2018, 2022, 2026])).toBe('');
    expect(hashDaSelecao([])).toBe('');
  });

  it('um subconjunto vira "#" mais os anos, separados por vírgula e em ordem', () => {
    expect(hashDaSelecao([2018, 2026])).toBe('#2018,2026');
    expect(hashDaSelecao([2026])).toBe('#2026');
    expect(hashDaSelecao([2026, 2018])).toBe('#2018,2026');
  });

  it.each(SUBCONJUNTOS)('ida e volta: %j', (...anos) => {
    expect(lerHash(hashDaSelecao(anos))).toEqual(anos);
  });

  it('o hash nunca leva query string', () => {
    for (const anos of SUBCONJUNTOS) expect(hashDaSelecao(anos)).not.toContain('?');
  });
});

describe('pontosDaSelecao', () => {
  const json = lerSerieJson(JSON.parse(JSON.stringify(serieJsonBrasil(camadas))))!;
  const pontos = pontosDe(json)!;

  it.each(SUBCONJUNTOS)('%j: dois pontos (1º e 2º turno) por eleição, na ordem do tempo', (...anos) => {
    const escolhidos = pontosDaSelecao(pontos, anos);
    expect(escolhidos).toHaveLength(anos.length * 2);
    expect(escolhidos.map((p) => p.id)).toEqual(COLUNAS.filter((id) => anos.includes(Number(id.slice(0, 4)) as Ano)));
    expect(escolhidos.map((p) => p.turno)).toEqual(anos.flatMap(() => [1, 2]));
  });

  it('em 2026 o ponto do 2º turno continua lá, mesmo vazio (é ele que diz quando o 2º turno chega)', () => {
    const escolhidos = pontosDaSelecao(pontos, [2026]);
    expect(escolhidos.map((p) => p.id)).toEqual(['2026-t1', '2026-t2']);
    expect(escolhidos[1].a).toBeNull();
  });

  it('com o ao vivo, o ponto de 2026 chega com ele', () => {
    const vivo = lerAoVivo(
      { secoes_pct: 67, atualizado: '2026-10-25T18:42:10-03:00', presidente: { cand: [{ n: 13, nome: 'Lula', partido: 'PT', pct: 49.3 }, { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', pct: 50.7 }] } },
      'live',
    );
    expect(pontosDaSelecao(comAoVivo(pontos, vivo), [2026])[1].aoVivo?.fase).toBe('parcial');
  });

  it('nunca esvazia: sem eleição válida, devolve os seis pontos', () => {
    expect(pontosDaSelecao(pontos, [])).toHaveLength(6);
  });

  it('devolve os mesmos pontos, sem copiá-los nem mexer na lista original', () => {
    const escolhidos = pontosDaSelecao(pontos, [2022]);
    expect(escolhidos[0]).toBe(pontos[2]);
    expect(pontos).toHaveLength(6);
  });
});
