// Formato da geometria do mapa de /apuracao (public/geo/*.json, gerado por scripts/build-geo.ts a partir da malha do IBGE).
// Topologia de arcos como no TopoJSON: cada divisa entre dois municípios é guardada uma vez só, então o contorno das UFs
// sai dos mesmos pontos dos municípios e as camadas nunca desalinham. Coordenadas já projetadas (Albers) e quantizadas numa
// grade inteira, com y para baixo. Os inteiros vão em texto no esquema do Google Polyline (zigue-zague, 5 bits por
// caractere, deslocamento 63): JSON que a CDN comprime sozinha e que se decodifica num laço curto.
import type { UF } from './contratos.ts';

/** Código IBGE de UF (os dois primeiros dígitos do código do município) → sigla. */
export const UF_POR_CODIGO: Readonly<Record<number, UF>> = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
  31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
};

/** Sigla → código IBGE da UF. */
export const CODIGO_DA_UF = Object.fromEntries(Object.entries(UF_POR_CODIGO).map(([c, uf]) => [uf, Number(c)])) as Readonly<Record<UF, number>>;

/** Separadores fora do alfabeto do polyline (63–126). */
const FIM_ARCO = ' ';
const FIM_ANEL = ',';
const FIM_FEICAO = ';';

/** Arquivo como sai do build. `aneis`: refs de arco por feição (~i = arco i invertido), em delta contínuo pelo arquivo. */
export interface MalhaJson {
  v: 1;
  /** Extensão da grade: x em 0..largura, y em 0..altura. */
  largura: number;
  altura: number;
  /** Metros por unidade da grade. */
  metros: number;
  /** Albers [lon0, lat0, lat1, lat2] em graus e a passagem de metros projetados para a grade: [x0, y1] (canto superior esquerdo). */
  projecao: [number, number, number, number, number, number];
  arcos: string;
  /** Código IBGE de cada feição (7 dígitos para município, 2 para UF), em delta. */
  codigos: string;
  aneis: string;
  /** x, y e raio do maior círculo inscrito (polylabel), três números por feição. Ausente na malha nacional. */
  rotulos?: number[];
  /** Nome de cada feição. Só nos arquivos por UF. */
  nomes?: string[];
}

export interface Feicao {
  codigo: number;
  uf: UF;
  aneis: Int32Array[];
  /** [x0, y0, x1, y1] na grade. */
  caixa: [number, number, number, number];
  rotulo: [number, number, number] | null;
  nome: string | null;
}

export interface Malha {
  largura: number;
  altura: number;
  metros: number;
  projecao: MalhaJson['projecao'];
  /** x, y de todos os arcos em sequência. */
  xy: Int32Array;
  /** Início de cada arco em pontos; inicio[n] = total de pontos. */
  inicio: Uint32Array;
  feicoes: Feicao[];
}

/** O que tracarFeicao e tracarArcos precisam: Path2D e CanvasRenderingContext2D servem, e um gravador serve no teste. */
export type Tracador = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'closePath'>;

// ---------- codificação (build) e decodificação (navegador) ----------

const zigue = (n: number): number => (n < 0 ? ~(n << 1) : n << 1);

/** Inteiros (já em delta) → texto polyline. */
export function codificar(valores: readonly number[]): string {
  let saida = '';
  for (const valor of valores) {
    let z = zigue(valor);
    while (z >= 0x20) {
      saida += String.fromCharCode((0x20 | (z & 0x1f)) + 63);
      z >>>= 5;
    }
    saida += String.fromCharCode(z + 63);
  }
  return saida;
}

/**
 * Lê o texto em blocos separados por qualquer caractere abaixo de 63. `aoValor` recebe cada inteiro já desfeito o
 * zigue-zague (sem desfazer o delta, que é de quem chama); `aoSeparador` recebe o código do separador.
 */
function percorrer(texto: string, aoValor: (n: number) => void, aoSeparador: (codigo: number) => void): void {
  let acumulado = 0;
  let deslocamento = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c < 63) {
      aoSeparador(c);
      continue;
    }
    const b = c - 63;
    acumulado |= (b & 0x1f) << deslocamento;
    if (b < 0x20) {
      aoValor(acumulado & 1 ? ~(acumulado >>> 1) : acumulado >>> 1);
      acumulado = 0;
      deslocamento = 0;
    } else {
      deslocamento += 5;
    }
  }
}

/** Ref de arco com sinal (TopoJSON) ↔ natural (2i ou 2i+1), para o delta entre refs vizinhas ficar pequeno. */
export const refParaNatural = (ref: number): number => (ref < 0 ? 2 * ~ref + 1 : 2 * ref);
const naturalParaRef = (n: number): number => (n & 1 ? ~(n >>> 1) : n >>> 1);

/** Inteiros → texto em delta, para listas quase em ordem (códigos IBGE). */
export const codificarDeltas = (valores: readonly number[]): string => codificar(valores.map((v, i) => v - (i ? valores[i - 1] : 0)));

function decodificarDeltas(texto: string): number[] {
  const saida: number[] = [];
  let anterior = 0;
  percorrer(texto, (d) => saida.push((anterior += d)), () => {});
  return saida;
}

/** Arcos (pontos inteiros) → texto: deltas contínuos de um arco para o seguinte, arcos separados por espaço. */
export function codificarArcos(arcos: ReadonlyArray<ReadonlyArray<readonly [number, number]>>): string {
  let x = 0;
  let y = 0;
  return arcos
    .map((arco) => {
      const deltas: number[] = [];
      for (const [px, py] of arco) {
        deltas.push(px - x, py - y);
        x = px;
        y = py;
      }
      return codificar(deltas);
    })
    .join(FIM_ARCO);
}

/** Anéis de cada feição (refs com sinal) → texto: delta contínuo das refs naturais pelo arquivo inteiro. */
export function codificarAneis(feicoes: ReadonlyArray<ReadonlyArray<readonly number[]>>): string {
  let anterior = 0;
  return feicoes
    .map((aneis) =>
      aneis
        .map((anel) =>
          codificar(
            anel.map((ref) => {
              const n = refParaNatural(ref);
              const d = n - anterior;
              anterior = n;
              return d;
            }),
          ),
        )
        .join(FIM_ANEL),
    )
    .join(FIM_FEICAO);
}

function decodificarArcos(texto: string): { xy: Int32Array; inicio: Uint32Array } {
  const xy: number[] = [];
  const inicio: number[] = [0];
  let x = 0;
  let y = 0;
  let par = false;
  percorrer(
    texto,
    (n) => {
      if (par) {
        y += n;
        xy.push(x, y);
      } else {
        x += n;
      }
      par = !par;
    },
    () => inicio.push(xy.length / 2),
  );
  inicio.push(xy.length / 2);
  return { xy: Int32Array.from(xy), inicio: Uint32Array.from(inicio) };
}

function decodificarAneis(texto: string): number[][][] {
  const feicoes: number[][][] = [[[]]];
  let anterior = 0;
  percorrer(
    texto,
    (d) => {
      anterior += d;
      const aneis = feicoes[feicoes.length - 1];
      aneis[aneis.length - 1].push(naturalParaRef(anterior));
    },
    (c) => {
      if (c === FIM_FEICAO.charCodeAt(0)) feicoes.push([[]]);
      else feicoes[feicoes.length - 1].push([]);
    },
  );
  return feicoes;
}

const ufDoCodigo = (codigo: number): UF => {
  const uf = UF_POR_CODIGO[codigo < 100 ? codigo : Math.floor(codigo / 100000)];
  if (!uf) throw new Error(`Código IBGE sem UF conhecida: ${codigo}`);
  return uf;
};

/** Decodifica um arquivo de public/geo. Falha cedo e com contexto: o arquivo é nosso, e malha torta não pode virar mapa torto. */
export function lerMalha(bruto: MalhaJson): Malha {
  if (bruto?.v !== 1) throw new Error(`Malha com versão desconhecida: ${String(bruto?.v)}`);
  const { xy, inicio } = decodificarArcos(bruto.arcos);
  const aneis = decodificarAneis(bruto.aneis);
  const codigos = decodificarDeltas(bruto.codigos);
  if (aneis.length !== codigos.length) throw new Error(`Malha com ${codigos.length} códigos e ${aneis.length} feições`);
  const nArcos = inicio.length - 1;
  const feicoes = codigos.map((codigo, i): Feicao => {
    const caixa: Feicao['caixa'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const anel of aneis[i]) {
      for (const ref of anel) {
        const a = ref < 0 ? ~ref : ref;
        if (a >= nArcos) throw new Error(`Feição ${codigo} aponta para o arco ${a}, mas a malha tem ${nArcos}`);
        for (let p = inicio[a]; p < inicio[a + 1]; p++) {
          const x = xy[2 * p];
          const y = xy[2 * p + 1];
          if (x < caixa[0]) caixa[0] = x;
          if (y < caixa[1]) caixa[1] = y;
          if (x > caixa[2]) caixa[2] = x;
          if (y > caixa[3]) caixa[3] = y;
        }
      }
    }
    const r = bruto.rotulos;
    return {
      codigo,
      uf: ufDoCodigo(codigo),
      aneis: aneis[i].map((anel) => Int32Array.from(anel)),
      caixa,
      rotulo: r ? [r[3 * i], r[3 * i + 1], r[3 * i + 2]] : null,
      nome: bruto.nomes?.[i] ?? null,
    };
  });
  return { largura: bruto.largura, altura: bruto.altura, metros: bruto.metros, projecao: bruto.projecao, xy, inicio, feicoes };
}

// ---------- traçado ----------

/** Anéis fechados da feição. O build orienta externo horário e buraco anti-horário: vale a regra padrão ('nonzero'). */
export function tracarFeicao(m: Malha, f: Feicao, p: Tracador): void {
  const { xy, inicio } = m;
  for (const anel of f.aneis) {
    let primeiro = true;
    for (const ref of anel) {
      const a = ref < 0 ? ~ref : ref;
      const de = inicio[a];
      const ate = inicio[a + 1] - 1;
      // O primeiro ponto de cada arco repete o último do anterior: só o primeiro arco do anel o usa.
      if (ref >= 0) {
        for (let k = primeiro ? de : de + 1; k <= ate; k++) {
          if (k === de) p.moveTo(xy[2 * k], xy[2 * k + 1]);
          else p.lineTo(xy[2 * k], xy[2 * k + 1]);
        }
      } else {
        for (let k = primeiro ? ate : ate - 1; k >= de; k--) {
          if (k === ate) p.moveTo(xy[2 * k], xy[2 * k + 1]);
          else p.lineTo(xy[2 * k], xy[2 * k + 1]);
        }
      }
      primeiro = false;
    }
    p.closePath();
  }
}

/** Arcos como linhas abertas, cada um uma vez só: as divisas a contornar. */
export function tracarArcos(m: Malha, arcos: Iterable<number>, p: Tracador): void {
  const { xy, inicio } = m;
  for (const a of arcos) {
    p.moveTo(xy[2 * inicio[a]], xy[2 * inicio[a] + 1]);
    for (let k = inicio[a] + 1; k < inicio[a + 1]; k++) p.lineTo(xy[2 * k], xy[2 * k + 1]);
  }
}

/** Arcos que separam UFs diferentes ou que só uma feição usa (costa, fronteira, contorno de um arquivo por UF). */
export function arcosDeBorda(m: Malha): number[] {
  const n = m.inicio.length - 1;
  const dono = new Int32Array(n).fill(-1);
  const borda = new Uint8Array(n);
  const usos = new Uint8Array(n);
  for (const f of m.feicoes) {
    const uf = Math.floor(f.codigo < 100 ? f.codigo : f.codigo / 100000);
    for (const anel of f.aneis) {
      for (const ref of anel) {
        const a = ref < 0 ? ~ref : ref;
        usos[a]++;
        if (dono[a] === -1) dono[a] = uf;
        else if (dono[a] !== uf) borda[a] = 1;
      }
    }
  }
  const saida: number[] = [];
  for (let a = 0; a < n; a++) if (borda[a] || usos[a] === 1) saida.push(a);
  return saida;
}

// ---------- projeção ----------

const RAIO_TERRA = 6371008.8;
const RAD = Math.PI / 180;

/** Albers cônica equivalente (esfera), em metros. Equivalente de área: município grande não parece maior do que é. */
export function albers(lon0: number, lat0: number, lat1: number, lat2: number): (lon: number, lat: number) => [number, number] {
  const s1 = Math.sin(lat1 * RAD);
  const n = (s1 + Math.sin(lat2 * RAD)) / 2;
  const c = Math.cos(lat1 * RAD) ** 2 + 2 * n * s1;
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(lat0 * RAD)) / n;
  return (lon, lat) => {
    const rho = Math.sqrt(c - 2 * n * Math.sin(lat * RAD)) / n;
    const theta = n * (lon - lon0) * RAD;
    return [RAIO_TERRA * rho * Math.sin(theta), RAIO_TERRA * (rho0 - rho * Math.cos(theta))];
  };
}

/** Longitude e latitude → coordenadas da grade da malha (mesma projeção do build). */
export function projetar(m: Pick<Malha, 'projecao' | 'metros'>, lon: number, lat: number): [number, number] {
  const [lon0, lat0, lat1, lat2, x0, y1] = m.projecao;
  const [x, y] = albers(lon0, lat0, lat1, lat2)(lon, lat);
  return [(x - x0) / m.metros, (y1 - y) / m.metros];
}
