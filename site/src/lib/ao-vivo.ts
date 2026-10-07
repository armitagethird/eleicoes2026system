// Lógica pura da ilha ao vivo (components/AoVivo.ts): que JSON ler, qual o modo, o que mudou, quando buscar de novo e o que o
// Placar mostra. Sem DOM e sem rede: a ilha só liga isto aos elementos. Tolera campos ausentes em tudo (brief, seção 6).
import type { Candidato, CargoPlacar } from './contratos.ts';
import { linhaApuracao, rotuloPosicao, semConexao, variacao2022 } from './copy.ts';
import { corCandidato } from './cores.ts';
import { percentual } from './format.ts';
import type { Modo, Status } from './status.ts';
import { variacaoDe } from './variacao.ts';

export { EVENTO_MODO, esperaPre, modoParaAnunciar } from './ao-vivo-pre.ts';

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const PAGINA = /^(br|uf\/[a-z]{2}|c\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** "br", "uf/rj" ou "c/sao-luis-ma" viram o JSON de /data. Qualquer outra coisa é null: a ilha nunca pede nada fora de /data. */
export function caminhoDados(pagina: string | undefined): string | null {
  return pagina !== undefined && PAGINA.test(pagina) ? `/data/${pagina}.json` : null;
}

/** O modo é o do status.json lido; falha de rede (null) mantém o que a página já mostra. */
export function decidirModo(lido: Status | null, atual: Modo): Modo {
  return lido ? lido.modo : atual;
}

const FALHAS_PARA_AVISAR = 2;

export interface EstadoAoVivo {
  /** secoes_pct < 1: "aguardando primeiras seções". Seção ausente ou inválida não inventa o estado. */
  aguardando: boolean;
  /** copy.semConexao com a hora da última atualização boa; null enquanto a rede aguenta ou nunca houve dado bom. */
  semConexao: string | null;
}

export function estadoAoVivo({ secoesPct, falhas, ultimaBoa }: { secoesPct: number | undefined; falhas: number; ultimaBoa: string | null }): EstadoAoVivo {
  return {
    aguardando: finito(secoesPct) && secoesPct < 1,
    semConexao: falhas >= FALHAS_PARA_AVISAR && ultimaBoa !== null ? semConexao(ultimaBoa) : null,
  };
}

const BASE_MS: Record<'live' | 'final', number> = { live: 20_000, final: 60_000 };
const TETO_MS = 60_000;
const JITTER = 0.1;

/**
 * Espera até o próximo fetch da página. Ao vivo, 20 s; cada falha dobra a espera até 60 s (não martelar um servidor doente).
 * Em final, 60 s (só para pegar correção tardia). Pre não faz polling (null). O jitter de 10% desencontra os aparelhos.
 */
export function intervaloPolling(modo: Modo, falhas: number, aleatorio: () => number = Math.random): number | null {
  if (modo === 'pre') return null;
  const espera = Math.min(TETO_MS, BASE_MS[modo] * 2 ** falhas);
  return espera * (1 - JITTER + 2 * JITTER * aleatorio());
}

type Lista = Array<Record<string, unknown> & { n: number }>;
const lista = (x: unknown[]): x is Lista => x.every((item) => objeto(item) && finito(item.n));

function mesclarLista(anterior: unknown[], novo: unknown[]): unknown[] {
  if (!lista(anterior) || !lista(novo)) return novo;
  const porNumero = new Map(anterior.map((c) => [c.n, c]));
  for (const c of novo) {
    const existente = porNumero.get(c.n);
    porNumero.set(c.n, existente ? mesclar(existente, c) : c);
  }
  return [...porNumero.values()].sort((a, b) => a.n - b.n);
}

/**
 * Funde o JSON novo no último bom, sem nunca apagar um valor bom: campo ausente, nulo, número inválido ou de outro tipo
 * mantém o anterior. Listas de candidatos (objetos com `n`) fundem pelo número de urna e saem em ordem 13 → 22. Não altera
 * o que recebe.
 */
export function mesclar<T>(anterior: T, novo: unknown): T {
  if (novo === undefined || novo === null) return anterior;
  if (Array.isArray(novo)) {
    if (Array.isArray(anterior)) return mesclarLista(anterior, novo) as T;
    return (anterior === undefined ? novo : anterior) as T;
  }
  if (objeto(novo)) {
    if (!objeto(anterior)) return (anterior === undefined ? novo : anterior) as T;
    const saida: Record<string, unknown> = { ...anterior };
    for (const [chave, valor] of Object.entries(novo)) {
      const fundido = mesclar(anterior[chave], valor);
      if (fundido !== undefined) saida[chave] = fundido;
    }
    return saida as T;
  }
  if (typeof novo === 'number' && !Number.isFinite(novo)) return anterior;
  if (anterior !== undefined && typeof anterior !== typeof novo) return anterior;
  return novo as T;
}

function achatar(valor: unknown, caminho: string, saida: Map<string, string>): void {
  if (valor === undefined || valor === null) return;
  if (Array.isArray(valor) && lista(valor)) {
    for (const item of valor) achatar(item, `${caminho}.${item.n}`, saida);
  } else if (objeto(valor)) {
    for (const [chave, interno] of Object.entries(valor)) achatar(interno, caminho ? `${caminho}.${chave}` : chave, saida);
  } else {
    saida.set(caminho, JSON.stringify(valor));
  }
}

/** Caminhos (ordenados) dos valores que mudaram entre dois JSONs, o candidato pelo número de urna: "presidente.cand.22.pct". Vazio = nada a fazer. */
export function diferencas(anterior: unknown, atual: unknown): string[] {
  const antes = new Map<string, string>();
  const depois = new Map<string, string>();
  achatar(anterior, '', antes);
  achatar(atual, '', depois);
  return [...new Set([...antes.keys(), ...depois.keys()])].filter((c) => antes.get(c) !== depois.get(c)).sort();
}

export interface LadoVista {
  n: number;
  nome: string;
  partido: string;
  pct: number | null;
  /** Percentual sem o sinal ("49,3"): o % é desenhado à parte. */
  texto: string;
  /** A cor é do número de urna (lib/cores.ts), nunca da posição nem de quem lidera. */
  cor: string;
  rotulo: 'lidera' | 'eleito' | 'eleita' | null;
}

export interface SetaVista {
  /** 0 = coluna da esquerda (13), 1 = da direita (22). */
  lado: 0 | 1;
  cor: string;
  numero: string;
  resto: string;
}

export interface PlacarVista {
  aguardando: boolean;
  /** Em ordem de número de urna, 13 antes de 22; menos de dois só quando o JSON veio incompleto. */
  lados: LadoVista[];
  seta: SetaVista | null;
  longo: boolean;
  linha: string | null;
}

const MIN_VARIACAO = 0.05;
const LONGO = 99.95;

/** O cargo como chega da rede: o front tolera qualquer campo ausente, inclusive nos candidatos. */
interface CargoTolerante {
  cand?: Array<Partial<Candidato>>;
  variacao_2022?: CargoPlacar['variacao_2022'];
}

/**
 * O que um Placar (components/Placar.astro) mostra em live ou final, as mesmas regras dele: 13 antes de 22; "lidera" só em
 * parcial e só para quem está na frente (empate: ninguém); "eleito" só com eleito: true no JSON; seta para quem ganhou
 * terreno vs 2022; secoes_pct < 1 ou candidato faltando: aguardando.
 */
export function vistaPlacar(
  cargo: CargoTolerante | undefined,
  modo: 'live' | 'final',
  secoesPct: number | undefined,
  atualizado: string | null | undefined,
): PlacarVista {
  const cand = (cargo?.cand ?? []).filter((c): c is Partial<Candidato> & { n: number } => finito(c?.n)).sort((a, b) => a.n - b.n).slice(0, 2);
  const completo = cand.length === 2 && cand.every((c) => finito(c.pct));
  const aguardando = !completo || (finito(secoesPct) && secoesPct < 1);
  const [p0, p1] = cand.map((c) => c.pct ?? 0);
  const lider = !aguardando && p0 !== p1 ? (p0 > p1 ? 0 : 1) : null;

  const lados = cand.map((c, i): LadoVista => {
    const pct = finito(c.pct) ? c.pct : null;
    let rotulo: LadoVista['rotulo'] = null;
    if (!aguardando) {
      if (modo === 'live' && i === lider) rotulo = rotuloPosicao(false);
      if (modo === 'final' && c.eleito === true) rotulo = rotuloPosicao(true);
    }
    return {
      n: c.n,
      nome: c.nome ?? '',
      partido: c.partido ?? '',
      pct,
      texto: pct === null ? '' : percentual(pct).replace('%', ''),
      cor: corCandidato(c.n, i === 0 ? 0 : 1).css,
      rotulo,
    };
  });

  let seta: SetaVista | null = null;
  if (!aguardando) {
    const ganhou = cand
      .map((c, i) => ({ i, v: variacaoDe(cargo?.variacao_2022, c.n, cand[1 - i].n) }))
      .filter((x): x is { i: 0 | 1; v: number } => finito(x.v) && x.v >= MIN_VARIACAO)
      .sort((a, b) => b.v - a.v)[0];
    if (ganhou) {
      const [numero, ...resto] = variacao2022(cand[ganhou.i].nome ?? String(cand[ganhou.i].n), ganhou.v).split(' ');
      seta = { lado: ganhou.i, cor: lados[ganhou.i].cor, numero, resto: resto.join(' ') };
    }
  }

  return {
    aguardando,
    lados,
    seta,
    longo: !aguardando && (p0 >= LONGO || p1 >= LONGO),
    linha: finito(secoesPct) ? linhaApuracao(modo === 'live' ? 'parcial' : 'final', secoesPct, atualizado) : null,
  };
}
