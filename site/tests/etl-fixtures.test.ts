// Fixtures do 2º turno (FICTÍCIAS) sobre os dados reais: a camada ao-vivo cobre todos os municípios e conta a mesma
// história de br.json, uf/*.json e c/*.json. Rode `npm run fixtures` se estes testes acusarem fixture velha.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { type CamadaJson, lerCamada } from '../src/lib/camada-mapa.ts';
import type { Cidade, Hist, Municipio, Placar } from '../src/lib/contratos.ts';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const lerJson = <T>(...partes: string[]): T => JSON.parse(readFileSync(join(raiz, ...partes), 'utf8')) as T;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const f of readdirSync(join(raiz, 'contracts/schemas'))) ajv.addSchema(lerJson('contracts/schemas', f));

const municipios = lerJson<Municipio[]>('site/src/data/municipios.json');
const aoVivo = lerJson<CamadaJson>('contracts/fixtures/apuracao.json');
const br = lerJson<Placar>('contracts/fixtures/br.json');
const ufs = Object.fromEntries(
  readdirSync(join(raiz, 'contracts/fixtures/uf')).map((f) => [f.replace('.json', '').toUpperCase(), lerJson<Placar>('contracts/fixtures/uf', f)]),
);
const linhaDoPlacar = (p: Placar) => [p.presidente.cand[0]!.pct, p.presidente.cand[1]!.pct, 0, 0, p.secoes_pct];

describe('camada ao-vivo (apuracao.json)', () => {
  it('valida contra o schema e o front lê todas as linhas', () => {
    const validador = ajv.getSchema('camada-mapa.schema.json')!;
    expect(validador(aoVivo), ajv.errorsText(validador.errors)).toBe(true);
    expect(lerCamada(aoVivo)?.municipios.size).toBe(municipios.length);
  });

  it('id "ao-vivo", 13 Lula (vermelho) e 22 Flávio Bolsonaro (azul claro)', () => {
    expect(aoVivo.id).toBe('ao-vivo');
    expect(aoVivo.candidatos).toEqual([
      { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
      { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', cor: '22' },
    ]);
  });

  it('tem todos os municípios de municipios.json, e só eles', () => {
    expect(aoVivo.municipios.map((l) => l[0])).toEqual(municipios.map((m) => m.cod_ibge).sort((a, b) => a - b));
  });

  it('a linha do Brasil e as das 27 UFs são as de br.json e uf/*.json', () => {
    expect(aoVivo.br).toEqual(linhaDoPlacar(br));
    expect(Object.keys(aoVivo.ufs).sort()).toEqual(Object.keys(ufs).sort());
    for (const [uf, placar] of Object.entries(ufs)) expect(aoVivo.ufs[uf as keyof typeof aoVivo.ufs], uf).toEqual(linhaDoPlacar(placar));
  });

  it('o placar de cada UF fica entre o menor e o maior percentual dos seus municípios (o mapa não se contradiz)', () => {
    const ibgeParaUf = new Map(municipios.map((m) => [m.cod_ibge, m.uf]));
    for (const [uf, placar] of Object.entries(ufs)) {
      const pcts = aoVivo.municipios.filter((l) => ibgeParaUf.get(l[0]) === uf && l[5]! >= 1).map((l) => l[1]!);
      expect(placar.presidente.cand[0]!.pct, uf).toBeGreaterThanOrEqual(Math.min(...pcts));
      expect(placar.presidente.cand[0]!.pct, uf).toBeLessThanOrEqual(Math.max(...pcts));
    }
  });

  it('município sem 1% das seções fica zerado ("aguardando"); os demais somam 100', () => {
    for (const l of aoVivo.municipios) {
      if (l[5]! < 1) expect([l[1], l[2]], String(l[0])).toEqual([0, 0]);
      else expect(l[1]! + l[2]!, String(l[0])).toBeCloseTo(100, 1);
      expect([l[3], l[4]], String(l[0])).toEqual([0, 0]);
    }
  });
});

describe('c/*.json sobre os dados reais', () => {
  const cidades = readdirSync(join(raiz, 'contracts/fixtures/c')).map((f) => lerJson<Cidade>('contracts/fixtures/c', f));

  it('cada cidade da amostra repete nome, UF, códigos e eleitorado reais', () => {
    const porSlug = new Map(municipios.map((m) => [m.slug, m]));
    for (const c of cidades) {
      const m = porSlug.get(c.slug);
      expect({ nome: c.nome, uf: c.uf, cod_tse: c.cod_tse, cod_ibge: c.cod_ibge, eleitores: c.eleitores }, c.slug).toEqual({
        nome: m?.nome,
        uf: m?.uf,
        cod_tse: m?.cod_tse,
        cod_ibge: m?.cod_ibge,
        eleitores: m?.eleitores,
      });
    }
  });

  it('a variação vs 2022 é contra o 2º turno real de 2022', () => {
    for (const c of cidades) {
      const hist = lerJson<Hist>('site/src/data/hist', `${c.slug}.json`);
      const [a, b] = c.presidente.cand;
      if (!hist.t2_2022 || c.secoes_pct < 1) {
        expect(c.presidente.variacao_2022, c.slug).toEqual({});
        continue;
      }
      expect(c.presidente.variacao_2022['13'], c.slug).toBeCloseTo(a!.pct - hist.t2_2022.pct['13'], 2);
      expect(c.presidente.variacao_2022['22'], c.slug).toBeCloseTo(b!.pct - hist.t2_2022.pct['22'], 2);
    }
  });

  it('a linha da cidade na camada ao-vivo é a de c/{slug}.json', () => {
    const porIbge = new Map(aoVivo.municipios.map((l) => [l[0], l]));
    for (const c of cidades) {
      const l = porIbge.get(c.cod_ibge)!;
      expect(l.slice(1), c.slug).toEqual([c.presidente.cand[0]!.pct, c.presidente.cand[1]!.pct, 0, 0, c.secoes_pct]);
    }
  });
});
