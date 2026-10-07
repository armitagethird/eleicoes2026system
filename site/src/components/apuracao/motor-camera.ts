// Câmera do mapa: centro (x, y) em metros da projeção e escala k em px de tela por metro. Funções puras.

export interface Camera {
  x: number;
  y: number;
  k: number;
}

/** [x0, y0, x1, y1] em metros. */
export type Caixa = readonly [number, number, number, number];

/** Câmera que mostra a caixa inteira, com `margem` px de respiro em volta. */
export function enquadrar(c: Caixa, largura: number, altura: number, margem: number): Camera {
  const k = Math.min((largura - 2 * margem) / Math.max(1, c[2] - c[0]), (altura - 2 * margem) / Math.max(1, c[3] - c[1]));
  return { x: (c[0] + c[2]) / 2, y: (c[1] + c[3]) / 2, k: Math.max(k, 1e-9) };
}

/**
 * Escala entre kMin e kMax e centro preso ao mundo. Num eixo em que o mundo inteiro cabe na janela, o centro fica no meio
 * (nada de arrastar o mapa para fora da tela); ampliado, a borda do mapa pode entrar na janela até 35% da meia janela,
 * folga que nasce em zero no limiar e cresce com o zoom, para não haver salto ao afastar.
 */
export function limitar(cam: Camera, mundo: Caixa, kMin: number, kMax: number, largura: number, altura: number): Camera {
  const k = Math.min(kMax, Math.max(kMin, cam.k));
  const eixo = (v: number, a: number, b: number, janela: number) => {
    const meia = janela / (2 * k);
    if (b - a <= 2 * meia) return (a + b) / 2;
    const folga = 0.35 * meia * Math.min(1, (b - a - 2 * meia) / meia);
    return Math.min(b - meia + folga, Math.max(a + meia - folga, v));
  };
  return { x: eixo(cam.x, mundo[0], mundo[2], largura), y: eixo(cam.y, mundo[1], mundo[3], altura), k };
}

/** Câmera depois de multiplicar a escala por `fator` mantendo parado o ponto de tela (sx, sy). */
export function zoomEm(cam: Camera, fator: number, sx: number, sy: number, largura: number, altura: number): Camera {
  const k = cam.k * fator;
  const wx = cam.x + (sx - largura / 2) / cam.k;
  const wy = cam.y + (sy - altura / 2) / cam.k;
  return { x: wx - (sx - largura / 2) / k, y: wy - (sy - altura / 2) / k, k };
}

const RHO = Math.SQRT2;

/**
 * Trajeto suave entre duas câmeras (van Wijk e Nuij, "Smooth and efficient zooming and panning", 2003): longe, afasta,
 * desliza e aproxima; perto, só aproxima. É o mesmo de d3.interpolateZoom, em poucas linhas e sem a biblioteca.
 */
export function voo(a: Camera, b: Camera, largura: number): (t: number) => Camera {
  const [w0, w1] = [largura / a.k, largura / b.k];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-6) {
    const s = Math.log(w1 / w0);
    return (t) => (t >= 1 ? b : { x: a.x + t * dx, y: a.y + t * dy, k: largura / (w0 * Math.exp(s * t)) });
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + RHO ** 4 * d2) / (2 * w0 * RHO ** 2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - RHO ** 4 * d2) / (2 * w1 * RHO ** 2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / RHO;
  return (t) => {
    if (t >= 1) return b;
    const s = t * S;
    const u = (w0 / (RHO ** 2 * d1)) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0));
    return { x: a.x + u * dx, y: a.y + u * dy, k: largura / ((w0 * Math.cosh(r0)) / Math.cosh(RHO * s + r0)) };
  };
}

/** cubic-bezier(x1, y1, x2, y2) do CSS, por Newton. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const coef = (p1: number, p2: number) => {
    const c = 3 * p1;
    const b = 3 * (p2 - p1) - c;
    return [1 - c - b, b, c];
  };
  const [ax, bx, cx] = coef(x1, x2);
  const [ay, by, cy] = coef(y1, y2);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const erro = ((ax * t + bx) * t + cx) * t - x;
      const derivada = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(erro) < 1e-6 || Math.abs(derivada) < 1e-6) break;
      t -= erro / derivada;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

/** --ease de tokens.css: arranque rápido, assentamento seco. */
export const suave = bezier(0.2, 0.7, 0.1, 1);
