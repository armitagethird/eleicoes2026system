// Valida os dados reais gerados pelo ETL (municipios.json, public/mapa/*.json, hist, hist-uf, hist-br) contra os schemas,
// entre si e contra os números oficiais do TSE. Lê os arquivos commitados: não usa rede nem o cache dos zips.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { comparecimentoPct, percentual } from '../scripts/etl/camada.ts';
import { type CamadaJson, lerCamada, type Linha } from '../src/lib/camada-mapa.ts';
import type { Hist, Municipio } from '../src/lib/contratos.ts';
import { slugMunicipio } from '../src/lib/slug.ts';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const lerJson = <T>(...partes: string[]): T => JSON.parse(readFileSync(join(raiz, ...partes), 'utf8')) as T;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const f of readdirSync(join(raiz, 'contracts/schemas'))) ajv.addSchema(lerJson('contracts/schemas', f));

function valida(schema: string, dados: unknown, nome: string) {
  const validador = ajv.getSchema(`${schema}.schema.json`);
  if (!validador) throw new Error(`schema ${schema} não carregou`);
  expect(validador(dados), `${nome}: ${ajv.errorsText(validador.errors)}`).toBe(true);
}

const municipios = lerJson<Municipio[]>('site/src/data/municipios.json');
const porIbge = new Map(municipios.map((m) => [m.cod_ibge, m]));
const porSlug = new Map(municipios.map((m) => [m.slug, m]));
const IDS = ['2018-t1', '2018-t2', '2022-t1', '2022-t2', '2026-t1'] as const;
const camadas = Object.fromEntries(IDS.map((id) => [id, lerJson<CamadaJson>('site/public/mapa', `${id}.json`)])) as Record<(typeof IDS)[number], CamadaJson>;
// Dígitos iniciais do código IBGE de cada UF.
const UF_IBGE: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28,
  BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};

const BOA_ESPERANCA_DO_NORTE = 5101837; // criado depois de 2022: sem votos em 2018 e 2022
const soma = (l: readonly number[]) => Math.round((l[0]! + l[1]! + l[2]!) * 100) / 100;

describe('municipios.json', () => {
  const fontes = lerJson<Array<{ arquivo: string; municipios: number | null }>>('site/src/data/fontes.json');
  const contagem = (arquivo: string) => fontes.find((f) => f.arquivo === arquivo)?.municipios;

  it('tem tantos municípios quanto a fonte lista (IBGE, centroides e de-para do TSE), e a contagem não é fixa', () => {
    expect(contagem('ibge-municipios.json')).toBeGreaterThan(5000);
    expect(municipios).toHaveLength(contagem('ibge-municipios.json')!);
    expect(contagem('ibge-centroides.json')).toBe(municipios.length);
    expect(contagem('tse-municipios-2026.json')).toBe(municipios.length);
  });

  it('valida contra o schema', () => {
    valida('municipios', municipios, 'municipios.json');
  });

  it('slugs únicos, na regra nome-uf; códigos IBGE e TSE únicos', () => {
    expect(new Set(municipios.map((m) => m.slug)).size).toBe(municipios.length);
    for (const m of municipios) expect(m.slug, m.nome).toBe(slugMunicipio(m.nome, m.uf));
    expect(new Set(municipios.map((m) => m.cod_ibge)).size).toBe(municipios.length);
    expect(new Set(municipios.map((m) => m.cod_tse)).size).toBe(municipios.length);
  });

  it('as 27 UFs, todo município com eleitorado e código IBGE da sua UF', () => {
    expect(new Set(municipios.map((m) => m.uf)).size).toBe(27);
    for (const m of municipios) {
      expect(m.eleitores, m.slug).toBeGreaterThan(0);
      expect(m.cod_ibge.toString().startsWith(String(UF_IBGE[m.uf])), m.slug).toBe(true);
    }
  });

  it('o código do TSE não é o do IBGE: São Luís e São Paulo batem com o site do TSE', () => {
    expect(porSlug.get('sao-luis-ma')).toMatchObject({ cod_ibge: 2111300, cod_tse: 9210 });
    expect(porSlug.get('sao-paulo-sp')).toMatchObject({ cod_ibge: 3550308, cod_tse: 71072 });
    expect(porSlug.get('boa-esperanca-do-norte-mt')).toMatchObject({ cod_ibge: BOA_ESPERANCA_DO_NORTE, cod_tse: 73709 });
  });
});

describe.each(IDS)('camada %s', (id) => {
  const camada = camadas[id];
  const linhas: Array<[string, readonly number[]]> = [
    ['br', camada.br],
    ...Object.entries(camada.ufs).map(([uf, l]): [string, readonly number[]] => [uf, l as Linha]),
    ...camada.municipios.map((l): [string, readonly number[]] => [String(l[0]), l.slice(1)]),
  ];

  it('valida contra o schema e o front lê todas as linhas', () => {
    valida('camada-mapa', camada, id);
    const lida = lerCamada(camada);
    expect(lida?.municipios.size).toBe(camada.municipios.length);
    expect(lida?.ufs.size).toBe(27);
    expect(lida?.br).not.toBeNull();
  });

  it('A + B + outros somam 100 (±0,2) em toda linha, com 100% das seções', () => {
    for (const [nome, l] of linhas) {
      expect(Math.abs(soma(l) - 100), `${id} ${nome}`).toBeLessThanOrEqual(0.2);
      expect(l[4], `${id} ${nome}`).toBe(100);
    }
  });

  it('todo ibge existe em municipios.json, sem repetir, em ordem crescente', () => {
    const codigos = camada.municipios.map((l) => l[0]);
    for (const c of codigos) expect(porIbge.has(c), String(c)).toBe(true);
    expect(codigos).toEqual([...new Set(codigos)].sort((a, b) => a - b));
  });

  it('cobre todos os municípios que existiam na eleição', () => {
    const esperados = municipios.length - (id === '2026-t1' ? 0 : 1);
    expect(camada.municipios).toHaveLength(esperados);
    expect(camada.municipios.some((l) => l[0] === BOA_ESPERANCA_DO_NORTE)).toBe(id === '2026-t1');
  });

  it('candidatos: A é o 13 (vermelho) e B o Bolsonaro (azul claro; 17 em 2018)', () => {
    const [a, b] = camada.candidatos;
    expect([a.n, a.cor]).toEqual([13, '13']);
    expect([b.n, b.cor]).toEqual([id.startsWith('2018') ? 17 : 22, '22']);
    expect(camada.rotulo).toBe(`${id.endsWith('t1') ? '1º' : '2º'} turno ${id.slice(0, 4)}`);
  });

  it(id.endsWith('t2') ? '2º turno: sem "outros" e sem líder de fora' : '1º turno: líder de fora é um número de urna de dois dígitos', () => {
    for (const [nome, l] of linhas) {
      if (id.endsWith('t2')) {
        expect([l[2], l[3]], `${id} ${nome}`).toEqual([0, 0]);
        expect(soma(l), `${id} ${nome}`).toBe(100);
      } else {
        expect(l[3] === 0 || (l[3]! >= 10 && l[3]! <= 99), `${id} ${nome}`).toBe(true);
      }
    }
  });
});

// Relatório Resultado da Totalização do TSE (Brasil), presidente: votos válidos e votos em A e B.
// Conferido contra o PDF de cada eleição: 295/296 (2018), 544/545 (2022) e 6257 (2026, 05/10/2026).
const OFICIAL: Record<(typeof IDS)[number], { validos: number; a: number; b: number }> = {
  '2018-t1': { validos: 107_050_749, a: 31_342_051, b: 49_277_010 },
  '2018-t2': { validos: 104_838_753, a: 47_040_906, b: 57_797_847 },
  '2022-t1': { validos: 118_229_719, a: 57_259_504, b: 51_072_345 },
  '2022-t2': { validos: 118_552_353, a: 60_345_999, b: 58_206_354 },
  '2026-t1': { validos: 119_300_788, a: 53_879_538, b: 56_104_503 },
};

describe('totais nacionais contra o resultado oficial do TSE', () => {
  it.each(IDS)('%s: percentuais de A, B e dos demais', (id) => {
    const { validos, a, b } = OFICIAL[id];
    const pa = percentual(a, validos);
    const segundoTurno = id.endsWith('t2');
    const pb = segundoTurno ? Math.round((100 - pa) * 100) / 100 : percentual(b, validos);
    expect(camadas[id].br).toEqual([pa, pb, segundoTurno ? 0 : percentual(validos - a - b, validos), 0, 100]);
  });

  it('percentuais publicados pelo TSE (Bolsonaro 55,13% em 2018, Lula 50,90% em 2022, Flávio 47,03% e Lula 45,16% em 2026)', () => {
    expect(camadas['2018-t2'].br.slice(0, 2)).toEqual([44.87, 55.13]);
    expect(camadas['2018-t1'].br.slice(0, 2)).toEqual([29.28, 46.03]);
    expect(camadas['2022-t2'].br.slice(0, 2)).toEqual([50.9, 49.1]);
    expect(camadas['2022-t1'].br.slice(0, 2)).toEqual([48.43, 43.2]);
    expect(camadas['2026-t1'].br.slice(0, 2)).toEqual([45.16, 47.03]);
  });

  it('comparecimento do Brasil (eleitorado apto e comparecimento do relatório)', () => {
    const brasil = lerJson<Hist>('site/src/data/hist-br.json');
    expect(brasil.t2_2022?.comparecimento_pct).toBe(comparecimentoPct({ aptos: 156_454_011, comparecimento: 124_252_796 }));
    expect(brasil.t1_2026.comparecimento_pct).toBe(comparecimentoPct({ aptos: 158_745_502, comparecimento: 125_275_835 }));
  });
});

describe('UFs contra os relatórios de totalização por UF do TSE', () => {
  // [camada, UF, pct A, pct B]: "Resultado de votação" de cada relatório (545 SP/RS/MA de 2022, 296 SP de 2018, 6257 de 2026).
  it.each([
    ['2018-t2', 'SP', 32.03, 67.97],
    ['2022-t2', 'SP', 44.76, 55.24],
    ['2022-t2', 'RS', 43.65, 56.35],
    ['2022-t2', 'MA', 71.14, 28.86],
    ['2026-t1', 'MA', 63.99, 30.9],
    ['2026-t1', 'SP', 38.2, 51.93],
    ['2026-t1', 'RS', 35.73, 55.64],
  ] as const)('%s %s', (id, uf, a, b) => {
    expect(camadas[id].ufs[uf]?.slice(0, 2)).toEqual([a, b]);
  });

  it('2018, 1º turno: Ciro Gomes (12) lidera no Ceará com 40,95%, e a linha guarda o número dele (relatório 295 do CE)', () => {
    expect(camadas['2018-t1'].ufs.CE).toEqual([33.12, 21.74, 45.13, 12, 100]);
    expect(camadas['2022-t1'].municipios.every((l) => l[4] === 0)).toBe(true);
  });

  it('comparecimento (hist-uf)', () => {
    const uf = (sigla: string) => lerJson<Hist>('site/src/data/hist-uf', `${sigla}.json`);
    expect([uf('ma').t2_2022?.comparecimento_pct, uf('ma').t1_2026.comparecimento_pct]).toEqual([76.49, 80.27]);
    expect([uf('sp').t2_2022?.comparecimento_pct, uf('sp').t1_2026.comparecimento_pct]).toEqual([78.94, 77.46]);
    expect([uf('rs').t2_2022?.comparecimento_pct, uf('rs').t1_2026.comparecimento_pct]).toEqual([80.69, 78.65]);
  });
});

describe('cidades contra o site resultados.tse.jus.br (1º turno 2026, conferido em 06/10/2026)', () => {
  // [slug, pct 13, pct 22]: São Luís também tem comparecimento (642.000 de 761.443 aptos = 84,31%).
  it.each([
    ['sao-luis-ma', 54.51, 37.02],
    ['sao-paulo-sp', 46.58, 42.13],
    ['curitiba-pr', 30.37, 57.5],
    ['bora-sp', 30.05, 65.33],
    ['boa-esperanca-do-norte-mt', 23.96, 70.34],
  ] as const)('%s', (slug, p13, p22) => {
    const linha = camadas['2026-t1'].municipios.find((l) => l[0] === porSlug.get(slug)?.cod_ibge);
    expect(linha?.slice(1, 3)).toEqual([p13, p22]);
    expect(lerJson<Hist>('site/src/data/hist', `${slug}.json`).t1_2026.pct).toMatchObject({ '13': p13, '22': p22 });
  });

  it('comparecimento de São Luís', () => {
    expect(lerJson<Hist>('site/src/data/hist/sao-luis-ma.json').t1_2026.comparecimento_pct).toBe(84.31);
    expect(comparecimentoPct({ aptos: 761_443, comparecimento: 642_000 })).toBe(84.31);
  });
});

describe('hist, hist-uf e hist-br', () => {
  const arquivos = readdirSync(join(raiz, 'site/src/data/hist')).filter((f) => f.endsWith('.json'));
  const hist = (slug: string) => lerJson<Hist>('site/src/data/hist', `${slug}.json`);

  it('um hist por município, nomeado pelo slug, e todos validam', () => {
    expect(arquivos.map((f) => f.replace(/\.json$/, '')).sort()).toEqual(municipios.map((m) => m.slug).sort());
    for (const f of arquivos) valida('hist', hist(f.replace(/\.json$/, '')), f);
  });

  it('percentuais somam 100 (±0,2) e o comparecimento cabe em 0 a 100', () => {
    for (const f of arquivos) {
      const h = hist(f.replace(/\.json$/, ''));
      const t1 = h.t1_2026.pct;
      expect(Math.abs(t1['13'] + t1['22'] + t1.outros - 100), f).toBeLessThanOrEqual(0.2);
      if (h.t2_2022) expect(Math.abs(h.t2_2022.pct['13'] + h.t2_2022.pct['22'] - 100), f).toBeLessThanOrEqual(0.2);
    }
  });

  it('t2_2022 é null só no município criado depois de 2022', () => {
    const sem2022 = arquivos.filter((f) => hist(f.replace(/\.json$/, '')).t2_2022 === null);
    expect(sem2022).toEqual(['boa-esperanca-do-norte-mt.json']);
  });

  it('bate com as camadas: mesma linha de 2022-t2 e 2026-t1 do município', () => {
    const linha = (id: (typeof IDS)[number], ibge: number) => camadas[id].municipios.find((l) => l[0] === ibge)!;
    for (const slug of ['sao-luis-ma', 'campinas-sp', 'serra-da-saudade-mg', 'abadia-de-goias-go', 'zortea-sc']) {
      const m = porSlug.get(slug)!;
      const h = hist(slug);
      expect([h.t1_2026.pct['13'], h.t1_2026.pct['22'], h.t1_2026.pct.outros], slug).toEqual(linha('2026-t1', m.cod_ibge).slice(1, 4));
      expect([h.t2_2022?.pct['13'], h.t2_2022?.pct['22']], slug).toEqual(linha('2022-t2', m.cod_ibge).slice(1, 3));
    }
  });

  it('hist-uf: as 27 UFs, e hist-br valida', () => {
    const ufs = readdirSync(join(raiz, 'site/src/data/hist-uf')).filter((f) => f.endsWith('.json'));
    expect(ufs.map((f) => f.replace('.json', '').toUpperCase()).sort()).toEqual(Object.keys(UF_IBGE).sort());
    for (const f of ufs) valida('hist', lerJson('site/src/data/hist-uf', f), f);
    valida('hist', lerJson('site/src/data/hist-br.json'), 'hist-br.json');
  });

  it('hist-uf e hist-br repetem as linhas de UF e Brasil das camadas', () => {
    const ma = lerJson<Hist>('site/src/data/hist-uf/ma.json');
    expect([ma.t2_2022?.pct['13'], ma.t1_2026.pct['13']]).toEqual([camadas['2022-t2'].ufs.MA?.[0], camadas['2026-t1'].ufs.MA?.[0]]);
    const br = lerJson<Hist>('site/src/data/hist-br.json');
    expect([br.t2_2022?.pct['13'], br.t1_2026.pct.outros]).toEqual([camadas['2022-t2'].br[0], camadas['2026-t1'].br[2]]);
  });
});
