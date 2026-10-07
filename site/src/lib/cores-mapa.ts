// Escalas de cor do mapa de /apuracao. A cor é do candidato (lib/cores.ts): o mapa só decide o degrau.
//   resultado: cor de quem lidera no polígono, mais forte quanto maior a margem |A − B| (pontos sobre válidos);
//   variacao:  Δ = fatia do 13 entre os dois agora − a mesma na referência (o número da frase "+3,4 pontos para X em relação a
//              2022" do placar e do card), na cor de quem ganhou terreno, mais forte quanto maior |Δ|.
// Degraus discretos, gerados em OKLCH a partir do hex do candidato: mesmo matiz, claridade e croma crescendo até a cor
// cheia do site no último degrau. O azul é sempre mais claro que o vermelho do mesmo degrau, então os dois lados se
// separam também por luminância (daltonismo, escala de cinza). Os testes conferem isso com simulação de daltonismo.
import type { CandidatoCamada, Valor } from './camada-mapa.ts';
import { corCandidato } from './cores.ts';

export type ModoCor = 'resultado' | 'variacao';
type Lado = '13' | '22';

/** Limite inferior, em pontos, de cada degrau depois do primeiro. resultado: 5 degraus; variacao: abaixo de 1 = estável, e 4. */
export const LIMIARES: Readonly<Record<ModoCor, readonly number[]>> = {
  resultado: [5, 15, 30, 50],
  variacao: [1, 3, 6, 10],
};

// ---------- OKLab (Björn Ottosson) ----------

type Trio = [number, number, number];

const paraLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const paraGama = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** '#rrggbb' → RGB linear (0–1). */
export const linearDoHex = (hex: string): Trio =>
  [1, 3, 5].map((i) => paraLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as Trio;

export function oklab([r, g, b]: Trio): Trio {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function linearDoOklab([L, a, b]: Trio): Trio {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const hexDoLinear = (rgb: Trio): string =>
  `#${rgb.map((c) => Math.round(paraGama(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, '0')).join('')}`;

/** Cor em OKLCH; o croma desce até caber no sRGB, sem mudar claridade nem matiz. */
function oklch(L: number, C: number, h: number): string {
  for (let c = C; c > 0; c -= 0.002) {
    const rgb = linearDoOklab([L, c * Math.cos(h), c * Math.sin(h)]);
    if (rgb.every((x) => x >= -1e-4 && x <= 1 + 1e-4)) return hexDoLinear(rgb);
  }
  return hexDoLinear(linearDoOklab([L, 0, 0]));
}

/**
 * Degraus do mais fraco ao mais forte, terminando na cor cheia do candidato. `piso` é a claridade do degrau mais fraco:
 * longe o bastante do fundo (--bg) e de "sem dado" (--surface-2) para nunca se confundir com eles.
 */
function degraus(hex: string, n: number, piso: number): string[] {
  const [L, a, b] = oklab(linearDoHex(hex));
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  return Array.from({ length: n }, (_, i) => {
    if (i === n - 1) return hex;
    const t = i / (n - 1);
    return oklch(piso + (L - piso) * t, C * (0.45 + 0.55 * t), h);
  });
}

// Pisos: o azul (mais claro no tom cheio) começa mais alto, e cada degrau azul fica mais claro que o vermelho do mesmo nível.
const PISO: Readonly<Record<Lado, number>> = { '13': 0.42, '22': 0.5 };
const COR = { '13': corCandidato(13, 0).hex, '22': corCandidato(22, 1).hex } as const;

export const DEGRAUS: Readonly<Record<ModoCor, Readonly<Record<Lado, readonly string[]>>>> = {
  resultado: {
    '13': degraus(COR['13'], LIMIARES.resultado.length + 1, PISO['13']),
    '22': degraus(COR['22'], LIMIARES.resultado.length + 1, PISO['22']),
  },
  variacao: {
    '13': degraus(COR['13'], LIMIARES.variacao.length, PISO['13']),
    '22': degraus(COR['22'], LIMIARES.variacao.length, PISO['22']),
  },
};

/** Variação abaixo do primeiro limiar (e empate): cinza puro, mais claro que "sem dado"; sem croma, nem de candidato nem do tema. */
export const ESTAVEL = oklch(0.42, 0, 0);

// ---------- paleta única e tons ----------

/**
 * Tudo o que o mapa pinta, por índice ("tom"). As entradas var(...) são tokens que o motor resolve no CSS da página:
 * sem dado = --surface-2; neutro = --ink-2 (lidera alguém que não é A nem B, ou candidato sem cor).
 */
export const PALETA: readonly string[] = [
  'var(--surface-2)',
  'var(--ink-2)',
  ESTAVEL,
  ...DEGRAUS.resultado['13'],
  ...DEGRAUS.resultado['22'],
  ...DEGRAUS.variacao['13'],
  ...DEGRAUS.variacao['22'],
];
export const TOM_SEM_DADO = 0;
export const TOM_NEUTRO = 1;
export const TOM_ESTAVEL = 2;

const inicioDegraus = (modo: ModoCor, lado: Lado): number => {
  const nRes = LIMIARES.resultado.length + 1;
  const nVar = LIMIARES.variacao.length;
  const base = modo === 'resultado' ? 3 : 3 + 2 * nRes;
  return base + (lado === '13' ? 0 : modo === 'resultado' ? nRes : nVar);
};

/** Índice do degrau: quantos limiares |x| alcança (resultado: 0–4; variacao: 0–3 depois do estável). */
const degrau = (limiares: readonly number[], x: number): number => limiares.filter((l) => x >= l).length;

/** Coluna (0 = A, 1 = B) de quem veste a cor 13 e de quem veste a 22; sem a cor no dado, a ordem das colunas. */
function colunas(cands: readonly [CandidatoCamada, CandidatoCamada]): { '13': 0 | 1; '22': 0 | 1 } {
  const c13 = cands.findIndex((c) => c.cor === '13');
  const c22 = cands.findIndex((c) => c.cor === '22');
  return c13 >= 0 && c22 >= 0 && c13 !== c22 ? { '13': c13 as 0 | 1, '22': c22 as 0 | 1 } : { '13': 0, '22': 1 };
}

// Abaixo de 1% das seções o lugar está "aguardando primeiras seções" (brief, seção 6): o painel e o mapa dizem o mesmo.
const temDado = (v: Valor | undefined): v is Valor => !!v && v.secoes >= 1 && v.a + v.b + v.outros > 0;
const pct = (v: Valor, coluna: 0 | 1): number => (coluna === 0 ? v.a : v.b);

/** Fatia do 13 entre os dois (no 1º turno, "outros" fica de fora, como na frase de variação); null se nenhum dos dois teve voto. */
function fatia13(v: Valor, c: { '13': 0 | 1; '22': 0 | 1 }): number | null {
  const [x, y] = [pct(v, c['13']), pct(v, c['22'])];
  return x + y > 0 ? (x / (x + y)) * 100 : null;
}

/**
 * Função de tom para uma camada (e, no modo variacao, a camada de referência). Chame uma vez por troca de camada e
 * aplique a cada polígono: `tom(valorAgora, valorNaReferencia)`.
 */
export function tonalizador(
  modo: ModoCor,
  candidatos: readonly [CandidatoCamada, CandidatoCamada],
  candidatosReferencia?: readonly [CandidatoCamada, CandidatoCamada] | null,
): (agora: Valor | undefined, antes?: Valor | undefined) => number {
  if (modo === 'resultado') {
    return (v) => {
      if (!temDado(v)) return TOM_SEM_DADO;
      if (v.liderOutro !== null) return TOM_NEUTRO;
      if (v.a === v.b) return TOM_ESTAVEL;
      const cor = candidatos[v.a > v.b ? 0 : 1].cor;
      return cor ? inicioDegraus('resultado', cor) + degrau(LIMIARES.resultado, Math.abs(v.a - v.b)) : TOM_NEUTRO;
    };
  }
  const agora = colunas(candidatos);
  const ref = colunas(candidatosReferencia ?? candidatos);
  return (v, antes) => {
    if (!temDado(v) || !temDado(antes)) return TOM_SEM_DADO;
    const [hoje, entao] = [fatia13(v, agora), fatia13(antes, ref)];
    if (hoje === null || entao === null) return TOM_SEM_DADO;
    const delta = hoje - entao;
    const n = degrau(LIMIARES.variacao, Math.abs(delta));
    if (n === 0) return TOM_ESTAVEL;
    const cor = candidatos[agora[delta > 0 ? '13' : '22']].cor;
    return cor ? inicioDegraus('variacao', cor) + n - 1 : TOM_NEUTRO;
  };
}
