// O simulador de dev (contracts/scripts/simular.ts) reescreve /data de 5% a 100% das seções. Estes testes conferem o que
// seria vergonhoso na tela: o Brasil que não fecha com as UFs, seção que anda para trás, cidade com número impossível,
// "eleito" antes da hora e arquivo que o contrato (schemas) recusaria.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { estadoNoProgresso, lerFixtures } from '../../contracts/scripts/simular.ts';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const fx = lerFixtures(raiz);
const PASSOS = [0.05, 0.2, 0.5, 0.77, 0.99, 1];

const lerJson = (...partes: string[]) => JSON.parse(readFileSync(join(raiz, ...partes), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const f of readdirSync(join(raiz, 'contracts/schemas'))) ajv.addSchema(lerJson('contracts/schemas', f));

function valida(schema: string, dados: unknown, nome: string): void {
  const validador = ajv.getSchema(`${schema}.schema.json`);
  if (!validador) throw new Error(`schema ${schema} não carregou`);
  expect(validador(dados), `${nome}: ${ajv.errorsText(validador.errors)}`).toBe(true);
}

const votosDe = (cargo: { cand: Array<{ votos: number }> }): number[] => cargo.cand.map((c) => c.votos);

describe('simulador: o estado em cada ponto da apuração', () => {
  it('é determinístico: o mesmo ponto dá os mesmos arquivos', () => {
    expect(estadoNoProgresso(0.37, fx)).toEqual(estadoNoProgresso(0.37, fx));
  });

  it('antes do fim o status é live; em 100% é final', () => {
    expect(estadoNoProgresso(0.5, fx).status.modo).toBe('live');
    expect(estadoNoProgresso(0.99, fx).status.modo).toBe('live');
    expect(estadoNoProgresso(1, fx).status.modo).toBe('final');
  });

  it('o Brasil é a soma das UFs em todo momento, nos votos e nos brancos e nulos', () => {
    for (const p of PASSOS) {
      const s = estadoNoProgresso(p, fx);
      const ufs = Object.values(s.ufs);
      for (const i of [0, 1]) {
        expect(s.br.presidente.cand[i].votos, `p=${p} cand ${i}`).toBe(ufs.reduce((t, u) => t + u.presidente.cand[i].votos, 0));
      }
      expect(s.br.presidente.brancos, `p=${p} brancos`).toBe(ufs.reduce((t, u) => t + u.presidente.brancos, 0));
      expect(s.br.presidente.nulos, `p=${p} nulos`).toBe(ufs.reduce((t, u) => t + u.presidente.nulos, 0));
    }
  });

  it('em 100% os números são os das fixtures (a simulação converge para elas)', () => {
    const s = estadoNoProgresso(1, fx);
    expect(votosDe(s.br.presidente)).toEqual(votosDe(fx.br.presidente));
    for (const [uf, placar] of Object.entries(s.ufs)) {
      expect(votosDe(placar.presidente), uf).toEqual(votosDe(fx.ufs[uf].presidente));
      if (placar.governador) expect(votosDe(placar.governador), `${uf} governador`).toEqual(votosDe(fx.ufs[uf].governador as never));
    }
    for (const [slug, cidade] of Object.entries(s.cidades)) {
      expect(votosDe(cidade.presidente), slug).toEqual(votosDe(fx.cidades[slug].presidente));
      expect(cidade.secoes_pct, slug).toBe(100);
    }
    expect(s.br.secoes_pct).toBe(100);
  });

  it('as seções só crescem de um passo para o seguinte (Brasil, UFs e cidades)', () => {
    let anterior = estadoNoProgresso(PASSOS[0], fx);
    for (const p of PASSOS.slice(1)) {
      const atual = estadoNoProgresso(p, fx);
      expect(atual.br.secoes_pct).toBeGreaterThanOrEqual(anterior.br.secoes_pct);
      for (const uf of Object.keys(atual.ufs)) expect(atual.ufs[uf].secoes_pct, `${uf} p=${p}`).toBeGreaterThanOrEqual(anterior.ufs[uf].secoes_pct);
      for (const slug of Object.keys(atual.cidades)) expect(atual.cidades[slug].secoes_pct, `${slug} p=${p}`).toBeGreaterThanOrEqual(anterior.cidades[slug].secoes_pct);
      anterior = atual;
    }
  });

  it('a 5% o Brasil e as UFs já têm números e há cidades aguardando, sem percentual inventado', () => {
    const s = estadoNoProgresso(0.05, fx);
    expect(s.br.secoes_pct).toBeGreaterThanOrEqual(1);
    for (const uf of Object.values(s.ufs)) expect(uf.secoes_pct).toBeGreaterThanOrEqual(1);
    const aguardando = Object.values(s.cidades).filter((c) => c.secoes_pct < 1);
    expect(aguardando.length).toBeGreaterThan(0);
    for (const c of aguardando) {
      expect(c.presidente.cand.map((x) => x.pct)).toEqual([0, 0]);
      expect(votosDe(c.presidente)).toEqual([0, 0]);
      expect(c.presidente.diferenca_votos).toBe(0);
    }
  });

  it('13 antes de 22, percentuais fecham em 100 e a diferença de votos confere', () => {
    for (const p of PASSOS) {
      const s = estadoNoProgresso(p, fx);
      const cargos = [s.br.presidente, ...Object.values(s.ufs).map((u) => u.presidente), ...Object.values(s.cidades).map((c) => c.presidente)];
      for (const c of cargos) {
        expect(c.cand.map((x) => x.n)).toEqual([13, 22]);
        const [a, b] = c.cand;
        if (a.votos + b.votos > 0) expect(a.pct + b.pct).toBeCloseTo(100, 1);
      }
      for (const c of Object.values(s.cidades)) {
        const [a, b] = c.presidente.cand;
        expect(c.presidente.diferenca_votos).toBe(Math.abs(a.votos - b.votos));
      }
    }
  });

  it('"eleito" só no fim: o líder do Brasil e os governadores eleitos; nunca em cidade nem no presidente de uma UF', () => {
    const marcados = (s: ReturnType<typeof estadoNoProgresso>): string[] => {
      const achados: string[] = [];
      const olha = (nome: string, cargo: { cand: Array<{ n: number; eleito: boolean }> } | null) =>
        cargo?.cand.filter((c) => c.eleito).forEach((c) => achados.push(`${nome}:${c.n}`));
      olha('br', s.br.presidente);
      for (const [uf, p] of Object.entries(s.ufs)) {
        olha(`${uf}/presidente`, p.presidente);
        olha(`${uf}/governador`, p.governador);
      }
      for (const [slug, c] of Object.entries(s.cidades)) olha(slug, c.presidente);
      return achados;
    };
    expect(marcados(estadoNoProgresso(0.99, fx))).toEqual([]);
    const final = marcados(estadoNoProgresso(1, fx));
    const lider = fx.br.presidente.cand[0].votos > fx.br.presidente.cand[1].votos ? 13 : 22;
    expect(final).toContain(`br:${lider}`);
    expect(final.filter((m) => m.startsWith('br:'))).toHaveLength(1);
    expect(final.filter((m) => /\/governador:/.test(m))).toHaveLength(7);
    expect(final.filter((m) => /\/presidente:/.test(m))).toEqual([]);
    expect(final.filter((m) => !m.startsWith('br:') && !m.includes('/'))).toEqual([]);
  });

  it('as camadas do mapa contam a mesma história: UF, Brasil e cidade da amostra batem com os placares', () => {
    const s = estadoNoProgresso(0.42, fx);
    const { apuracao, mapa } = s;
    expect(apuracao).toBeDefined();
    expect(mapa).toBeDefined();
    expect(apuracao?.br).toEqual([s.br.presidente.cand[0].pct, s.br.presidente.cand[1].pct, 0, 0, s.br.secoes_pct]);
    for (const [uf, placar] of Object.entries(s.ufs)) {
      expect(apuracao?.ufs[uf], uf).toEqual([placar.presidente.cand[0].pct, placar.presidente.cand[1].pct, 0, 0, placar.secoes_pct]);
      expect(mapa?.placas[uf].secoes_pct, uf).toBe(placar.secoes_pct);
    }
    const porCodigo = new Map(apuracao?.municipios.map((linha) => [linha[0], linha]));
    for (const cidade of Object.values(s.cidades)) {
      const [a, b] = cidade.presidente.cand;
      expect(porCodigo.get(cidade.cod_ibge), cidade.slug).toEqual([cidade.cod_ibge, a.pct, b.pct, 0, 0, cidade.secoes_pct]);
    }
  });

  it('todos os arquivos gerados validam nos schemas do contrato', () => {
    for (const p of [0.05, 0.61, 1]) {
      const s = estadoNoProgresso(p, fx);
      valida('status', s.status, `status p=${p}`);
      valida('placar', s.br, `br p=${p}`);
      for (const [uf, placar] of Object.entries(s.ufs)) valida('placar', placar, `uf/${uf} p=${p}`);
      for (const [slug, cidade] of Object.entries(s.cidades)) valida('cidade', cidade, `c/${slug} p=${p}`);
      valida('camada-mapa', s.apuracao, `apuracao p=${p}`);
      valida('mapa', s.mapa, `mapa p=${p}`);
    }
  });
});
