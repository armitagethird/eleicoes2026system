// Transforma os agregados do TSE nos formatos do site: camada do mapa (contracts/schemas/camada-mapa.schema.json) e hist.
import type { CamadaJson, Linha } from '../../src/lib/camada-mapa.ts';
import type { Hist, UF } from '../../src/lib/contratos.ts';
import type { Agregado } from './agregar.ts';
import type { Eleicao } from './fontes.ts';

/** Votos válidos por número de urna. */
export type Votos = Readonly<Record<string, number>>;

export interface Resumo {
  votos: Votos;
  aptos: number;
  comparecimento: number;
}

const total = (votos: Votos): number => Object.values(votos).reduce((soma, v) => soma + v, 0);

export function acumular(destino: Record<string, number>, votos: Votos): void {
  for (const [numero, v] of Object.entries(votos)) destino[numero] = (destino[numero] ?? 0) + v;
}

/** Percentual com 2 casas, arredondamento comum, em aritmética inteira (como o site do TSE: 70,34 e não 70,33 para 2243 de 3189). */
export const percentual = (votos: number, validos: number): number => Math.round((votos * 10_000) / validos) / 100;

/** [pct A, pct B, pct outros, quem lidera quando não é A nem B (0 = A ou B), % das seções]. null sem nenhum voto válido. */
export function calcularLinha(votos: Votos, a: number, b: number): Linha | null {
  const validos = total(votos);
  if (validos === 0) return null;
  const votosA = votos[a] ?? 0;
  const votosB = votos[b] ?? 0;
  const votosOutros = validos - votosA - votosB;
  const pa = percentual(votosA, validos);
  // Sem terceiro (2º turno) o segundo é o complemento do primeiro, para somar 100,00 mesmo quando os dois arredondam para cima.
  const pb = votosOutros === 0 ? Math.round((100 - pa) * 100) / 100 : percentual(votosB, validos);
  const po = votosOutros === 0 ? 0 : percentual(votosOutros, validos);

  let lider = 0;
  let maior = Math.max(votosA, votosB);
  for (const [numero, v] of Object.entries(votos).sort(([x], [y]) => Number(x) - Number(y))) {
    if (Number(numero) !== a && Number(numero) !== b && v > maior) {
      lider = Number(numero);
      maior = v;
    }
  }
  // Resultado final: 100% das seções apuradas (o relatório de totalização do TSE não tem seção pendente).
  return [pa, pb, po, lider, 100];
}

export function montarCamada(eleicao: Eleicao, agregado: Agregado, ibgePorTse: ReadonlyMap<number, number>): CamadaJson {
  const [a, b] = eleicao.candidatos.map((c) => c.n) as [number, number];
  const brasil: Record<string, number> = {};
  const porUf = new Map<string, Record<string, number>>();
  const municipios: [number, ...Linha][] = [];

  for (const [codigo, m] of Object.entries(agregado.municipios)) {
    acumular(brasil, m.votos);
    if (m.uf === 'ZZ') continue;
    const ibge = ibgePorTse.get(Number(codigo));
    if (ibge === undefined) {
      if (total(m.votos) > 0) throw new Error(`${eleicao.id}: município ${m.nome}/${m.uf} (TSE ${codigo}) tem votos e não está em municipios.json`);
      continue;
    }
    let votosUf = porUf.get(m.uf);
    if (!votosUf) porUf.set(m.uf, (votosUf = {}));
    acumular(votosUf, m.votos);
    const linha = calcularLinha(m.votos, a, b);
    if (linha) municipios.push([ibge, ...linha]);
  }

  const ufs: Partial<Record<UF, Linha>> = {};
  for (const [uf, votos] of [...porUf].sort(([x], [y]) => x.localeCompare(y))) {
    const linha = calcularLinha(votos, a, b);
    if (linha) ufs[uf as UF] = linha;
  }
  const br = calcularLinha(brasil, a, b);
  if (!br) throw new Error(`${eleicao.id}: nenhum voto válido no Brasil`);

  return {
    v: 1,
    id: eleicao.id,
    rotulo: eleicao.rotulo,
    atualizado: agregado.atualizado,
    candidatos: eleicao.candidatos,
    br,
    ufs,
    municipios: municipios.sort((x, y) => x[0] - y[0]),
  };
}

/** Um município por linha: o diff do git fica legível e o gzip, igual. */
export function serializarCamada({ municipios, ...cabecalho }: CamadaJson): string {
  return `${JSON.stringify(cabecalho).slice(0, -1)},"municipios":[\n${municipios.map((l) => JSON.stringify(l)).join(',\n')}\n]}\n`;
}

export const comparecimentoPct = ({ aptos, comparecimento }: Pick<Resumo, 'aptos' | 'comparecimento'>): number =>
  Math.round((comparecimento / aptos) * 10_000) / 100;

/** hist de uma cidade, UF ou do Brasil. `t2_2022` é null quando o lugar não tinha votos em 2022 (município criado depois). */
export function montarHist(t2_2022: Resumo | undefined, t1_2026: Resumo): Hist {
  const linha2026 = calcularLinha(t1_2026.votos, 13, 22);
  if (!linha2026 || t1_2026.aptos <= 0) throw new Error('hist sem votos válidos ou eleitorado no 1º turno de 2026');
  const linha2022 = t2_2022 && t2_2022.aptos > 0 ? calcularLinha(t2_2022.votos, 13, 22) : null;
  return {
    t2_2022: linha2022 && t2_2022 ? { pct: { '13': linha2022[0], '22': linha2022[1] }, comparecimento_pct: comparecimentoPct(t2_2022) } : null,
    t1_2026: { pct: { '13': linha2026[0], '22': linha2026[1], outros: linha2026[2] }, comparecimento_pct: comparecimentoPct(t1_2026) },
  };
}
