// Busca de município por nome, feita no navegador sobre /busca.json (5.571 entradas, ordenado por eleitores desc).
// Sem biblioteca: o índice é normalizado uma vez por array e cada tecla é só um varrer de strings curtas.
import { UFS } from './contratos.ts';

export type EntradaIndice = [slug: string, nome: string, uf: string, lat: number, lon: number, eleitores: number];

export interface ResultadoBusca {
  slug: string;
  nome: string;
  uf: string;
  eleitores: number;
}

const APOSTROFOS = /['’´`]/g;
const SIGLAS = new Set(UFS.map((uf) => uf.toLowerCase()));

/** Sem acento, minúsculo, apóstrofo some ("d'Oeste" -> "doeste", como em slug.ts) e qualquer outra pontuação vira espaço. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(APOSTROFOS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Preparado {
  entrada: EntradaIndice;
  /** Nome normalizado ("santa barbara doeste"). */
  n: string;
  /** Igual a `n`, mas com o apóstrofo como separador de palavra ("santa barbara d oeste"): "oeste" e "d oeste" acham d'Oeste. */
  w: string;
  uf: string;
}

const preparados = new WeakMap<EntradaIndice[], Preparado[]>();

/** Guarda por eleitores desc (estável), para que cada nível já saia na ordem de desempate. O índice não pode mudar depois da 1ª busca. */
function preparar(indice: EntradaIndice[]): Preparado[] {
  const guardado = preparados.get(indice);
  if (guardado?.length === indice.length) return guardado;
  const lista = indice
    .map((entrada): Preparado => ({
      entrada,
      n: normalizar(entrada[1]),
      w: normalizar(entrada[1].replace(APOSTROFOS, ' ')),
      uf: entrada[2].toLowerCase(),
    }))
    .sort((a, b) => b.entrada[5] - a.entrada[5]);
  preparados.set(indice, lista);
  return lista;
}

/** 0 exato, 1 prefixo do nome, 2 prefixo de palavra, 3 contém, -1 não casa. */
function nivel({ n, w }: Preparado, q: string, qPalavra: string): number {
  if (n === q || w === q) return 0;
  if (!n.includes(q) && !w.includes(q)) return -1;
  if (n.startsWith(q) || w.startsWith(q)) return 1;
  if (n.includes(qPalavra) || w.includes(qPalavra)) return 2;
  return 3;
}

function coletar(lista: Preparado[], q: string, uf: string | null, limite: number): ResultadoBusca[] {
  const qPalavra = ` ${q}`;
  const niveis: Preparado[][] = [[], [], [], []];
  for (const p of lista) {
    if (uf !== null && p.uf !== uf) continue;
    const nv = nivel(p, q, qPalavra);
    if (nv >= 0 && niveis[nv].length < limite) niveis[nv].push(p);
  }
  return niveis
    .flat()
    .slice(0, limite)
    .map(({ entrada: [slug, nome, siglaUf, , , eleitores] }) => ({ slug, nome, uf: siglaUf, eleitores }));
}

/**
 * Ranking: nome exato > prefixo do nome > prefixo de palavra > contém; desempate por eleitores.
 * Se nada casa o texto inteiro e o último termo é uma sigla de UF ("luis ma"), busca o resto só nessa UF.
 * Quem casa o texto inteiro ganha da leitura "UF no fim": "rio pa" ainda é o começo de "Rio Pardo".
 */
export function buscar(indice: EntradaIndice[], consulta: string, limite = 8): ResultadoBusca[] {
  const q = normalizar(consulta);
  if (q === '' || limite <= 0) return [];
  const lista = preparar(indice);
  const direto = coletar(lista, q, null, limite);
  if (direto.length > 0) return direto;

  const termos = q.split(' ');
  const sigla = termos[termos.length - 1];
  return termos.length > 1 && SIGLAS.has(sigla) ? coletar(lista, termos.slice(0, -1).join(' '), sigla, limite) : [];
}
