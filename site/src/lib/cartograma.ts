// O muro de 28 (design/DIRECTION.md, Mapa): cartograma de placas iguais numa grade aproximadamente geográfica de 7 × 8.
// O Brasil é a 28ª placa, numa célula de oceano, com o mesmo tamanho e o mesmo tratamento das UFs.
// Coordenadas 1-based: c = coluna (oeste → leste), r = linha (norte → sul). Os buracos da grade desenham a silhueta:
// RR e AP como as duas pontas do norte (a Guiana entre elas), o Nordeste saliente a leste, a costa recuando para sudoeste
// depois de AL e o Sul descendo em degraus para RS. O Brasil fica solto no Atlântico, sem encostar em nenhuma UF, para
// não ser lido como território. Três vazios recebem o título, o painel de detalhe e a legenda (AREAS).
import type { UF } from './contratos.ts';

export type Lugar = UF | 'BR';

export interface Celula {
  c: number;
  r: number;
}

export interface Area extends Celula {
  w: number;
  h: number;
}

export type Direcao = 'cima' | 'direita' | 'baixo' | 'esquerda';

export const COLUNAS = 7;
export const LINHAS = 8;

//      1   2   3   4   5   6   7
//  1   .   RR  .   AP  [ título  ]
//  2   .   AM  PA  MA  CE  RN  .
//  3   AC  RO  MT  TO  PI  PE  PB
//  4   [l  .]  GO  DF  BA  SE  AL
//  5   [e  .]  MS  MG  ES  .   .
//  6   [g  .]  PR  SP  RJ  .   BR
//  7   [e  .]  .   SC  [ painel  ]
//  8   [n  .]  RS  .   [         ]
export const CARTOGRAMA: Readonly<Record<Lugar, Celula>> = {
  RR: { c: 2, r: 1 }, AP: { c: 4, r: 1 },
  AM: { c: 2, r: 2 }, PA: { c: 3, r: 2 }, MA: { c: 4, r: 2 }, CE: { c: 5, r: 2 }, RN: { c: 6, r: 2 },
  AC: { c: 1, r: 3 }, RO: { c: 2, r: 3 }, MT: { c: 3, r: 3 }, TO: { c: 4, r: 3 }, PI: { c: 5, r: 3 }, PE: { c: 6, r: 3 }, PB: { c: 7, r: 3 },
  GO: { c: 3, r: 4 }, DF: { c: 4, r: 4 }, BA: { c: 5, r: 4 }, SE: { c: 6, r: 4 }, AL: { c: 7, r: 4 },
  MS: { c: 3, r: 5 }, MG: { c: 4, r: 5 }, ES: { c: 5, r: 5 },
  PR: { c: 3, r: 6 }, SP: { c: 4, r: 6 }, RJ: { c: 5, r: 6 }, BR: { c: 7, r: 6 },
  SC: { c: 4, r: 7 },
  RS: { c: 3, r: 8 },
};

/** Os vazios que o componente usa nos containers largos. No celular o título e a legenda ficam acima do muro e o painel some. */
export const AREAS: Readonly<Record<'titulo' | 'painel' | 'legenda', Area>> = {
  titulo: { c: 5, r: 1, w: 3, h: 1 },
  painel: { c: 5, r: 7, w: 3, h: 2 },
  legenda: { c: 1, r: 4, w: 2, h: 5 },
};

/** Ordem de leitura (linha a linha, de oeste para leste): é a ordem do DOM e do leitor de tela. */
export const LUGARES: readonly Lugar[] = (Object.keys(CARTOGRAMA) as Lugar[]).sort(
  (a, b) => CARTOGRAMA[a].r - CARTOGRAMA[b].r || CARTOGRAMA[a].c - CARTOGRAMA[b].c,
);

/** `grid-area` CSS de uma área (linha / coluna / span / span). */
export const gridArea = ({ c, r, w, h }: Area): string => `${r} / ${c} / span ${h} / span ${w}`;

/** Passo de cada placa na entrada escalonada: uma onda diagonal do noroeste (RR) para o sudeste. */
export function ordemEntrada(): Map<Lugar, number> {
  const diagonal = (l: Lugar) => CARTOGRAMA[l].c + CARTOGRAMA[l].r;
  const ordem = [...LUGARES].sort((a, b) => diagonal(a) - diagonal(b) || CARTOGRAMA[a].r - CARTOGRAMA[b].r);
  return new Map(ordem.map((l, i) => [l, i]));
}

const PASSO: Record<Direcao, [number, number]> = { cima: [0, -1], direita: [1, 0], baixo: [0, 1], esquerda: [-1, 0] };

/**
 * Placa que a seta do teclado alcança: a mais próxima naquela direção, dentro de um cone de 45° (o desvio lateral nunca
 * passa do avanço), preferindo a mesma linha ou coluna. Sem nenhuma no cone, null: o foco fica onde está.
 */
export function vizinho(de: Lugar, direcao: Direcao): Lugar | null {
  const [dx, dy] = PASSO[direcao];
  const origem = CARTOGRAMA[de];
  let melhor: Lugar | null = null;
  let menor = Infinity;
  for (const l of LUGARES) {
    const dc = CARTOGRAMA[l].c - origem.c;
    const dr = CARTOGRAMA[l].r - origem.r;
    const avanco = dc * dx + dr * dy;
    const desvio = Math.abs(dc * dy + dr * dx);
    if (avanco <= 0 || desvio > avanco) continue;
    const custo = avanco + 2 * desvio;
    if (custo < menor) {
      menor = custo;
      melhor = l;
    }
  }
  return melhor;
}
