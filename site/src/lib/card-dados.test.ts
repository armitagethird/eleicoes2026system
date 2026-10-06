import { describe, expect, it } from 'vitest';
import { SELO_VIROU } from './copy.ts';
import { cardDeCidade, cardDePlacar, comPalpite } from './card-dados.ts';
import type { Candidato, CargoCidade, Cidade, Hist, Placar } from './contratos.ts';
import { SITE_URL, X_HANDLE } from './site.ts';

const cand = (n: number, nome: string, partido: string, pct: number, votos: number): Candidato => ({ n, nome, partido, votos, pct, eleito: false });
const presidente: CargoCidade = {
  cand: [cand(22, 'Flávio Bolsonaro', 'PL', 38.87, 215329), cand(13, 'Lula', 'PT', 61.13, 338642)],
  variacao_2022: { '13': -2.61, '22': 2.61 },
  diferenca_votos: 123313,
};

const cidade: Cidade = {
  v: 1,
  slug: 'sao-luis-ma',
  nome: 'São Luís',
  uf: 'MA',
  cod_tse: 90010,
  cod_ibge: 2111300,
  eleitores: 788710,
  atualizado: '2026-10-25T18:42:10-03:00',
  secoes_pct: 87.3,
  presidente,
  governador: null,
  selos: [],
  rank: { dividida_br: null, dividida_uf: null, virada_uf: null },
  virou: false,
};

const hist: Hist = {
  t2_2022: { pct: { '13': 63.74, '22': 36.26 }, comparecimento_pct: 80 },
  t1_2026: { pct: { '13': 40, '22': 40, outros: 20 }, comparecimento_pct: 80 },
};

describe('cardDeCidade', () => {
  it('monta o card com os candidatos na ordem do número de urna, mesmo que o JSON venha invertido', () => {
    const card = cardDeCidade(cidade, hist, 'parcial');
    expect(card?.cand.map((c) => c.n)).toEqual([13, 22]);
    expect(card).toMatchObject({
      modo: 'parcial',
      local: 'São Luís',
      uf: 'MA',
      cargo: 'presidente',
      variacao: -2.61,
      diferencaVotos: 123313,
      secoesPct: 87.3,
      hora: '18:42',
    });
  });

  it('domínio e @ vêm de lib/site.ts', () => {
    const card = cardDeCidade(cidade, hist, 'parcial');
    expect(card?.dominio).toBe(new URL(SITE_URL).host);
    expect(card?.handle).toBe(X_HANDLE);
  });

  it('sem variação no JSON, calcula contra o 2º turno de 2022 do histórico; sem 2022, fica ausente', () => {
    const semVariacao = { ...cidade, presidente: { ...presidente, variacao_2022: {} } };
    expect(cardDeCidade(semVariacao, hist, 'parcial')?.variacao).toBeCloseTo(61.13 - 63.74, 6);
    expect(cardDeCidade(semVariacao, { ...hist, t2_2022: null }, 'parcial')?.variacao).toBeUndefined();
    expect(cardDeCidade(semVariacao, undefined, 'parcial')?.variacao).toBeUndefined();
  });

  it('usa a variação do 22 invertida quando só ela vem no JSON', () => {
    const so22 = { ...cidade, presidente: { ...presidente, variacao_2022: { '22': 2.61 } } };
    expect(cardDeCidade(so22, undefined, 'parcial')?.variacao).toBe(-2.61);
  });

  it('um selo por card: virou primeiro, depois o mais raro', () => {
    expect(cardDeCidade({ ...cidade, virou: true, selos: ['mais_dividida_uf'] }, hist, 'parcial')?.selo).toBe(SELO_VIROU);
    expect(cardDeCidade({ ...cidade, selos: ['mais_dividida_uf', 'maior_virada_br'] }, hist, 'parcial')?.selo).toBe('maior virada do Brasil');
    expect(cardDeCidade({ ...cidade, selos: ['mais_dividida_uf'] }, hist, 'parcial')?.selo).toBe('mais dividida do MA');
    expect(cardDeCidade(cidade, hist, 'parcial')?.selo).toBeUndefined();
  });

  it('governador: null quando o estado não tem; senão a margem, sem variação nem selo', () => {
    expect(cardDeCidade(cidade, hist, 'parcial', 'governador')).toBeNull();
    const governador: CargoCidade = {
      cand: [cand(45, 'B', 'FIC', 60, 600), cand(12, 'A', 'FIC', 40, 400)],
      variacao_2022: {},
      diferenca_votos: 200,
    };
    const card = cardDeCidade({ ...cidade, governador, virou: true }, hist, 'parcial', 'governador');
    expect(card).toMatchObject({ cargo: 'governador', variacao: undefined, selo: undefined, diferencaVotos: 200 });
    expect(card?.cand.map((c) => c.n)).toEqual([12, 45]);
  });

  it('tolera candidatos ausentes', () => {
    expect(cardDeCidade({ ...cidade, presidente: { ...presidente, cand: [] } }, hist, 'parcial')).toBeNull();
  });
});

describe('cardDePlacar', () => {
  const placar: Placar = {
    v: 1,
    turno: 2,
    atualizado: '2026-10-25T20:31:00-03:00',
    secoes_pct: 100,
    comparecimento_pct: 80,
    abstencao_pct: 20,
    presidente: {
      cand: [cand(13, 'Lula', 'PT', 51.5, 3356101), cand(22, 'Flávio Bolsonaro', 'PL', 48.5, 3160389)],
      variacao_2022: { '13': -6, '22': 6 },
      brancos: 0,
      nulos: 0,
    },
    governador: null,
  };

  it('UF ou Brasil: votos de diferença calculados dos candidatos', () => {
    const card = cardDePlacar(placar, { nome: 'Brasil', uf: 'BR' }, 'final');
    expect(card).toMatchObject({ modo: 'final', local: 'Brasil', uf: 'BR', variacao: -6, diferencaVotos: 195712, hora: '20:31' });
    expect(card?.selo).toBeUndefined();
  });

  it('governador ausente: null', () => {
    expect(cardDePlacar(placar, { nome: 'São Paulo', uf: 'SP' }, 'parcial', 'governador')).toBeNull();
  });
});

describe('comPalpite', () => {
  it('troca os percentuais pelo palpite e some com tudo que é resultado', () => {
    const base = cardDeCidade({ ...cidade, selos: ['mais_dividida_uf'] }, hist, 'parcial');
    const palpite = comPalpite(base as NonNullable<typeof base>, 57);
    expect(palpite.modo).toBe('palpite');
    expect(palpite.cand.map((c) => [c.n, c.pct, c.eleito])).toEqual([[13, 57, false], [22, 43, false]]);
    expect(palpite).toMatchObject({ variacao: undefined, diferencaVotos: undefined, selo: undefined });
  });
});
