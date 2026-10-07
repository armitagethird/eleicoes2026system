import { describe, expect, it } from 'vitest';
import { bezier, enquadrar, limitar, suave, voo, zoomEm, type Caixa } from './motor-camera.ts';

const BRASIL: Caixa = [0, 0, 4_700_000, 4_300_000];

describe('câmera', () => {
  it('enquadrar: a caixa inteira cabe, com a margem, no eixo que aperta', () => {
    const c = enquadrar([1000, 2000, 3000, 3000], 400, 300, 20);
    expect(c).toMatchObject({ x: 2000, y: 2500 });
    expect(c.k).toBeCloseTo(360 / 2000);
  });

  it('limitar: escala entre os limites; onde o mundo cabe na janela, centro no meio', () => {
    const fit = enquadrar(BRASIL, 400, 400, 16);
    const solto = limitar({ x: 0, y: 0, k: fit.k / 10 }, BRASIL, fit.k, 1, 400, 400);
    expect(solto.k).toBe(fit.k);
    expect(solto.x).toBeCloseTo(2_350_000);
    const perto = limitar({ x: -1e9, y: 2e6, k: 0.01 }, BRASIL, fit.k, 1, 400, 400);
    // A borda do mundo pode entrar até 35% da meia janela, não mais.
    expect(perto.x).toBeCloseTo((200 / 0.01) * 0.65);
    expect(perto.y).toBe(2e6);
  });

  it('zoomEm: o ponto sob o cursor fica parado', () => {
    const a = { x: 500, y: 500, k: 0.5 };
    const b = zoomEm(a, 3, 100, 50, 400, 300);
    const mundo = (c: typeof a, sx: number, sy: number) => [c.x + (sx - 200) / c.k, c.y + (sy - 150) / c.k];
    expect(mundo(b, 100, 50)[0]).toBeCloseTo(mundo(a, 100, 50)[0]);
    expect(mundo(b, 100, 50)[1]).toBeCloseTo(mundo(a, 100, 50)[1]);
    expect(b.k).toBeCloseTo(1.5);
  });

  it('voo: começa e termina nas câmeras pedidas, perto ou longe', () => {
    const a = { x: 0, y: 0, k: 0.001 };
    for (const b of [{ x: 0, y: 0, k: 0.01 }, { x: 2e6, y: 1e6, k: 0.004 }]) {
      const v = voo(a, b, 800);
      expect(v(0).x).toBeCloseTo(a.x);
      expect(v(0).k).toBeCloseTo(a.k);
      expect(v(1)).toEqual(b);
      expect(v(0.5).k).toBeGreaterThan(0);
    }
  });

  it('suave = cubic-bezier(.2, .7, .1, 1): 0 → 0, 1 → 1, crescente e arrancando rápido', () => {
    expect(suave(0)).toBe(0);
    expect(suave(1)).toBe(1);
    expect(suave(0.25)).toBeGreaterThan(0.5);
    let anterior = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      expect(suave(t)).toBeGreaterThanOrEqual(anterior);
      anterior = suave(t);
    }
    expect(bezier(0.25, 0.25, 0.75, 0.75)(0.3)).toBeCloseTo(0.3);
  });
});
