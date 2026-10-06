// DESTINO (design/DIRECTION.md, gesto nº 1): ajusta um texto à largura pelo eixo wdth da Archivo 900, como letreiro de ônibus.
// Pura, sem DOM: usa a tabela de avanços medida no Chrome (scripts/build-metricas.ts), então serve para SVG e para HTML gerado no build.
// Nunca escala glifo (proibido textLength/lengthAdjust/scaleX): só muda font-stretch e font-size.
import metricas from './metricas-archivo.json' with { type: 'json' };

export interface Linha {
  texto: string;
  /** Valor de font-stretch em %, de 62 a 125. */
  wdth: number;
  /** font-size em px. */
  tamanho: number;
  /** Largura prevista, em px, no wdth e tamanho acima. */
  largura: number;
}

export interface OpcoesDestino {
  /** Largura-alvo em px. */
  largura: number;
  tamMax: number;
  tamMin: number;
  /** Padrão 2. Com 1 nunca quebra. */
  maxLinhas?: 1 | 2;
}

const { upm, wdth: NOS, adv, kern, cap, acento, desce } = metricas as {
  upm: number;
  wdth: number[];
  cap: number;
  acento: number;
  desce: number;
  adv: Record<string, number[]>;
  kern: Record<string, number[]>;
};

/** Alturas verticais da Archivo 900, em em: maiúscula, topo de acento (Ã, Í) e a maior descida (a cedilha do Ç). */
export const ALTURAS = { cap: cap / upm, acento: acento / upm, desce: desce / upm } as const;

const ULTIMO = NOS.length - 1;
const WDTH_MIN = NOS[0];
const WDTH_MAX = NOS[ULTIMO];
// Folga para o que a tabela não modela (kerning de letras fora da tabela, arredondamento): garante que nunca estoura.
const SEGURANCA = 1.01;

/**
 * Largura do texto, em em, em cada um dos wdth medidos (avanços mais kerning de pares).
 * A largura em qualquer wdth é a interpolação linear entre estes pontos.
 */
function totaisEm(texto: string): number[] {
  const totais = NOS.map(() => 0);
  let anterior = '';
  for (const c of texto) {
    const avancos = adv[c] ?? adv.O;
    const base = c.normalize('NFD')[0];
    const ajuste = kern[anterior + base];
    for (let k = 0; k <= ULTIMO; k++) totais[k] += (avancos[k] + (ajuste?.[k] ?? 0)) / upm;
    anterior = base;
  }
  return totais;
}

/** Índice do trecho [NOS[i], NOS[i+1]] que contém o valor, dado o vetor crescente `pontos`. */
function trecho(pontos: number[], valor: number): number {
  let i = ULTIMO - 1;
  while (i > 0 && pontos[i] > valor) i--;
  return i;
}

function emNoWdth(totais: number[], wdth: number): number {
  const w = Math.min(WDTH_MAX, Math.max(WDTH_MIN, wdth));
  const i = trecho(NOS, w);
  return totais[i] + ((totais[i + 1] - totais[i]) * (w - NOS[i])) / (NOS[i + 1] - NOS[i]);
}

function wdthParaEm(totais: number[], em: number): number {
  const i = trecho(totais, em);
  return NOS[i] + ((em - totais[i]) * (NOS[i + 1] - NOS[i])) / (totais[i + 1] - totais[i]);
}

const abaixo = (valor: number): number => Math.floor(valor * 10) / 10;

/** Largura prevista de um texto em px; `tracking` é o letter-spacing em em (soma-se após cada caractere, como no Chrome). */
export function larguraTexto(texto: string, wdth: number, tamanho: number, tracking = 0): number {
  return (emNoWdth(totaisEm(texto), wdth) + tracking * [...texto].length) * tamanho;
}

function ajustarLinha(texto: string, totais: number[], util: number, tamMax: number): Linha {
  let wdth = WDTH_MAX;
  let tamanho = tamMax;
  if (totais[ULTIMO] * tamMax > util) {
    if (totais[0] * tamMax <= util) {
      wdth = abaixo(wdthParaEm(totais, util / tamMax));
    } else {
      wdth = WDTH_MIN;
      tamanho = abaixo(util / totais[0]);
    }
  }
  return { texto, wdth, tamanho, largura: emNoWdth(totais, wdth) * tamanho };
}

/** O espaço que deixa as duas metades mais parecidas (menor largura da maior). Sem espaço, não há onde quebrar. */
function quebrarNoEspacoMaisEquilibrado(texto: string): [string, string] | null {
  let melhor: [string, string] | null = null;
  let menorMaior = Infinity;
  for (let i = texto.indexOf(' '); i !== -1; i = texto.indexOf(' ', i + 1)) {
    const par: [string, string] = [texto.slice(0, i), texto.slice(i + 1)];
    const maior = Math.max(...par.map((p) => totaisEm(p)[0]));
    if (maior < menorMaior) {
      menorMaior = maior;
      melhor = par;
    }
  }
  return melhor;
}

/**
 * 1) varia o wdth no tamanho máximo; 2) se nem com wdth 62 couber, reduz o tamanho até tamMin;
 * 3) abaixo de tamMin, quebra em 2 linhas no espaço mais equilibrado, ambas no tamanho tamMin (cada linha com o seu wdth).
 * Nunca estoura a largura: sem onde quebrar (maxLinhas 1 ou palavra única), o tamanho cai abaixo de tamMin.
 */
export function ajustarDestino(texto: string, { largura, tamMax, tamMin, maxLinhas = 2 }: OpcoesDestino): { linhas: Linha[] } {
  const limpo = texto.normalize('NFC').trim().replace(/\s+/g, ' ');
  const util = largura / SEGURANCA;
  const unica = ajustarLinha(limpo, totaisEm(limpo), util, tamMax);
  const partes = unica.tamanho >= tamMin || maxLinhas === 1 ? null : quebrarNoEspacoMaisEquilibrado(limpo);
  if (!partes) return { linhas: [unica] };

  const totais = partes.map(totaisEm);
  const tamanho = Math.min(tamMin, ...totais.map((t) => abaixo(util / t[0])));
  return { linhas: partes.map((parte, i) => ajustarLinha(parte, totais[i], util, tamanho)) };
}
