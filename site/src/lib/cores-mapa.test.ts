import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CandidatoCamada, Valor } from './camada-mapa.ts';
import { corCandidato } from './cores.ts';
import {
  DEGRAUS,
  ESTAVEL,
  LIMIARES,
  PALETA,
  TOM_ESTAVEL,
  TOM_NEUTRO,
  TOM_SEM_DADO,
  linearDoHex,
  oklab,
  tonalizador,
  type ModoCor,
} from './cores-mapa.ts';

type Trio = [number, number, number];
const MODOS: ModoCor[] = ['resultado', 'variacao'];

// Fundo e "sem dado" lidos do tokens.css: se o tema mudar, o teste confere a escala contra o tema novo.
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const token = (nome: string): string => {
  const achado = tokens.match(new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})`));
  if (!achado) throw new Error(`token ${nome} sem hex em tokens.css`);
  return achado[1].toLowerCase();
};
const FUNDO = token('--bg');
const SEM_DADO = token('--surface-2');

const luminancia = (hex: string) => {
  const [r, g, b] = linearDoHex(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const distancia = (a: Trio, b: Trio) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const deltaE = (a: string, b: string, visao: (rgb: Trio) => Trio = (rgb) => rgb) =>
  distancia(oklab(visao(linearDoHex(a))), oklab(visao(linearDoHex(b))));

// Simulação de daltonismo de Machado, Oliveira e Fernandes (2009), severidade máxima, em RGB linear.
const matriz = (m: number[]) => (rgb: Trio): Trio =>
  [0, 1, 2].map((i) => Math.min(1, Math.max(0, m[3 * i] * rgb[0] + m[3 * i + 1] * rgb[1] + m[3 * i + 2] * rgb[2]))) as Trio;
const DALTONISMO = {
  protanopia: matriz([0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998]),
  deuteranopia: matriz([0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881]),
  tritanopia: matriz([1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039]),
};

describe('degraus', () => {
  it('derivam de lib/cores.ts: o último degrau é a cor cheia do candidato', () => {
    for (const modo of MODOS) {
      expect(DEGRAUS[modo]['13'].at(-1)).toBe(corCandidato(13, 0).hex);
      expect(DEGRAUS[modo]['22'].at(-1)).toBe(corCandidato(22, 1).hex);
    }
  });

  it('um degrau por faixa de limiar', () => {
    expect(DEGRAUS.resultado['13']).toHaveLength(LIMIARES.resultado.length + 1);
    expect(DEGRAUS.variacao['22']).toHaveLength(LIMIARES.variacao.length);
  });

  it('cada degrau é mais claro que o anterior e se distingue dele', () => {
    for (const modo of MODOS) {
      for (const lado of ['13', '22'] as const) {
        const d = DEGRAUS[modo][lado];
        for (let i = 1; i < d.length; i++) {
          expect(luminancia(d[i]), `${modo} ${lado} ${i}`).toBeGreaterThan(luminancia(d[i - 1]));
          expect(deltaE(d[i], d[i - 1]), `${modo} ${lado} ${i}`).toBeGreaterThan(0.04);
        }
      }
    }
  });

  it('o azul é mais claro que o vermelho do mesmo degrau: os lados se separam também em escala de cinza', () => {
    for (const modo of MODOS) {
      DEGRAUS[modo]['13'].forEach((vermelho, i) => {
        const azul = DEGRAUS[modo]['22'][i];
        expect(luminancia(azul), `${modo} ${i}`).toBeGreaterThan(luminancia(vermelho));
        expect(contraste(azul, vermelho), `${modo} ${i}`).toBeGreaterThan(1.4);
      });
    }
  });

  it('vermelho e azul do mesmo degrau seguem distintos com protanopia, deuteranopia e tritanopia', () => {
    for (const [nome, visao] of Object.entries(DALTONISMO)) {
      for (const modo of MODOS) {
        DEGRAUS[modo]['13'].forEach((vermelho, i) => {
          expect(deltaE(vermelho, DEGRAUS[modo]['22'][i], visao), `${nome} ${modo} ${i}`).toBeGreaterThan(0.1);
        });
      }
    }
  });

  it('todo degrau aparece no fundo e não se confunde com "sem dado" nem com "estável"', () => {
    for (const modo of MODOS) {
      for (const cor of [...DEGRAUS[modo]['13'], ...DEGRAUS[modo]['22']]) {
        expect(contraste(cor, FUNDO), cor).toBeGreaterThan(2);
        expect(deltaE(cor, SEM_DADO), cor).toBeGreaterThan(0.1);
        expect(deltaE(cor, ESTAVEL), cor).toBeGreaterThan(0.07);
      }
    }
    expect(deltaE(ESTAVEL, SEM_DADO)).toBeGreaterThan(0.05);
    expect(contraste(ESTAVEL, FUNDO)).toBeGreaterThan(1.8);
  });

  it('a paleta usa os tokens de "sem dado" e de neutro, não hex copiado', () => {
    expect(PALETA[TOM_SEM_DADO]).toBe('var(--surface-2)');
    expect(PALETA[TOM_NEUTRO]).toBe('var(--ink-2)');
    expect(PALETA[TOM_ESTAVEL]).toBe(ESTAVEL);
  });
});

const LULA_BOLSONARO_2022: [CandidatoCamada, CandidatoCamada] = [
  { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
  { n: 22, nome: 'Jair Bolsonaro', partido: 'PL', cor: '22' },
];
// 2018: o Bolsonaro era o 17 (PSL); a cor vem do dado, não do número.
const HADDAD_BOLSONARO_2018: [CandidatoCamada, CandidatoCamada] = [
  { n: 13, nome: 'Fernando Haddad', partido: 'PT', cor: '13' },
  { n: 17, nome: 'Jair Bolsonaro', partido: 'PSL', cor: '22' },
];
const v = (a: number, b: number, extra: Partial<Valor> = {}): Valor => ({ a, b, outros: 0, liderOutro: null, secoes: 100, ...extra });
const cor = (tom: number) => PALETA[tom];

describe('tonalizador: resultado', () => {
  const tom = tonalizador('resultado', LULA_BOLSONARO_2022);

  it('sem valor, ou sem seção apurada, é "sem dado"', () => {
    expect(tom(undefined)).toBe(TOM_SEM_DADO);
    expect(tom(v(0, 0, { secoes: 0 }))).toBe(TOM_SEM_DADO);
    expect(tom(v(60, 40, { secoes: 0 }))).toBe(TOM_SEM_DADO);
  });

  it('abaixo de 1% das seções é "sem dado", como "aguardando primeiras seções" do painel', () => {
    expect(tom(v(60, 40, { secoes: 0.9 }))).toBe(TOM_SEM_DADO);
    expect(tom(v(60, 40, { secoes: 1 }))).not.toBe(TOM_SEM_DADO);
  });

  it('cor de quem lidera, degrau pela margem', () => {
    expect(cor(tom(v(52, 48)))).toBe(DEGRAUS.resultado['13'][0]);
    expect(cor(tom(v(60, 40)))).toBe(DEGRAUS.resultado['13'][2]);
    expect(cor(tom(v(20, 80)))).toBe(DEGRAUS.resultado['22'][4]);
    expect(cor(tom(v(45, 55)))).toBe(DEGRAUS.resultado['22'][1]);
  });

  it('o limiar abre o degrau de cima', () => {
    expect(cor(tom(v(52.5, 47.5)))).toBe(DEGRAUS.resultado['13'][1]);
    expect(cor(tom(v(75, 25)))).toBe(DEGRAUS.resultado['13'][4]);
  });

  it('outro candidato à frente é neutro; empate é o tom estável', () => {
    expect(tom(v(20, 30, { outros: 50, liderOutro: 12 }))).toBe(TOM_NEUTRO);
    expect(tom(v(50, 50))).toBe(TOM_ESTAVEL);
  });

  it('2018: o 17 veste a cor do 22, pelo campo "cor"', () => {
    expect(cor(tonalizador('resultado', HADDAD_BOLSONARO_2018)(v(40, 60)))).toBe(DEGRAUS.resultado['22'][2]);
  });

  it('candidato sem cor fica neutro', () => {
    const semCor: [CandidatoCamada, CandidatoCamada] = [LULA_BOLSONARO_2022[0], { n: 45, nome: 'X', partido: 'Y', cor: null }];
    expect(tonalizador('resultado', semCor)(v(30, 70))).toBe(TOM_NEUTRO);
  });
});

describe('tonalizador: variação', () => {
  const tom = tonalizador('variacao', LULA_BOLSONARO_2022, HADDAD_BOLSONARO_2018);

  it('Δ = fatia do 13 entre os dois agora − antes, na cor de quem ganhou terreno', () => {
    // 2018: 50 × 50; 2022: 60 × 40: o 13 ganhou 10 pontos, o último degrau.
    expect(cor(tom(v(60, 40), v(50, 50)))).toBe(DEGRAUS.variacao['13'][3]);
    // 55 × 45 para 53,5 × 46,5: o 22 ganhou 1,5 ponto, o primeiro degrau.
    expect(cor(tom(v(53.5, 46.5), v(55, 45)))).toBe(DEGRAUS.variacao['22'][0]);
  });

  it('é o número do placar: no 1º turno a conta é refeita só entre os dois, e a queda de "outros" não é ganho de ninguém', () => {
    // 30 × 10 (outros 60) e 15 × 5 (outros 80): a fatia do 13 é 75 nas duas, então estável; em pontos sobre válidos seria +10.
    expect(tom(v(30, 10, { outros: 60 }), v(15, 5, { outros: 80 }))).toBe(TOM_ESTAVEL);
  });

  it('abaixo do primeiro limiar é estável', () => {
    expect(tom(v(50.5, 49.5), v(50, 50))).toBe(TOM_ESTAVEL);
  });

  it('sem referência para o município, "sem dado"', () => {
    expect(tom(v(60, 40), undefined)).toBe(TOM_SEM_DADO);
    expect(tonalizador('variacao', LULA_BOLSONARO_2022, null)(v(60, 40))).toBe(TOM_SEM_DADO);
  });

  it('alinha pela cor, não pela coluna: referência com o 22 na coluna A', () => {
    const invertida: [CandidatoCamada, CandidatoCamada] = [LULA_BOLSONARO_2022[1], LULA_BOLSONARO_2022[0]];
    // antes: 22 com 70 na coluna A, 13 com 30 na B (fatia do 13 = 30); agora 13 × 22 = 45 × 55 (fatia 45): o 13 ganhou 15.
    expect(cor(tonalizador('variacao', LULA_BOLSONARO_2022, invertida)(v(45, 55), v(70, 30)))).toBe(DEGRAUS.variacao['13'][3]);
  });

  it('todo tom devolvido existe na paleta', () => {
    for (let a = 0; a <= 100; a += 7) {
      for (let b = 0; b <= 100 - a; b += 11) {
        expect(PALETA[tom(v(a, b, { outros: 100 - a - b }), v(b, a))]).toBeDefined();
      }
    }
  });
});
