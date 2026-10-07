// Valida os schemas de /contracts, as fixtures geradas e os dados estáticos (municipios + hist) contra eles.
// Rode `npm run fixtures` antes se as fixtures mudaram; este teste lê contracts/fixtures (fonte), não public/data.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const lerJson = (...partes: string[]) => JSON.parse(readFileSync(join(raiz, ...partes), 'utf8'));
const jsons = (...partes: string[]) =>
  readdirSync(join(raiz, ...partes))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ arquivo: f, slug: f.replace(/\.json$/, ''), dados: lerJson(...partes, f) }));

const UFS_COM_GOVERNADOR = ['AC', 'AM', 'DF', 'ES', 'RJ', 'RN', 'TO'];
const TODAS_UFS = lerJson('contracts/schemas/common.schema.json').$defs.uf.enum as string[];

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const f of readdirSync(join(raiz, 'contracts/schemas'))) ajv.addSchema(lerJson('contracts/schemas', f));

function validar(schema: string, dados: unknown, nome: string) {
  const validador = ajv.getSchema(`${schema}.schema.json`);
  if (!validador) throw new Error(`schema ${schema} não carregou`);
  const ok = validador(dados);
  expect(ok, `${nome}: ${ajv.errorsText(validador.errors)}`).toBe(true);
}

type Cargo = { cand: Array<{ n: number; pct: number; votos: number; eleito: boolean }> };
const cargos = (c: { presidente: Cargo; governador: Cargo | null }): Cargo[] => [c.presidente, ...(c.governador ? [c.governador] : [])];

describe('schemas', () => {
  it('todos compilam em draft 2020-12', () => {
    for (const nome of ['status', 'placar', 'cidade', 'hist', 'rankings', 'municipios']) {
      expect(ajv.getSchema(`${nome}.schema.json`), nome).toBeTypeOf('function');
    }
  });
});

describe('fixtures: status', () => {
  it.each([
    ['status.json', 'pre'],
    ['status.live.json', 'live'],
    ['status.final.json', 'final'],
  ])('%s é válido e está em modo %s', (arquivo, modo) => {
    const dados = lerJson('contracts/fixtures', arquivo);
    validar('status', dados, arquivo);
    expect(dados.modo).toBe(modo);
  });
});

describe('fixtures: placares (br e uf)', () => {
  const ufs = jsons('contracts/fixtures/uf');
  const placares = [{ slug: 'br', dados: lerJson('contracts/fixtures/br.json') }, ...ufs];

  it('existem as 27 UFs, em minúsculas', () => {
    expect(ufs.map((u) => u.slug).sort()).toEqual(TODAS_UFS.map((u) => u.toLowerCase()).sort());
  });

  it('todos validam contra o schema', () => {
    for (const { slug, dados } of placares) validar('placar', dados, slug);
  });

  it('governador existe só em AC, AM, DF, ES, RJ, RN e TO', () => {
    for (const { slug, dados } of ufs) {
      expect(dados.governador !== null, slug).toBe(UFS_COM_GOVERNADOR.includes(slug.toUpperCase()));
    }
    expect(placares[0].dados.governador).toBeNull();
  });

  it('candidatos em ordem de urna (13 antes de 22), percentuais somam ~100, eleito nunca inferido', () => {
    for (const { slug, dados } of placares) {
      const [a, b] = dados.presidente.cand;
      expect([a.n, b.n], slug).toEqual([13, 22]);
      expect(a.pct + b.pct, slug).toBeCloseTo(100, 1);
      expect([a.eleito, b.eleito], slug).toEqual([false, false]);
    }
  });

  it('comparecimento + abstenção ~ 100', () => {
    for (const { slug, dados } of placares) expect(dados.comparecimento_pct + dados.abstencao_pct, slug).toBeCloseTo(100, 0);
  });
});

describe('fixtures: cidades', () => {
  const cidades = jsons('contracts/fixtures/c');
  const municipios = lerJson('site/src/data/municipios.json') as Array<{ slug: string; uf: string }>;

  it('c/ tem só a amostra de 50 cidades, cada uma um município real, nomeada pelo slug', () => {
    const slugs = new Set(municipios.map((m) => m.slug));
    expect(cidades).toHaveLength(50);
    for (const { slug, dados } of cidades) {
      expect(slugs.has(slug), slug).toBe(true);
      expect(dados.slug).toBe(slug);
    }
  });

  it('todas validam contra o schema', () => {
    for (const { slug, dados } of cidades) validar('cidade', dados, slug);
  });

  it('governador só nas cidades das 7 UFs; candidatos em ordem de urna; percentuais somam ~100 quando há voto', () => {
    for (const { slug, dados } of cidades) {
      expect(dados.governador !== null, slug).toBe(UFS_COM_GOVERNADOR.includes(dados.uf));
      for (const cargo of cargos(dados)) {
        const [a, b] = cargo.cand;
        expect(a.n, slug).toBeLessThan(b.n);
        if (a.votos + b.votos > 0) expect(a.pct + b.pct, slug).toBeCloseTo(100, 1);
        expect([a.eleito, b.eleito], slug).toEqual([false, false]);
      }
      expect(dados.presidente.cand.map((c: { n: number }) => c.n), slug).toEqual([13, 22]);
    }
  });

  it('virou e rank.virada_uf são coerentes', () => {
    for (const { slug, dados } of cidades) expect(dados.rank.virada_uf !== null, slug).toBe(dados.virou);
  });

  it('cobre os casos de borda das fixtures', () => {
    const margemPts = (c: (typeof cidades)[number]['dados']) => Math.abs(c.presidente.cand[0].pct - c.presidente.cand[1].pct);
    const dados = cidades.map((c) => c.dados);
    expect(dados.some((c) => c.virou), 'virou=true').toBe(true);
    expect(dados.some((c) => c.secoes_pct >= 1 && margemPts(c) < 1), 'margem < 1 ponto').toBe(true);
    expect(dados.some((c) => c.presidente.cand.some((x: { pct: number }) => x.pct === 100)), '100% para um lado').toBe(true);
    expect(dados.some((c) => c.secoes_pct < 1), 'secoes_pct < 1').toBe(true);
    expect(dados.some((c) => Object.keys(c.presidente.variacao_2022).length === 0 && c.secoes_pct >= 1), 'sem 2022').toBe(true);
    expect(new Set(dados.map((c) => c.selos.length)).size, 'selos variados').toBeGreaterThan(1);
  });
});

describe('fixtures: rankings', () => {
  const rankings = lerJson('contracts/fixtures/rankings.json');
  const slugs = new Set((lerJson('site/src/data/municipios.json') as Array<{ slug: string }>).map((m) => m.slug));

  it('valida contra o schema e só cita slugs existentes', () => {
    validar('rankings', rankings, 'rankings.json');
    for (const lista of Object.values(rankings) as string[][]) for (const slug of lista) expect(slugs.has(slug), slug).toBe(true);
  });

  it('capitais = as 27 capitais', () => {
    expect(rankings.capitais).toHaveLength(27);
  });
});

describe('dados estáticos: municipios e hist', () => {
  const municipios = lerJson('site/src/data/municipios.json') as Array<{ slug: string }>;
  const hist = jsons('site/src/data/hist');

  it('municipios.json valida contra o schema', () => {
    validar('municipios', municipios, 'municipios.json');
  });

  it('há um hist por município e todos validam', () => {
    expect(hist.map((h) => h.slug).sort()).toEqual(municipios.map((m) => m.slug).sort());
    for (const { slug, dados } of hist) validar('hist', dados, slug);
  });

  it('percentuais do hist somam ~100', () => {
    for (const { slug, dados } of hist) {
      const t1 = dados.t1_2026.pct;
      expect(t1['13'] + t1['22'] + t1.outros, slug).toBeCloseTo(100, 1);
      if (dados.t2_2022) expect(dados.t2_2022.pct['13'] + dados.t2_2022.pct['22'], slug).toBeCloseTo(100, 1);
    }
  });

});
