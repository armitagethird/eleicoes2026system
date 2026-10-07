// Série histórica de /historico: os seis pontos do eixo X (1º e 2º turno de 2018, 2022 e 2026) para o Brasil, uma UF ou
// uma cidade. Pura, sem DOM nem rede: o build escreve /historico/{br,uf}.json a partir das camadas (public/mapa) e a ilha
// os lê, junta o ao vivo (br.json, uf/{uf}.json ou c/{slug}.json) e entrega a lista de pontos a lib/grafico-linha.ts.
import type { Camada, CandidatoCamada, Valor } from './camada-mapa.ts';
import { NOME_UF, type Municipio, type UF } from './contratos.ts';
import type { Modo } from './status.ts';

/** As camadas históricas, na ordem do eixo X. O 2º turno de 2026 não tem camada: vem do ao vivo. */
export const IDS_HIST = ['2018-t1', '2018-t2', '2022-t1', '2022-t2', '2026-t1'] as const;
export type IdHist = (typeof IDS_HIST)[number];
export type IdColuna = IdHist | '2026-t2';
export const COLUNAS: readonly IdColuna[] = [...IDS_HIST, '2026-t2'];

/** As eleições da série, na ordem do tempo: o gráfico mostra qualquer subconjunto não vazio delas. */
export const ANOS = [2018, 2022, 2026] as const;
export type Ano = (typeof ANOS)[number];

/** [pct A, pct B, pct outros], sobre votos válidos. No 2º turno "outros" é 0. */
export type Linha3 = [number, number, number];
type Linhas = Array<Linha3 | null>;

/** /historico/br.json e /historico/{uf}.json: um arquivo pequeno por escopo, escrito no build. `cidades` só nos de UF. */
export interface SerieJson {
  v: 1;
  nome: string;
  /** Os dois candidatos de cada camada: em 2018 o de Bolsonaro é o 17 (PSL) e a cor segue o campo `cor`. */
  cand: Array<{ id: IdHist; a: CandidatoCamada; b: CandidatoCamada }>;
  /** Uma linha por camada, na ordem de IDS_HIST; null quando o escopo não existia na eleição. */
  linhas: Linhas;
  /** slug -> linhas, no mesmo formato. */
  cidades?: Record<string, Linhas>;
}

export interface Lado {
  n: number;
  nome: string;
  partido: string;
  cor: '13' | '22' | null;
  pct: number;
}

export interface Ponto {
  id: IdColuna;
  ano: Ano;
  turno: 1 | 2;
  /** O candidato do PT (13) e o de Bolsonaro: A antes de B, sempre. null = sem dado neste ponto. */
  a: Lado | null;
  b: Lado | null;
  /** Soma dos demais candidatos; só no 1º turno. */
  outros: number | null;
  /** Só no 2º turno de 2026, quando o ao vivo chegou. */
  aoVivo?: { fase: 'parcial' | 'final'; secoesPct: number; atualizado: string };
}

export interface AoVivo {
  a: Lado;
  b: Lado;
  fase: 'parcial' | 'final';
  secoesPct: number;
  atualizado: string;
}

const linha3 = (v: Valor | null | undefined): Linha3 | null => (v ? [v.a, v.b, v.outros] : null);

function candidatosDe(camadas: Readonly<Record<IdHist, Camada>>): SerieJson['cand'] {
  return IDS_HIST.map((id) => ({ id, a: camadas[id].candidatos[0], b: camadas[id].candidatos[1] }));
}

export function serieJsonBrasil(camadas: Readonly<Record<IdHist, Camada>>): SerieJson {
  return { v: 1, nome: 'Brasil', cand: candidatosDe(camadas), linhas: IDS_HIST.map((id) => linha3(camadas[id].br)) };
}

export function serieJsonUf(camadas: Readonly<Record<IdHist, Camada>>, municipios: readonly Municipio[], uf: UF): SerieJson {
  const cidades: Record<string, Linhas> = {};
  for (const m of municipios) {
    if (m.uf === uf) cidades[m.slug] = IDS_HIST.map((id) => linha3(camadas[id].municipios.get(m.cod_ibge)));
  }
  return {
    v: 1,
    nome: NOME_UF[uf],
    cand: candidatosDe(camadas),
    linhas: IDS_HIST.map((id) => linha3(camadas[id].ufs.get(uf))),
    cidades,
  };
}

const pct = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;

function lerLinhas(bruto: unknown): Linhas | null {
  if (!Array.isArray(bruto) || bruto.length !== IDS_HIST.length) return null;
  const linhas: Linhas = [];
  for (const linha of bruto) {
    if (linha === null) linhas.push(null);
    else if (Array.isArray(linha) && linha.length === 3 && linha.every(pct)) linhas.push(linha as Linha3);
    else return null;
  }
  return linhas;
}

function lerCandidato(bruto: unknown): CandidatoCamada | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const { n, nome, partido, cor } = bruto as Record<string, unknown>;
  if (!Number.isInteger(n) || typeof nome !== 'string' || typeof partido !== 'string') return null;
  return { n: n as number, nome, partido, cor: cor === '13' || cor === '22' ? cor : null };
}

/** Lê um /historico/*.json sem lançar: o que não tem o formato vira null (a ilha mostra o erro e deixa tentar de novo). */
export function lerSerieJson(bruto: unknown): SerieJson | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const o = bruto as Record<string, unknown>;
  if (o.v !== 1 || typeof o.nome !== 'string' || !Array.isArray(o.cand) || o.cand.length !== IDS_HIST.length) return null;
  const cand: SerieJson['cand'] = [];
  for (const [i, c] of o.cand.entries()) {
    const { id, a, b } = (c ?? {}) as Record<string, unknown>;
    const [candA, candB] = [lerCandidato(a), lerCandidato(b)];
    if (id !== IDS_HIST[i] || !candA || !candB) return null;
    cand.push({ id: IDS_HIST[i], a: candA, b: candB });
  }
  const linhas = lerLinhas(o.linhas);
  if (!linhas) return null;

  const cidades: Record<string, Linhas> = {};
  if (typeof o.cidades === 'object' && o.cidades !== null) {
    for (const [slug, bruta] of Object.entries(o.cidades)) {
      const lidas = lerLinhas(bruta);
      if (lidas) cidades[slug] = lidas;
    }
  }
  return { v: 1, nome: o.nome, cand, linhas, ...(o.cidades ? { cidades } : {}) };
}

/** Os seis pontos do eixo X do escopo: o Brasil/UF do arquivo, ou a cidade `slug` dele (null se não estiver lá). */
export function pontosDe(json: SerieJson, cidade?: string): Ponto[] | null {
  const linhas = cidade === undefined ? json.linhas : json.cidades && Object.hasOwn(json.cidades, cidade) ? json.cidades[cidade] : null;
  if (!linhas) return null;
  return COLUNAS.map((id, i): Ponto => {
    const [ano, turno] = [Number(id.slice(0, 4)) as Ponto['ano'], Number(id.slice(-1)) as Ponto['turno']];
    const linha = linhas[i];
    const cand = json.cand[i];
    if (!linha || !cand) return { id, ano, turno, a: null, b: null, outros: null };
    return {
      id,
      ano,
      turno,
      a: { ...cand.a, pct: linha[0] },
      b: { ...cand.b, pct: linha[1] },
      outros: turno === 1 ? linha[2] : null,
    };
  });
}

const corDoNumero = (n: number): Lado['cor'] => (n === 13 ? '13' : n === 22 ? '22' : null);

function ladoAoVivo(bruto: unknown): Lado | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const { n, nome, partido, pct: valor } = bruto as Record<string, unknown>;
  if (!Number.isInteger(n) || typeof nome !== 'string' || !pct(valor)) return null;
  return { n: n as number, nome, partido: typeof partido === 'string' ? partido : '', cor: corDoNumero(n as number), pct: valor };
}

/**
 * O 2º turno de 2026 a partir do JSON ao vivo do escopo (br.json, uf/{uf}.json ou c/{slug}.json). Sem ponto (null):
 * modo pre, leitura inválida, ou menos de 1% das seções ("aguardando primeiras seções"). Os dois candidatos saem pelo
 * número de urna (13 antes de 22), qualquer que seja a ordem do arquivo.
 */
export function lerAoVivo(bruto: unknown, modo: Modo): AoVivo | null {
  if (modo === 'pre' || typeof bruto !== 'object' || bruto === null) return null;
  const { secoes_pct: secoes, atualizado, presidente } = bruto as Record<string, unknown>;
  const cand = (presidente as { cand?: unknown } | null | undefined)?.cand;
  if (!Array.isArray(cand) || typeof secoes !== 'number' || !Number.isFinite(secoes) || secoes < 1) return null;
  const lados = cand.map(ladoAoVivo).filter((l): l is Lado => l !== null).sort((x, y) => x.n - y.n);
  if (lados.length !== 2 || cand.length !== 2) return null;
  return {
    a: lados[0],
    b: lados[1],
    fase: modo === 'final' ? 'final' : 'parcial',
    secoesPct: Math.min(100, secoes),
    atualizado: typeof atualizado === 'string' ? atualizado : '',
  };
}

/** Nova leitura do ao vivo: nunca apaga a última boa (leitura incompleta) nem volta no tempo (uma borda do CDN pode servir um arquivo mais velho). */
export function mesclarAoVivo(anterior: AoVivo | null, nova: AoVivo | null): AoVivo | null {
  if (!nova) return anterior;
  if (anterior && Date.parse(nova.atualizado) < Date.parse(anterior.atualizado)) return anterior;
  return nova;
}

/** Põe o ao vivo no último ponto (2º turno de 2026). Sem ao vivo, devolve a lista como veio. */
export function comAoVivo(pontos: readonly Ponto[], vivo: AoVivo | null): Ponto[] {
  if (!vivo) return [...pontos];
  const { a, b, ...aoVivo } = vivo;
  return pontos.map((p) => (p.id === '2026-t2' ? { ...p, a, b, aoVivo } : p));
}

/** Seleção de eleições: sem repetição, na ordem 2018 → 2026, só anos da série. Vazia vira "todas": nunca fica vazia. */
export const normalizarAnos = (anos: readonly number[] = []): Ano[] => {
  const escolhidos = ANOS.filter((ano) => anos.includes(ano));
  return escolhidos.length ? escolhidos : [...ANOS];
};

/** A única eleição ligada não pode ser desligada. */
export const anoTravado = (anos: readonly Ano[], ano: Ano): boolean => anos.length === 1 && anos[0] === ano;

/** Liga ou desliga uma eleição; desligar a última ligada não faz nada. */
export function alternarAno(anos: readonly Ano[], ano: Ano): Ano[] {
  if (anoTravado(anos, ano)) return [...anos];
  return normalizarAnos(anos.includes(ano) ? anos.filter((a) => a !== ano) : [...anos, ano]);
}

/** "#2018,2026" (ou "2018%2C2026") vira os anos; o que não escolhe nenhum ano da série vira todos. Nunca lança. */
export function lerHash(hash: string): Ano[] {
  const anos = hash
    .replace(/^#/, '')
    .replace(/%2c/gi, ',')
    .split(',')
    .map((trecho) => trecho.trim())
    .filter((trecho) => /^\d{4}$/.test(trecho))
    .map(Number);
  return normalizarAnos(anos);
}

/** O hash da seleção: "" com todas as eleições (a página limpa), senão "#" e os anos em ordem, ex.: "#2018,2026". Nunca leva query string. */
export function hashDaSelecao(anos: readonly number[]): string {
  const escolhidos = normalizarAnos(anos);
  return escolhidos.length === ANOS.length ? '' : `#${escolhidos.join(',')}`;
}

/** Os pontos das eleições escolhidas (dois por eleição), na ordem do eixo X. Sem escolha válida, todos. */
export function pontosDaSelecao(pontos: readonly Ponto[], anos?: readonly number[]): Ponto[] {
  const escolhidos = normalizarAnos(anos);
  return pontos.filter((p) => escolhidos.includes(p.ano));
}
