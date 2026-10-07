import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { LUGARES, type Lugar } from './cartograma.ts';
import { UFS, type Placar } from './contratos.ts';
import { MAPA_SETA, MAPA_SIGLA, MAPA_TITULO, PALAVRAS_PROIBIDAS, rotuloPlacaMapa } from './copy.ts';
import { histBr, histUf } from './dados.ts';
import { mapaApuracao, mapaPre, vista, type Placa, type PlacarMapa } from './mapa-dados.ts';

const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const lerJson = (...partes: string[]) => JSON.parse(readFileSync(join(raiz, ...partes), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const f of readdirSync(join(raiz, 'contracts/schemas'))) ajv.addSchema(lerJson('contracts/schemas', f));
const valida = (schema: string, dados: unknown) => {
  const validador = ajv.getSchema(`${schema}.schema.json`);
  if (!validador) throw new Error(`schema ${schema} não carregou`);
  return validador(dados) ? '' : ajv.errorsText(validador.errors);
};

const preHist = (l: Lugar) => (l === 'BR' ? histBr() : histUf(l));
const placares = (): Partial<Record<Lugar, Placar>> => ({
  BR: lerJson('contracts/fixtures/br.json'),
  ...Object.fromEntries(UFS.map((uf) => [uf, lerJson('contracts/fixtures/uf', `${uf.toLowerCase()}.json`)])),
});
const placa = (extra: Partial<Placa>): Placa => ({
  lugar: 'MA',
  nome: 'Maranhão',
  href: '/uf/ma',
  pct: { '13': 61.1, outros: 0, '22': 38.9 },
  variacao: 3.4,
  secoes: 87.3,
  ...extra,
});

describe('dados: hist-uf e hist-br (stubs fictícios)', () => {
  it('há um hist por UF e um do Brasil, todos válidos contra o schema hist', () => {
    const arquivos = readdirSync(join(raiz, 'site/src/data/hist-uf')).map((f) => f.replace('.json', ''));
    expect(arquivos.sort()).toEqual(UFS.map((uf) => uf.toLowerCase()).sort());
    for (const l of LUGARES) expect(valida('hist', preHist(l)), l).toBe('');
  });

  it('percentuais somam 100', () => {
    for (const l of LUGARES) {
      const h = preHist(l)!;
      expect(h.t1_2026.pct['13'] + h.t1_2026.pct['22'] + h.t1_2026.pct.outros, l).toBeCloseTo(100, 1);
      if (h.t2_2022) expect(h.t2_2022.pct['13'] + h.t2_2022.pct['22'], l).toBeCloseTo(100, 1);
    }
  });
});

describe('mapaPre: 1º turno 2026 (13 · outros · 22)', () => {
  const mapa = mapaPre(preHist);

  it('28 placas, na ordem de leitura do cartograma, com nome e link', () => {
    expect(mapa.fase).toBe('pre');
    expect(mapa.placas.map((p) => p.lugar)).toEqual(LUGARES);
    const ma = mapa.placas.find((p) => p.lugar === 'MA')!;
    expect([ma.nome, ma.href]).toEqual(['Maranhão', '/uf/ma']);
    const br = mapa.placas.find((p) => p.lugar === 'BR')!;
    expect([br.nome, br.href]).toEqual(['Brasil', '/']);
  });

  it('usa os três percentuais do hist e nunca tem seta (sem variação no 1º turno)', () => {
    for (const p of mapa.placas) {
      const t1 = preHist(p.lugar)!.t1_2026.pct;
      expect(p.pct).toEqual({ '13': t1['13'], outros: t1.outros, '22': t1['22'] });
      expect(p.variacao).toBeNull();
      expect(vista(p, 'pre').seta).toBe(false);
    }
  });

  it('sem hist, a placa fica sem dado em vez de inventar número', () => {
    const vazio = mapaPre(() => undefined);
    expect(vazio.placas.every((p) => p.pct === null)).toBe(true);
  });
});

describe('mapaApuracao: 2º turno a partir de /data/uf/*.json', () => {
  it('lê percentuais por número de urna e a variação do 13 vs 2022', () => {
    const mapa = mapaApuracao('parcial', placares(), '2026-10-25T18:42:10-03:00');
    const ma = mapa.placas.find((p) => p.lugar === 'MA')!;
    const json = placares().MA!;
    expect(ma.pct).toEqual({ '13': json.presidente.cand[0].pct, outros: 0, '22': json.presidente.cand[1].pct });
    expect(ma.variacao).toBe(json.presidente.variacao_2022['13']);
    expect(ma.secoes).toBe(json.secoes_pct);
    expect(mapa.secoes).toBe(placares().BR!.secoes_pct);
  });

  it('a proposta /data/mapa.json valida contra o schema e dá exatamente o mesmo mapa que os 28 arquivos', () => {
    const agregado = lerJson('contracts/fixtures/mapa.json');
    expect(valida('mapa', agregado)).toBe('');
    expect(mapaApuracao('final', agregado.placas, agregado.atualizado)).toEqual(
      mapaApuracao('final', placares(), placares().BR!.atualizado),
    );
  });

  it('tolera campos ausentes, candidatos fora de ordem e variação só do 22', () => {
    const entrada: Partial<Record<Lugar, PlacarMapa>> = {
      AC: {},
      AL: { secoes_pct: 0.4, presidente: { cand: [{ n: 13, pct: 0 }, { n: 22, pct: 0 }] } },
      AM: { secoes_pct: 50, presidente: { cand: [{ n: 22, pct: 40 }, { n: 13, pct: 60 }], variacao_2022: { '22': -2.5 } } },
      AP: { secoes_pct: 50, presidente: { cand: [{ n: 13, pct: 55 }, { n: 22, pct: 45 }] } },
    };
    const porLugar = new Map(mapaApuracao('parcial', entrada).placas.map((p) => [p.lugar, p]));
    expect(porLugar.get('AC')!.pct).toBeNull();
    expect(porLugar.get('AL')!.pct).toBeNull();
    expect(porLugar.get('SP')!.pct).toBeNull();
    expect(porLugar.get('AM')!.pct).toEqual({ '13': 60, outros: 0, '22': 40 });
    expect(porLugar.get('AM')!.variacao).toBe(2.5);
    expect(porLugar.get('AP')!.variacao).toBeNull();
  });
});

describe('vista: o que a placa e o painel mostram', () => {
  it('nome acessível sempre 13 antes de 22, mesmo com o 22 na frente', () => {
    const rotulo = vista(placa({ pct: { '13': 38.9, outros: 0, '22': 61.1 }, variacao: -3.4 }), 'parcial').rotulo;
    expect(rotulo).toBe('MA Maranhão: 13, 38,9%; 22, 61,1%; 22 lidera; +3,4 pontos para 22 em relação a 2022; parcial · 87% das seções');
    expect(rotulo.indexOf('13,')).toBeLessThan(rotulo.indexOf('22,'));
  });

  it('nome acessível no 1º turno, no final e aguardando', () => {
    expect(vista(placa({ pct: { '13': 52.3, outros: 8.1, '22': 39.6 }, variacao: null, secoes: null }), 'pre').rotulo).toBe(
      'MA Maranhão, 1º turno 2026: 13, 52,3%; outros candidatos, 8,1%; 22, 39,6%',
    );
    expect(vista(placa({ secoes: 100 }), 'final').rotulo).toBe(
      'MA Maranhão: 13, 61,1%; 22, 38,9%; +3,4 pontos para 13 em relação a 2022; final · 100% das seções',
    );
    expect(vista(placa({ pct: null }), 'parcial').rotulo).toBe('MA Maranhão: aguardando primeiras seções');
  });

  it('nome acessível começa pela sigla que a placa mostra (WCAG 2.5.3), em toda placa e fase', () => {
    for (const fase of ['pre', 'parcial', 'final'] as const) {
      const mapa = fase === 'pre' ? mapaPre(preHist) : mapaApuracao(fase, placares());
      for (const p of mapa.placas) expect(vista(p, fase).rotulo.startsWith(`${p.lugar} ${p.nome}`), `${fase} ${p.lugar}`).toBe(true);
    }
  });

  it('"lidera" só em parcial e nunca "eleito" (o mapa não recebe eleito)', () => {
    expect(vista(placa({}), 'parcial').rotulo).toContain('13 lidera');
    for (const fase of ['pre', 'final'] as const) expect(vista(placa({}), fase).rotulo).not.toContain('lidera');
    for (const fase of ['pre', 'parcial', 'final'] as const) expect(vista(placa({}), fase).rotulo).not.toMatch(/eleit/);
  });

  it('empate não "lidera" no texto', () => {
    expect(vista(placa({ pct: { '13': 50, outros: 0, '22': 50 } }), 'parcial').rotulo).not.toContain('lidera');
  });

  it('a sigla vai na cor de quem tem mais votos, pelo número de urna; empate, "outros" na frente e sem dado ficam neutros', () => {
    const cor = (pct: Placa['pct'], fase: 'pre' | 'parcial' | 'final') => vista(placa({ pct }), fase).maisVotado;
    expect(cor({ '13': 61.1, outros: 0, '22': 38.9 }, 'parcial')).toBe('13');
    expect(cor({ '13': 38.9, outros: 0, '22': 61.1 }, 'final')).toBe('22');
    expect(cor({ '13': 52.3, outros: 8.1, '22': 39.6 }, 'pre')).toBe('13');
    expect(cor({ '13': 30, outros: 34, '22': 36 }, 'pre')).toBe('22');
    expect(cor({ '13': 30, outros: 40, '22': 30 }, 'pre')).toBe('');
    expect(cor({ '13': 40, outros: 20, '22': 40 }, 'pre')).toBe('');
    expect(cor({ '13': 50, outros: 0, '22': 50 }, 'parcial')).toBe('');
    expect(cor(null, 'parcial')).toBe('');
  });

  it('nas 28 placas, Brasil incluído, a cor da sigla é a de quem de fato tem mais votos', () => {
    for (const fase of ['pre', 'parcial', 'final'] as const) {
      const mapa = fase === 'pre' ? mapaPre(preHist) : mapaApuracao(fase, placares());
      expect(mapa.placas.map((p) => p.lugar)).toContain('BR');
      for (const p of mapa.placas) {
        const { maisVotado } = vista(p, fase);
        if (!p.pct) expect(maisVotado, `${fase} ${p.lugar}`).toBe('');
        else if (maisVotado) expect(p.pct[maisVotado], `${fase} ${p.lugar}`).toBe(Math.max(p.pct['13'], p.pct['22'], p.pct.outros));
      }
    }
    const br = mapaApuracao('parcial', placares()).placas.find((p) => p.lugar === 'BR')!;
    expect(vista(br, 'parcial').maisVotado).toBe(br.pct!['13'] > br.pct!['22'] ? '13' : '22');
  });

  it('seta na placa só com |variação| >= 0,5 ponto, e sempre de quem ganhou terreno (o 22 ganha quando o 13 perde)', () => {
    expect(vista(placa({ variacao: 0.44 }), 'parcial')).toMatchObject({ ganhou: '13', seta: false, setaNumero: '' });
    expect(vista(placa({ variacao: 0.5 }), 'parcial')).toMatchObject({ ganhou: '13', seta: true, setaNumero: '+0,5' });
    expect(vista(placa({ variacao: -3.37 }), 'parcial')).toMatchObject({ ganhou: '22', seta: true, setaNumero: '+3,4' });
    expect(vista(placa({ variacao: null }), 'parcial')).toMatchObject({ ganhou: '', seta: false });
  });

  it('o painel mostra a variação a partir de 0,1 ponto; zero arredondado some', () => {
    expect(vista(placa({ variacao: 0.3 }), 'parcial')).toMatchObject({ variacao: '+0,3 ponto para 13 em relação a 2022', ganhou: '13' });
    expect(vista(placa({ variacao: 0.04 }), 'parcial')).toMatchObject({ variacao: '', ganhou: '' });
  });

  it('barra: 13 · outros · 22 em proporção e números formatados', () => {
    const v = vista(placa({ pct: { '13': 52.3, outros: 8.1, '22': 39.6 } }), 'pre');
    expect(v).toMatchObject({ a: '52,3%', o: '8,1%', b: '39,6%', estilo: '--a:52.3;--o:8.1;--b:39.6' });
  });

  it('nenhum texto do mapa usa palavra proibida', () => {
    const textos = [MAPA_TITULO, MAPA_SETA, ...Object.values(MAPA_SIGLA), ...(['pre', 'parcial', 'final'] as const).flatMap((f) => [
      vista(placa({}), f).rotulo,
      vista(placa({}), f).meta,
      vista(placa({}), f).variacao,
    ])].join(' ');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(textos).not.toContain(palavra);
  });
});

describe('copy do mapa', () => {
  it('rótulo da placa sem seções apuradas conhecidas não inventa percentual de seções', () => {
    expect(rotuloPlacaMapa('BA', 'Bahia', 'parcial', { '13': 60, outros: 0, '22': 40 }, null, null)).toBe('BA Bahia: 13, 60,0%; 22, 40,0%; 13 lidera');
  });
});
