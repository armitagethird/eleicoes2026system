// /apuracao: lógica pura das camadas, da comparação e dos destaques. Sem DOM nem rede: a ilha (components/apuracao/pagina.ts)
// busca os arquivos e o motor do mapa desenha; aqui só se decide o quê. A comparação entre eleições olha só os dois
// candidatos da camada, como a página de cidade (lib/cidade.ts, variacaoEntreDois): no 1º turno a fatia de A é refeita
// sobre os votos de A e B.
import type { Camada, Valor } from './camada-mapa.ts';
import { UFS, type Municipio, type UF } from './contratos.ts';
import type { Modo } from './status.ts';

export type IdCamada = 'ao-vivo' | '2026-t1' | '2022-t2' | '2022-t1' | '2018-t2' | '2018-t1';

export type Selecao = { tipo: 'uf'; uf: UF } | { tipo: 'municipio'; ibge: number; uf: UF };

/** O que o modo COMPARAR põe ao lado de cada camada: o mesmo turno da eleição anterior. */
export const REFERENCIA: Readonly<Record<IdCamada, IdCamada | null>> = {
  'ao-vivo': '2022-t2',
  '2026-t1': '2022-t1',
  '2022-t2': '2018-t2',
  '2022-t1': '2018-t1',
  '2018-t2': null,
  '2018-t1': null,
};

/** Ano da eleição de uma camada (o ao vivo é 2026). */
export const anoDe = (id: IdCamada): string => (id === 'ao-vivo' ? '2026' : id.slice(0, 4));

/**
 * Abas de eleição, da mais nova à mais antiga (o 1º turno de 2026 fica junto do 2º): antes do dia 25 só as apuradas, com o
 * 2º turno de 2022 aberto; a partir dele, o ao vivo na frente e aberto.
 */
export function abas(modo: Modo): { ids: readonly IdCamada[]; padrao: IdCamada } {
  const historicas: IdCamada[] = ['2026-t1', '2022-t2', '2022-t1'];
  return modo === 'pre' ? { ids: historicas, padrao: '2022-t2' } : { ids: ['ao-vivo', ...historicas], padrao: 'ao-vivo' };
}

/** Histórico em /mapa (gerado no build, não muda); o ao vivo em /data (worker, a cada 20 s). */
export const urlCamada = (id: IdCamada): string => (id === 'ao-vivo' ? '/data/apuracao.json' : `/mapa/${id}.json`);

export function valorDe(camada: Camada | null, sel: Selecao | null): Valor | null {
  if (!camada) return null;
  if (!sel) return camada.br;
  return (sel.tipo === 'uf' ? camada.ufs.get(sel.uf) : camada.municipios.get(sel.ibge)) ?? null;
}

/** Abaixo de 1% das seções o lugar está "aguardando primeiras seções" (brief, seção 6). */
export const comDados = (v: Valor | null | undefined): v is Valor => !!v && v.secoes >= 1 && v.a + v.b > 0;

const fatiaA = (v: Valor): number => (v.a / (v.a + v.b)) * 100;

/** Pontos que A ganhou desde a referência, só entre os dois (B ganhou o espelho). null sem dado de um dos lados. */
export function variacao(agora: Valor | null, antes: Valor | null): number | null {
  return comDados(agora) && comDados(antes) ? fatiaA(agora) - fatiaA(antes) : null;
}

/** Quem tem mais votos entre os dois: 0 = A, 1 = B, null = empate. */
export const quemLidera = (v: Valor): 0 | 1 | null => (v.a === v.b ? null : v.a > v.b ? 0 : 1);

/** Margem entre os dois, em pontos da fatia dos dois: 0 = empate, 100 = unânime. */
const margem = (v: Valor): number => (Math.abs(v.a - v.b) / (v.a + v.b)) * 100;

// Capitais pelo código IBGE (conferidas contra src/data/municipios.json no teste).
export const CAPITAIS: Readonly<Record<UF, number>> = {
  AC: 1200401, AL: 2704302, AM: 1302603, AP: 1600303, BA: 2927408, CE: 2304400, DF: 5300108, ES: 3205309, GO: 5208707,
  MA: 2111300, MG: 3106200, MS: 5002704, MT: 5103403, PA: 1501402, PB: 2507507, PE: 2611606, PI: 2211001, PR: 4106902,
  RJ: 3304557, RN: 2408102, RO: 1100205, RR: 1400100, RS: 4314902, SC: 4205407, SE: 2800308, SP: 3550308, TO: 1721000,
};

/** Um município do índice /mapa/municipios.json. */
export interface Lugar {
  ibge: number;
  slug: string;
  nome: string;
  uf: UF;
  eleitores: number;
}

export type LinhaIndice = [ibge: number, slug: string, nome: string, uf: string, eleitores: number];

/** O índice servido em /mapa/municipios.json: compacto, porque são 5.571 linhas. */
export const linhasIndice = (municipios: readonly Municipio[]): LinhaIndice[] =>
  municipios.map((m): LinhaIndice => [m.cod_ibge, m.slug, m.nome, m.uf, m.eleitores]).sort((a, b) => a[0] - b[0]);

const SIGLAS = new Set<string>(UFS);

/** Lê o índice sem lançar: linha malformada é descartada. */
export function lerIndice(bruto: unknown): Map<number, Lugar> {
  const indice = new Map<number, Lugar>();
  for (const linha of Array.isArray(bruto) ? bruto : []) {
    if (!Array.isArray(linha)) continue;
    const [ibge, slug, nome, uf, eleitores] = linha;
    if (!Number.isInteger(ibge) || typeof slug !== 'string' || typeof nome !== 'string' || !SIGLAS.has(uf)) continue;
    indice.set(ibge, { ibge, slug, nome, uf: uf as UF, eleitores: Number.isFinite(eleitores) ? eleitores : 0 });
  }
  return indice;
}

export interface Destaque {
  ibge: number;
  lugar: Lugar;
  /** null só nas capitais, que aparecem mesmo sem dado ("aguardando"). */
  valor: Valor | null;
  variacao: number | null;
}

export interface Destaques {
  dividida: Destaque[];
  unanime: Destaque[];
  virada: Destaque[];
  capitais: Destaque[];
}

/**
 * Os quatro destaques da camada no foco (Brasil ou uma UF), entre os municípios do índice com dado:
 * - dividida e unânime: menor e maior margem entre os dois; fica de fora quem teve um terceiro na frente (1º turno);
 * - virada: quem mudou de lado entre os dois desde a referência, pela maior variação;
 * - capitais: as do foco, em ordem alfabética, mesmo sem dado.
 * Empates saem pelo código IBGE, para a lista não trocar de ordem entre duas atualizações iguais.
 */
export function destaques(
  camada: Camada,
  referencia: Camada | null,
  indice: ReadonlyMap<number, Lugar>,
  foco: UF | null,
  limite = 5,
): Destaques {
  const doisLados: Destaque[] = [];
  const viradas: Destaque[] = [];
  for (const [ibge, valor] of camada.municipios) {
    const lugar = indice.get(ibge);
    if (!lugar || (foco && lugar.uf !== foco) || !comDados(valor)) continue;
    const antes = referencia?.municipios.get(ibge) ?? null;
    const item = { ibge, lugar, valor, variacao: variacao(valor, antes) };
    if (valor.liderOutro === null) doisLados.push(item);
    const [hoje, entao] = [quemLidera(valor), comDados(antes) ? quemLidera(antes) : null];
    if (hoje !== null && entao !== null && hoje !== entao) viradas.push(item);
  }
  const m = (d: Destaque): number => margem(d.valor as Valor);
  const capitais = UFS.filter((uf) => !foco || uf === foco).flatMap((uf) => {
    const ibge = CAPITAIS[uf];
    const lugar = indice.get(ibge);
    if (!lugar) return [];
    const valor = camada.municipios.get(ibge) ?? null;
    return [{ ibge, lugar, valor, variacao: variacao(valor, referencia?.municipios.get(ibge) ?? null) }];
  });
  return {
    dividida: [...doisLados].sort((x, y) => m(x) - m(y) || x.ibge - y.ibge).slice(0, limite),
    unanime: [...doisLados].sort((x, y) => m(y) - m(x) || x.ibge - y.ibge).slice(0, limite),
    virada: viradas.sort((x, y) => Math.abs(y.variacao ?? 0) - Math.abs(x.variacao ?? 0) || x.ibge - y.ibge).slice(0, limite),
    capitais: capitais.sort((x, y) => x.lugar.nome.localeCompare(y.lugar.nome, 'pt-BR')),
  };
}

export interface LinhaTabela {
  chave: string;
  nome: string;
  valor: Valor | null;
  variacao: number | null;
}

/** "Ver em tabela": as 27 UFs, ou os municípios da UF em foco (os do índice), em ordem alfabética. */
export function linhasTabela(
  camada: Camada,
  referencia: Camada | null,
  indice: ReadonlyMap<number, Lugar>,
  foco: UF | null,
  nomeUf: (uf: UF) => string,
): LinhaTabela[] {
  const linhas: LinhaTabela[] = foco
    ? [...indice.values()]
        .filter((l) => l.uf === foco)
        .map((l) => {
          const valor = camada.municipios.get(l.ibge) ?? null;
          return { chave: String(l.ibge), nome: l.nome, valor, variacao: variacao(valor, referencia?.municipios.get(l.ibge) ?? null) };
        })
    : UFS.map((uf) => {
        const valor = camada.ufs.get(uf) ?? null;
        return { chave: uf, nome: nomeUf(uf), valor, variacao: variacao(valor, referencia?.ufs.get(uf) ?? null) };
      });
  return linhas.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}

/** Nova leitura do ao vivo: nunca volta no tempo (uma borda do CDN pode servir um arquivo mais velho depois de um novo). */
export function mesclarAoVivo(anterior: Camada | null, nova: Camada | null): Camada | null {
  if (!nova) return anterior;
  if (anterior && Date.parse(nova.atualizado) < Date.parse(anterior.atualizado)) return anterior;
  return nova;
}

export type EstadoCamada = 'carregando' | 'erro' | 'sem-conexao' | 'aguardando' | 'ok';

/**
 * O aviso da camada. Sem nada na tela: carregando, ou erro se a 1ª leitura falhou. Com dado e a última leitura falhando:
 * sem conexão (o que está na tela fica). Brasil abaixo de 1% das seções: aguardando primeiras seções.
 */
export function estadoCamada(camada: Camada | null, falhou: boolean): EstadoCamada {
  if (!camada) return falhou ? 'erro' : 'carregando';
  if (falhou) return 'sem-conexao';
  return comDados(camada.br) ? 'ok' : 'aguardando';
}
