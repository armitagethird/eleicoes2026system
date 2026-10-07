import { describe, expect, it } from 'vitest';
import { PALAVRAS_PROIBIDAS, listaDeAnos, tituloGraficoAnos } from './copy.ts';
import { diaMesCurto } from './format.ts';
import { larguraTexto } from './destino.ts';
import { LAYOUTS, afastar, dominioY, nomesCurtos, renderGrafico, renderTabela, type DadosGrafico } from './grafico-linha.ts';
import { ANOS, comAoVivo, lerAoVivo, pontosDe, type Ano, type Ponto, type SerieJson } from './serie-historica.ts';

const haddad = { n: 13, nome: 'Fernando Haddad', partido: 'PT', cor: '13' } as const;
const jair17 = { n: 17, nome: 'Jair Bolsonaro', partido: 'PSL', cor: '22' } as const;
const lula = { n: 13, nome: 'Lula', partido: 'PT', cor: '13' } as const;
const jair22 = { n: 22, nome: 'Jair Bolsonaro', partido: 'PL', cor: '22' } as const;
const flavio = { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', cor: '22' } as const;

// O Brasil real de cada camada (site/src/data/README.md).
const BRASIL: SerieJson = {
  v: 1,
  nome: 'Brasil',
  cand: [
    { id: '2018-t1', a: haddad, b: jair17 },
    { id: '2018-t2', a: haddad, b: jair17 },
    { id: '2022-t1', a: lula, b: jair22 },
    { id: '2022-t2', a: lula, b: jair22 },
    { id: '2026-t1', a: lula, b: flavio },
  ],
  linhas: [
    [29.28, 46.03, 24.69],
    [44.87, 55.13, 0],
    [48.43, 43.2, 8.37],
    [50.9, 49.1, 0],
    [45.16, 47.03, 7.81],
  ],
};

const aoVivo = (a: number, b: number, modo: 'live' | 'final' = 'live', secoes = 67) =>
  lerAoVivo(
    {
      secoes_pct: secoes,
      atualizado: '2026-10-25T18:42:10-03:00',
      presidente: {
        cand: [
          { n: 13, nome: 'Lula', partido: 'PT', pct: a },
          { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', pct: b },
        ],
      },
    },
    modo,
  );

const base = pontosDe(BRASIL) as Ponto[];
const dados = (pontos: readonly Ponto[] = base, lugar = 'Brasil'): DadosGrafico => ({ pontos, lugar, vazio: '25 out' });
const NOMES_LAYOUT = ['compacto', 'medio', 'largo'] as const;

// Ajudantes para ler o SVG como string (o vitest daqui roda em node, sem DOM).
const tags = (svg: string, classe: string): string[] => [...svg.matchAll(new RegExp(`<[a-z]+ class="${classe}"[^>]*>`, 'g'))].map((m) => m[0]);
const attr = (tag: string, nome: string): string => new RegExp(` ${nome}="([^"]*)"`).exec(tag)?.[1] ?? '';
const grupos = (svg: string, classe: string): string[] => [...svg.matchAll(new RegExp(`<g class="${classe}"[^>]*>.*?</g>`, 'gs'))].map((m) => m[0]);
const textos = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const caixa = (tag: string) => ({ x: Number(attr(tag, 'x')), y: Number(attr(tag, 'y')), w: Number(attr(tag, 'width')), h: Number(attr(tag, 'height')) });
const sobrepoe = (a: ReturnType<typeof caixa>, b: ReturnType<typeof caixa>): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('dominioY', () => {
  it('vai de 0 a um múltiplo de 10 que cobre os dados e nunca fica abaixo de 60 (o 50% precisa de folga em cima)', () => {
    expect(dominioY([29.28, 55.13, 24.69])).toEqual({ max: 60, passo: 10 });
    expect(dominioY([12, 38])).toEqual({ max: 60, passo: 10 });
    expect(dominioY([61])).toEqual({ max: 70, passo: 10 });
  });

  it('com a escala alta, a grade anda de 20 em 20; o teto é 100', () => {
    expect(dominioY([85.3])).toEqual({ max: 90, passo: 20 });
    expect(dominioY([100])).toEqual({ max: 100, passo: 20 });
  });
});

describe('afastar', () => {
  it('quem não se encosta fica onde queria', () => {
    expect(afastar([{ y: 20, h: 10 }, { y: 60, h: 10 }], 4, 0, 100)).toEqual([20, 60]);
  });

  it('dois que se sobrepõem se afastam por igual, na mesma ordem, deixando a folga', () => {
    const [a, b] = afastar([{ y: 50, h: 20 }, { y: 54, h: 20 }], 4, 0, 200);
    expect(b - a).toBeCloseTo(24, 5);
    expect((a + b) / 2).toBeCloseTo(52, 5);
  });

  it('não muda a ordem de quem entra e respeita os limites', () => {
    const ys = afastar([{ y: 98, h: 20 }, { y: 100, h: 20 }, { y: 99, h: 20 }], 2, 10, 120);
    expect(ys[0]).toBeLessThan(ys[2]);
    expect(ys[2]).toBeLessThan(ys[1]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(120);
  });
});

describe('nomesCurtos', () => {
  it('sobrenome; e o primeiro nome quando dois candidatos dividem o sobrenome (Jair e Flávio Bolsonaro)', () => {
    const curtos = nomesCurtos(base);
    expect(curtos.get('Fernando Haddad')).toBe('Haddad');
    expect(curtos.get('Lula')).toBe('Lula');
    expect(curtos.get('Jair Bolsonaro')).toBe('Jair');
    expect(curtos.get('Flávio Bolsonaro')).toBe('Flávio');
  });

  it('conta também os candidatos de eleições sem dado: o nome não muda de uma cidade para outra', () => {
    const soFlavio = base.map((p) => (p.id === '2026-t1' ? p : { ...p, a: null, b: null, outros: null }));
    expect(nomesCurtos(soFlavio).get('Flávio Bolsonaro')).toBe('Bolsonaro');
    expect(nomesCurtos(soFlavio, ['Jair Bolsonaro', 'Flávio Bolsonaro']).get('Flávio Bolsonaro')).toBe('Flávio');
  });
});

describe('renderGrafico: o que desenha', () => {
  it.each(NOMES_LAYOUT)('layout %s: o do PT (A) vem antes do de Bolsonaro (B) nas linhas, nos pontos e na descrição', (nome) => {
    const svg = renderGrafico(dados(), LAYOUTS[nome], 'g');
    expect(svg.indexOf('data-serie="a"')).toBeGreaterThan(-1);
    expect(svg.indexOf('data-serie="a"')).toBeLessThan(svg.indexOf('data-serie="b"'));
    const pontos = tags(svg, 'gl-ponto').filter((t) => attr(t, 'data-id') === '2022-t2').map((t) => attr(t, 'data-lado'));
    expect(pontos).toEqual(['a', 'b']);
    const desc = /<desc[^>]*>([^<]*)<\/desc>/.exec(svg)?.[1] ?? '';
    expect(desc.indexOf('Fernando Haddad 29,3%')).toBeGreaterThan(-1);
    expect(desc.indexOf('Fernando Haddad 29,3%')).toBeLessThan(desc.indexOf('Jair Bolsonaro 46,0%'));
    expect(desc.indexOf('Lula 50,9%')).toBeLessThan(desc.indexOf('Jair Bolsonaro 49,1%'));
  });

  it('em 2018 o 17 usa a cor "22" (azul claro); o 13 usa a "13"; nenhum hex solto', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const [jair] = grupos(svg, 'gl-ponto').filter((g) => g.includes('data-id="2018-t1"') && g.includes('data-lado="b"'));
    expect(jair).toContain('data-cor="22"');
    expect(jair).toContain('var(--cand-22)');
    expect(jair).not.toContain('var(--cand-13)');
    const [fernando] = grupos(svg, 'gl-ponto').filter((g) => g.includes('data-id="2018-t1"') && g.includes('data-lado="a"'));
    expect(fernando).toContain('var(--cand-13)');
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('a cor da linha de Bolsonaro vem do campo cor da camada, não do número de urna', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const linhaB = tags(svg, 'gl-linha').find((t) => attr(t, 'data-serie') === 'b') ?? '';
    expect(linhaB).toContain('var(--cand-22)');
  });

  it('o valor de cada ponto vem com o nome (curto) de quem era candidato naquela eleição', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const por = (id: string, lado: string) => grupos(svg, 'gl-ponto').find((g) => g.includes(`data-id="${id}"`) && g.includes(`data-lado="${lado}"`)) ?? '';
    expect(por('2018-t1', 'a')).toContain('>HADDAD<');
    expect(por('2018-t1', 'a')).toContain('>29,3<');
    expect(por('2018-t2', 'b')).toContain('>JAIR<');
    expect(por('2018-t2', 'b')).toContain('>55,1<');
    expect(por('2022-t1', 'a')).toContain('>LULA<');
    expect(por('2026-t1', 'b')).toContain('>FLÁVIO<');
    expect(por('2026-t1', 'b')).toContain('>47,0<');
  });

  it('numa cidade que só tem 2026, o nome continua sendo "Flávio" quando a série diz que há dois Bolsonaro', () => {
    const soFlavio = base.map((p) => (p.id === '2026-t1' ? p : { ...p, a: null, b: null, outros: null }));
    const svg = renderGrafico({ ...dados(soFlavio), nomes: ['Jair Bolsonaro', 'Flávio Bolsonaro'] }, LAYOUTS.compacto, 'g');
    expect(svg).toContain('>FLÁVIO<');
    expect(svg).not.toContain('>BOLSONARO<');
  });

  it('no layout largo o nome leva o número de urna: Jair 17 em 2018, Jair 22 em 2022', () => {
    const svg = renderGrafico(dados(), LAYOUTS.largo, 'g');
    const por = (id: string) => grupos(svg, 'gl-ponto').find((g) => g.includes(`data-id="${id}"`) && g.includes('data-lado="b"')) ?? '';
    expect(por('2018-t2')).toContain('>JAIR 17<');
    expect(por('2022-t2')).toContain('>JAIR 22<');
  });

  it('o rótulo direto do fim das linhas traz número e nome do último ponto, sem legenda à parte', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const fins = grupos(svg, 'gl-fim');
    expect(fins).toHaveLength(2);
    expect(fins[0]).toContain('>13<');
    expect(fins[0]).toContain('>LULA<');
    expect(fins[1]).toContain('>22<');
    expect(fins[1]).toContain('>FLÁVIO<');
    expect(svg).not.toContain('gl-legenda');
  });

  it('marca de 50% só nos 2º turnos, todas na mesma altura', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const marcas = tags(svg, 'gl-meta');
    expect(marcas.map((t) => attr(t, 'data-id'))).toEqual(['2018-t2', '2022-t2', '2026-t2']);
    expect(new Set(marcas.map((t) => /M[\d.]+ ([\d.]+)/.exec(attr(t, 'd'))?.[1])).size).toBe(1);
  });

  it('"outros" é uma coluna discreta em --ink-2, só nos 1º turnos', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const colunas = tags(svg, 'gl-outros');
    expect(colunas.map((t) => attr(t, 'data-id'))).toEqual(['2018-t1', '2022-t1', '2026-t1']);
    for (const t of colunas) expect(t).toContain('var(--ink-2)');
    expect(textos(svg)).toEqual(expect.arrayContaining(['24,7', '8,4', '7,8', 'OUTROS']));
  });

  it('todo texto do gráfico sai em caixa-alta (o 900 só carrega o subset de caixa-alta)', () => {
    for (const nome of NOMES_LAYOUT) {
      for (const t of textos(renderGrafico(dados(comAoVivo(base, aoVivo(49.3, 50.7))), LAYOUTS[nome], 'g'))) {
        expect(t, t).toBe(t.toLocaleUpperCase('pt-BR'));
      }
    }
  });

  it('sem JavaScript, sem biblioteca e sem estilo inclinado: só SVG puro', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    expect(svg).not.toMatch(/<script|<image|<filter|rotate|skew|textLength|lengthAdjust|gradient/i);
  });
});

describe('renderGrafico: escala', () => {
  const centro = (t: string) => {
    const c = caixa(t);
    return c.y + c.h / 2;
  };
  const marcas = (svg: string, lado: string) =>
    tags(svg, 'gl-marca').filter((t) => attr(t, 'data-lado') === lado).map((t) => ({ id: attr(t, 'data-id'), pct: Number(attr(t, 'data-pct')), y: centro(t) }));

  it.each(NOMES_LAYOUT)('layout %s: percentual maior fica mais alto, de forma linear, e 0 e 50 batem com a grade', (nome) => {
    const svg = renderGrafico(dados(), LAYOUTS[nome], 'g');
    const todas = [...marcas(svg, 'a'), ...marcas(svg, 'b')].sort((x, y) => x.pct - y.pct);
    for (let i = 1; i < todas.length; i++) expect(todas[i].y).toBeLessThanOrEqual(todas[i - 1].y);
    const [p, q] = [todas[0], todas[todas.length - 1]];
    const porPonto = (q.y - p.y) / (q.pct - p.pct);
    for (const m of todas) expect(m.y - p.y).toBeCloseTo(porPonto * (m.pct - p.pct), 0);
    const base0 = p.y - porPonto * p.pct;
    const cinquenta = /M[\d.]+ ([\d.]+)/.exec(attr(tags(svg, 'gl-meta')[0], 'd'))?.[1];
    expect(Number(cinquenta)).toBeCloseTo(base0 + porPonto * 50, 0);
  });

  it('dentro de uma coluna, quem tem mais votos fica com a plaquinha acima e o outro abaixo', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const plaq = (id: string, lado: string) => {
      const g = grupos(svg, 'gl-ponto').find((x) => x.includes(`data-id="${id}"`) && x.includes(`data-lado="${lado}"`)) ?? '';
      return caixa(tags(g, 'gl-plaq')[0]);
    };
    expect(plaq('2018-t2', 'b').y).toBeLessThan(plaq('2018-t2', 'a').y);
    expect(plaq('2022-t2', 'a').y).toBeLessThan(plaq('2022-t2', 'b').y);
  });
});

describe('renderGrafico: estados do 2º turno de 2026', () => {
  it('antes do dia 25: ponto vazio com a data, sem linha nem valor nesse ponto', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    expect(grupos(svg, 'gl-vazio')).toHaveLength(1);
    expect(grupos(svg, 'gl-vazio')[0]).toContain('>25 OUT<');
    expect(tags(svg, 'gl-ponto').filter((t) => attr(t, 'data-id') === '2026-t2')).toHaveLength(0);
  });

  it('ao vivo (parcial): os pontos entram vazados, com a fase marcada; não há ponto vazio', () => {
    const svg = renderGrafico(dados(comAoVivo(base, aoVivo(49.31, 50.69))), LAYOUTS.compacto, 'g');
    expect(grupos(svg, 'gl-vazio')).toHaveLength(0);
    const vivos = tags(svg, 'gl-ponto').filter((t) => attr(t, 'data-id') === '2026-t2');
    expect(vivos.map((t) => [attr(t, 'data-lado'), attr(t, 'data-fase')])).toEqual([['a', 'parcial'], ['b', 'parcial']]);
    expect(svg).toContain('>49,3<');
    expect(svg).toContain('>50,7<');
  });

  it('final: pontos cheios, fase "final"', () => {
    const svg = renderGrafico(dados(comAoVivo(base, aoVivo(49.31, 50.69, 'final', 100))), LAYOUTS.compacto, 'g');
    const vivos = tags(svg, 'gl-ponto').filter((t) => attr(t, 'data-id') === '2026-t2');
    expect(vivos.map((t) => attr(t, 'data-fase'))).toEqual(['final', 'final']);
  });

  it('as linhas chegam ao ponto ao vivo', () => {
    const sem = tags(renderGrafico(dados(), LAYOUTS.compacto, 'g'), 'gl-linha').filter((t) => attr(t, 'data-serie') === 'a');
    const com = tags(renderGrafico(dados(comAoVivo(base, aoVivo(49.31, 50.69))), LAYOUTS.compacto, 'g'), 'gl-linha').filter((t) => attr(t, 'data-serie') === 'a');
    expect(com.at(-1)).not.toBe(sem.at(-1));
    expect(attr(com[0], 'd').split(' ').length).toBeGreaterThan(attr(sem[0], 'd').split(' ').length);
  });
});

describe('renderGrafico: pontos ausentes não quebram', () => {
  const sem = (ids: string[], pontos: readonly Ponto[] = base): Ponto[] => pontos.map((p) => (ids.includes(p.id) ? { ...p, a: null, b: null, outros: null } : p));
  const linhasDe = (svg: string, lado: string) => tags(svg, 'gl-linha').filter((t) => attr(t, 'data-serie') === lado);

  it('cidade sem 2018 nem 2022 (Boa Esperança do Norte): só o 1º turno de 2026, sem linha, e cada vazio diz "sem dado"', () => {
    const pontos = sem(['2018-t1', '2018-t2', '2022-t1', '2022-t2']);
    for (const nome of NOMES_LAYOUT) {
      const svg = renderGrafico(dados(pontos, 'Boa Esperança do Norte (MT)'), LAYOUTS[nome], 'g');
      expect(linhasDe(svg, 'a')).toHaveLength(0);
      expect(tags(svg, 'gl-ponto').map((t) => attr(t, 'data-id'))).toEqual(['2026-t1', '2026-t1']);
      expect(grupos(svg, 'gl-semdado')).toHaveLength(4);
    }
  });

  it('a linha não atravessa um ponto que falta: dois trechos, não um', () => {
    const svg = renderGrafico(dados(sem(['2022-t1', '2022-t2'], comAoVivo(base, aoVivo(49.31, 50.69)))), LAYOUTS.compacto, 'g');
    expect(linhasDe(svg, 'a')).toHaveLength(2);
    expect(linhasDe(svg, 'b')).toHaveLength(2);
  });

  it('um lado só com dado (o outro null) desenha o que há', () => {
    const pontos = base.map((p) => (p.id === '2022-t2' ? { ...p, b: null } : p));
    const svg = renderGrafico(dados(pontos), LAYOUTS.compacto, 'g');
    expect(tags(svg, 'gl-ponto').filter((t) => attr(t, 'data-id') === '2022-t2').map((t) => attr(t, 'data-lado'))).toEqual(['a']);
  });

  it('tudo ausente: ainda sai um SVG válido, sem pontos', () => {
    const svg = renderGrafico(dados(sem(['2018-t1', '2018-t2', '2022-t1', '2022-t2', '2026-t1'])), LAYOUTS.compacto, 'g');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(tags(svg, 'gl-ponto')).toHaveLength(0);
  });

  it('lista vazia de pontos também não quebra', () => {
    expect(() => renderGrafico(dados([]), LAYOUTS.compacto, 'g')).not.toThrow();
  });
});

describe('renderGrafico: geometria', () => {
  const cenarios: Array<[string, Ponto[]]> = [
    ['pre', base],
    ['ao vivo', comAoVivo(base, aoVivo(49.31, 50.69))],
    ['empate no ao vivo', comAoVivo(base, aoVivo(50, 50))],
    ['quase empate no ao vivo', comAoVivo(base, aoVivo(49.9, 50.1, 'final', 100))],
  ];

  it.each(NOMES_LAYOUT.flatMap((nome) => cenarios.map(([c, p]) => [nome, c, p] as const)))(
    'layout %s, %s: nenhuma plaquinha se sobrepõe a outra e todas ficam dentro do SVG',
    (nome, _cenario, pontos) => {
      const layout = LAYOUTS[nome];
      const svg = renderGrafico(dados(pontos), layout, 'g');
      const plaquinhas = tags(svg, 'gl-plaq').map(caixa);
      expect(plaquinhas.length).toBeGreaterThanOrEqual(10);
      for (const c of plaquinhas) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(layout.largura);
        expect(c.y + c.h).toBeLessThanOrEqual(layout.altura);
      }
      plaquinhas.forEach((a, i) => plaquinhas.slice(i + 1).forEach((b) => expect(sobrepoe(a, b), `${JSON.stringify(a)} x ${JSON.stringify(b)}`).toBe(false)));
    },
  );

  it('a pilha de baixo que cobriria o topo da coluna de "outros" sobe (2018, 1º turno: Haddad em 29% e outros em 25%)', () => {
    const svg = renderGrafico(dados(), LAYOUTS.compacto, 'g');
    const haddad = grupos(svg, 'gl-ponto').find((g) => g.includes('data-id="2018-t1"') && g.includes('data-lado="a"')) ?? '';
    const [plaq, marca] = [caixa(tags(haddad, 'gl-plaq')[0]), caixa(tags(haddad, 'gl-marca')[0])];
    expect(plaq.y + plaq.h).toBeLessThanOrEqual(marca.y + 0.1);
  });

  it.each(NOMES_LAYOUT)('layout %s: nenhum texto passa da borda do SVG, nem os rótulos do fim das linhas', (nome) => {
    const layout = LAYOUTS[nome];
    for (const pontos of [base, comAoVivo(base, aoVivo(49.31, 50.69))]) {
      const svg = renderGrafico(dados(pontos), layout, 'g');
      for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)) {
        const [, xs, ys, atributos, conteudo] = m;
        const tam = Number(/font-size="([\d.]+)"/.exec(atributos)?.[1] ?? layout.fonte);
        const w = larguraTexto(conteudo, layout.wdth, tam);
        const ancora = /text-anchor="(\w+)"/.exec(atributos)?.[1];
        const x = Number(xs);
        const [de, ate] = ancora === 'end' ? [x - w, x] : ancora === 'start' ? [x, x + w] : [x - w / 2, x + w / 2];
        expect(de, conteudo).toBeGreaterThanOrEqual(0);
        expect(ate, conteudo).toBeLessThanOrEqual(layout.largura);
        expect(Number(ys), conteudo).toBeLessThanOrEqual(layout.altura);
      }
    }
  });

  it.each(NOMES_LAYOUT)('layout %s: nenhum rótulo da 1ª coluna invade os rótulos do eixo Y, seja qual for a altura do ponto', (nome) => {
    const layout = LAYOUTS[nome];
    const intervalo = (m: RegExpMatchArray) => {
      const [, xs, ys, atributos, conteudo] = m;
      const w = larguraTexto(conteudo, layout.wdth, Number(/font-size="([\d.]+)"/.exec(atributos)?.[1] ?? layout.fonte));
      const ancora = /text-anchor="(\w+)"/.exec(atributos)?.[1];
      const x = Number(xs);
      const [de, ate] = ancora === 'end' ? [x - w, x] : ancora === 'start' ? [x, x + w] : [x - w / 2, x + w / 2];
      return { de, ate, y: Number(ys), eixo: ancora === 'end' && conteudo.endsWith('%'), conteudo };
    };
    for (const pct of [12, 21, 29.28, 33, 38, 47, 52, 58]) {
      const pontos = base.map((p) => (p.id === '2018-t1' && p.a ? { ...p, a: { ...p.a, pct } } : p));
      const textos = [...renderGrafico(dados(pontos), layout, 'g').matchAll(/<text x="([\d.]+)" y="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)].map(intervalo);
      const eixo = textos.filter((m) => m.eixo);
      for (const outro of textos.filter((m) => !m.eixo)) {
        for (const rotulo of eixo.filter((m) => Math.abs(m.y - outro.y) < layout.fonte)) {
          expect(outro.de >= rotulo.ate + 2 || outro.ate <= rotulo.de, `${outro.conteudo} x ${rotulo.conteudo} (Haddad em ${pct})`).toBe(true);
        }
      }
    }
  });

  it('cidade com um lado quase em zero: a plaquinha de baixo não invade o eixo X', () => {
    const extremo = base.map((p) => (p.id === '2022-t2' && p.a && p.b ? { ...p, a: { ...p.a, pct: 3.2 }, b: { ...p.b, pct: 96.8 } } : p));
    const layout = LAYOUTS.compacto;
    const svg = renderGrafico(dados(extremo), layout, 'g');
    const chao = layout.altura - layout.rodape;
    for (const t of tags(svg, 'gl-plaq')) expect(caixa(t).y + caixa(t).h).toBeLessThanOrEqual(chao);
  });

  it('o viewBox é o do layout, para o SVG escalar sem mudar de proporção', () => {
    for (const nome of NOMES_LAYOUT) {
      const { largura, altura } = LAYOUTS[nome];
      expect(renderGrafico(dados(), LAYOUTS[nome], 'g')).toContain(`viewBox="0 0 ${largura} ${altura}"`);
    }
  });
});

describe('renderGrafico: acessibilidade e segurança', () => {
  it('<title> e <desc> trazem o lugar e os números de todas as eleições', () => {
    const svg = renderGrafico(dados(comAoVivo(base, aoVivo(49.31, 50.69))), LAYOUTS.compacto, 'hist');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-labelledby="hist-t hist-d"');
    expect(svg).toMatch(/<title id="hist-t">[^<]*Brasil[^<]*<\/title>/);
    const desc = /<desc id="hist-d">([^<]*)<\/desc>/.exec(svg)?.[1] ?? '';
    for (const trecho of ['1º turno 2018', 'Fernando Haddad 29,3%', 'Jair Bolsonaro 46,0%', 'outros 24,7%', '2º turno 2022', 'Lula 50,9%', 'Flávio Bolsonaro 50,7%', 'parcial · 67% das seções']) {
      expect(desc, trecho).toContain(trecho);
    }
  });

  it('no pre a descrição diz quando o 2º turno de 2026 chega, sem inventar número', () => {
    const desc = /<desc[^>]*>([^<]*)<\/desc>/.exec(renderGrafico(dados(), LAYOUTS.compacto, 'g'))?.[1] ?? '';
    expect(desc).toContain('2º turno 2026: 25 out');
  });

  it('texto vindo de fora (nome do lugar) é escapado', () => {
    const svg = renderGrafico(dados(base, `<img src=x onerror=alert(1)> & "aspas"`), LAYOUTS.compacto, 'g');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;aspas&quot;');
  });

  it('nenhuma palavra proibida no que o gráfico escreve', () => {
    const svg = renderGrafico(dados(comAoVivo(base, aoVivo(49.31, 50.69))), LAYOUTS.compacto, 'g').toLowerCase();
    for (const palavra of [...PALAVRAS_PROIBIDAS, 'lidera', 'eleito']) expect(svg).not.toContain(palavra);
  });
});

describe('renderTabela', () => {
  const tabela = renderTabela(dados(comAoVivo(base, aoVivo(49.31, 50.69))));
  const linhas = [...tabela.matchAll(/<tr>.*?<\/tr>/gs)].map((m) => m[0]);

  it('uma linha por eleição na ordem do eixo, mais o cabeçalho; PT antes de Bolsonaro', () => {
    expect(linhas).toHaveLength(7);
    expect(tabela.indexOf('PT')).toBeLessThan(tabela.indexOf('Bolsonaro'));
    const turnos = linhas.slice(1).map((l) => /<th scope="row">([^<]*)/.exec(l)?.[1]);
    expect(turnos).toEqual(['1º turno 2018', '2º turno 2018', '1º turno 2022', '2º turno 2022', '1º turno 2026', '2º turno 2026']);
  });

  it('cada célula diz quem era o candidato e o percentual; 2018 mostra o 17', () => {
    expect(linhas[1]).toContain('Fernando Haddad (13)');
    expect(linhas[1]).toContain('Jair Bolsonaro (17)');
    expect(linhas[1]).toContain('29,3%');
    expect(linhas[1]).toContain('24,7%');
    expect(linhas[3]).toContain('Jair Bolsonaro (22)');
  });

  it('o 2º turno de 2026 no ao vivo diz que é parcial; antes do dia 25 mostra a data; ponto sem dado vira traço', () => {
    expect(linhas[6]).toContain('parcial · 67% das seções');
    expect(renderTabela(dados())).toContain('25 out');
    const semAno = renderTabela(dados(base.map((p) => (p.id === '2018-t1' ? { ...p, a: null, b: null, outros: null } : p))));
    expect(semAno).toContain('sem dado');
  });

  it('escapa texto vindo de fora', () => {
    expect(renderTabela(dados(base, '<b>x</b>'))).not.toContain('<b>x</b>');
  });
});

// Seleção de eleições (decisão do Romero, 06/10): o gráfico abre com todas e mostra qualquer subconjunto não vazio.
const SUBCONJUNTOS: Ano[][] = [[2018], [2022], [2026], [2018, 2022], [2018, 2026], [2022, 2026], [2018, 2022, 2026]];
const selecao = (anos: Ano[], pontos: readonly Ponto[] = base): DadosGrafico => ({ ...dados(pontos), anos });
const pontosVivo = comAoVivo(base, aoVivo(49.31, 50.69));
const rotulosTurno = (svg: string): string[] => textos(svg).filter((t) => /^[12]º( TURNO)?$/.test(t));
const rotulosAno = (svg: string): string[] => textos(svg).filter((t) => /^20\d\d$/.test(t));
const COMBINACOES = NOMES_LAYOUT.flatMap((nome) => SUBCONJUNTOS.map((anos) => [nome, anos] as const));

describe('renderGrafico: seleção de eleições', () => {
  it.each(NOMES_LAYOUT)('layout %s: com todas as eleições (ou sem escolha) o desenho é o mesmo de sempre', (nome) => {
    const completo = renderGrafico(dados(), LAYOUTS[nome], 'g');
    expect(renderGrafico(selecao([...ANOS]), LAYOUTS[nome], 'g')).toBe(completo);
    expect(renderGrafico(selecao([]), LAYOUTS[nome], 'g')).toBe(completo);
  });

  it.each(COMBINACOES)('layout %s, %j: o eixo X mostra só os turnos das eleições escolhidas, na ordem do tempo', (nome, anos) => {
    const svg = renderGrafico(selecao([...anos], pontosVivo), LAYOUTS[nome], 'g');
    expect(rotulosTurno(svg).map((t) => t[0])).toEqual(anos.flatMap(() => ['1', '2']));
    expect(rotulosAno(svg)).toEqual(anos.map(String));
    const idsDe = (classe: string) => tags(svg, classe).map((t) => attr(t, 'data-id'));
    expect(new Set(idsDe('gl-ponto'))).toEqual(new Set(anos.flatMap((ano) => [`${ano}-t1`, `${ano}-t2`])));
    expect(tags(svg, 'gl-ponto')).toHaveLength(anos.length * 4);
    expect(idsDe('gl-meta')).toEqual(anos.map((ano) => `${ano}-t2`));
    expect(idsDe('gl-outros')).toEqual(anos.map((ano) => `${ano}-t1`));
    expect(tags(svg, 'gl-ano')).toHaveLength(anos.length);
  });

  it.each(COMBINACOES)('layout %s, %j: as divisórias separam as eleições escolhidas, no meio entre o último e o primeiro turno vizinhos', (nome, anos) => {
    const svg = renderGrafico(selecao([...anos], pontosVivo), LAYOUTS[nome], 'g');
    const divisorias = [...svg.matchAll(/M([\d.]+) [\d.]+V[\d.]+/g)].map((m) => Number(m[1]));
    expect(divisorias).toHaveLength(anos.length - 1);
    const colunas = [...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle" fill="var\(--ink-2\)">[12]º/g)].map((m) => Number(m[1]));
    divisorias.forEach((x, k) => expect(x).toBeCloseTo((colunas[2 * k + 1] + colunas[2 * k + 2]) / 2, 0));
  });

  it('com poucas colunas há espaço para "1º TURNO" por extenso; com todas as eleições o layout compacto segue com "1º"', () => {
    expect(rotulosTurno(renderGrafico(selecao([2018]), LAYOUTS.compacto, 'g'))).toEqual(['1º TURNO', '2º TURNO']);
    expect(rotulosTurno(renderGrafico(selecao([...ANOS]), LAYOUTS.compacto, 'g'))).toEqual(['1º', '2º', '1º', '2º', '1º', '2º']);
  });

  it.each(COMBINACOES)('layout %s, %j: os rótulos de turno nunca se encostam', (nome, anos) => {
    const layout = LAYOUTS[nome];
    const svg = renderGrafico(selecao([...anos], pontosVivo), layout, 'g');
    const rotulos = [...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle" fill="var\(--ink-2\)">([12]º(?: TURNO)?)</g)].map((m) => ({ x: Number(m[1]), w: larguraTexto(m[2], layout.wdth, layout.fonte) }));
    expect(rotulos).toHaveLength(anos.length * 2);
    for (let i = 1; i < rotulos.length; i++) expect(rotulos[i].x - rotulos[i].w / 2 - (rotulos[i - 1].x + rotulos[i - 1].w / 2)).toBeGreaterThanOrEqual(6);
  });

  it.each(NOMES_LAYOUT)('layout %s: uma eleição só liga o 1º turno ao 2º, uma linha de dois pontos por candidato, com a marca de 50% no 2º turno', (nome) => {
    for (const ano of [2018, 2022] as const) {
      const svg = renderGrafico(selecao([ano]), LAYOUTS[nome], 'g');
      const linhas = tags(svg, 'gl-linha');
      expect(linhas.map((t) => attr(t, 'data-serie'))).toEqual(['a', 'b']);
      for (const t of linhas) expect(attr(t, 'd').match(/[ML]/g)).toHaveLength(2);
      expect(tags(svg, 'gl-meta').map((t) => attr(t, 'data-id'))).toEqual([`${ano}-t2`]);
    }
  });

  it.each(NOMES_LAYOUT)('layout %s: só 2026 antes do dia 25 mostra os dois pontos do 1º turno e o dia do 2º, sem linha de um ponto só', (nome) => {
    const svg = renderGrafico(selecao([2026]), LAYOUTS[nome], 'g');
    expect(tags(svg, 'gl-linha')).toHaveLength(0);
    expect(tags(svg, 'gl-ponto').map((t) => attr(t, 'data-id'))).toEqual(['2026-t1', '2026-t1']);
    expect(grupos(svg, 'gl-vazio')).toHaveLength(1);
    expect(grupos(svg, 'gl-vazio')[0]).toContain('>25 OUT<');
    expect(tags(svg, 'gl-meta').map((t) => attr(t, 'data-id'))).toEqual(['2026-t2']);
    expect(grupos(svg, 'gl-fim')).toHaveLength(2);
  });

  it.each(NOMES_LAYOUT)('layout %s: só 2026 ao vivo liga o 1º turno ao ponto ao vivo, e o ponto vazio some', (nome) => {
    const svg = renderGrafico(selecao([2026], pontosVivo), LAYOUTS[nome], 'g');
    expect(tags(svg, 'gl-linha').map((t) => attr(t, 'data-serie'))).toEqual(['a', 'b']);
    expect(grupos(svg, 'gl-vazio')).toHaveLength(0);
  });

  it('sem 2026 na seleção, o ponto vazio do 2º turno de 2026 não aparece', () => {
    expect(grupos(renderGrafico(selecao([2018, 2022]), LAYOUTS.compacto, 'g'), 'gl-vazio')).toHaveLength(0);
  });

  it.each(NOMES_LAYOUT)('layout %s: ligar ou desligar eleições nunca mexe na escala, cada valor fica na mesma altura', (nome) => {
    const alturas = (svg: string) => new Map(tags(svg, 'gl-marca').map((t) => [`${attr(t, 'data-id')}/${attr(t, 'data-lado')}`, caixa(t).y]));
    const todas = alturas(renderGrafico(selecao([...ANOS], pontosVivo), LAYOUTS[nome], 'g'));
    for (const anos of SUBCONJUNTOS) {
      const parcial = alturas(renderGrafico(selecao(anos, pontosVivo), LAYOUTS[nome], 'g'));
      expect(parcial.size).toBe(anos.length * 4);
      for (const [chave, y] of parcial) expect(y, `${chave} em ${anos}`).toBe(todas.get(chave));
    }
  });

  it('a escala não encolhe quando a eleição de valor mais alto é desligada: o eixo vem de todas as eleições do lugar', () => {
    const alto = base.map((p) => (p.id === '2022-t2' && p.a && p.b ? { ...p, a: { ...p.a, pct: 26.5 }, b: { ...p.b, pct: 73.5 } } : p));
    const eixo = (pontos: readonly Ponto[]) => textos(renderGrafico(selecao([2018], pontos), LAYOUTS.compacto, 'g')).filter((t) => t.endsWith('%'));
    expect(eixo(alto)).toContain('80%');
    expect(eixo(base)).not.toContain('80%');
  });

  it('o nome curto não muda com a seleção: só 2026 continua sendo "Flávio" quando a série tem os dois Bolsonaro', () => {
    const svg = renderGrafico({ ...selecao([2026]), nomes: ['Jair Bolsonaro', 'Flávio Bolsonaro'] }, LAYOUTS.compacto, 'g');
    expect(svg).toContain('>FLÁVIO<');
    expect(svg).not.toContain('>BOLSONARO<');
  });

  it.each(COMBINACOES)('layout %s, %j: o título e a descrição falam só das eleições escolhidas', (nome, anos) => {
    const svg = renderGrafico(selecao([...anos], pontosVivo), LAYOUTS[nome], 'g');
    expect(/<title id="g-t">([^<]*)<\/title>/.exec(svg)?.[1]).toBe(tituloGraficoAnos('Brasil', anos));
    const desc = /<desc id="g-d">([^<]*)<\/desc>/.exec(svg)?.[1] ?? '';
    for (const ano of ANOS) {
      if (anos.includes(ano)) expect(desc).toContain(`1º turno ${ano}`);
      else expect(desc).not.toContain(String(ano));
    }
  });

  it('cidade sem dado na eleição escolhida: o gráfico ainda sai, com "sem dado" nos dois turnos e sem linha', () => {
    const semDados = base.map((p) => (p.ano === 2018 ? { ...p, a: null, b: null, outros: null } : p));
    const svg = renderGrafico(selecao([2018], semDados), LAYOUTS.compacto, 'g');
    expect(tags(svg, 'gl-linha')).toHaveLength(0);
    expect(grupos(svg, 'gl-semdado')).toHaveLength(2);
    expect(tags(svg, 'gl-ponto')).toHaveLength(0);
  });
});

describe('renderGrafico: geometria com a seleção', () => {
  const cenarios: Array<[string, Ponto[]]> = [
    ['pre', [...base]],
    ['ao vivo', pontosVivo],
    ['empate no ao vivo', comAoVivo(base, aoVivo(50, 50))],
    ['quase empate final', comAoVivo(base, aoVivo(49.9, 50.1, 'final', 100))],
  ];
  const todas = COMBINACOES.flatMap(([nome, anos]) => cenarios.map(([cenario, pontos]) => [nome, anos, cenario, pontos] as const));

  it.each(todas)('layout %s, %j, %s: nenhuma plaquinha se sobrepõe, e plaquinhas, textos e réguas ficam dentro do SVG', (nome, anos, _cenario, pontos) => {
    const layout = LAYOUTS[nome];
    const svg = renderGrafico(selecao([...anos], pontos), layout, 'g');
    const plaquinhas = tags(svg, 'gl-plaq').map(caixa);
    expect(plaquinhas.length).toBeGreaterThanOrEqual(anos.length * 2);
    for (const c of plaquinhas) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(layout.largura);
      expect(c.y + c.h).toBeLessThanOrEqual(layout.altura);
    }
    plaquinhas.forEach((a, i) => plaquinhas.slice(i + 1).forEach((b) => expect(sobrepoe(a, b), `${JSON.stringify(a)} x ${JSON.stringify(b)}`).toBe(false)));
    for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)) {
      const [, xs, ys, atributos, conteudo] = m;
      const w = larguraTexto(conteudo, layout.wdth, Number(/font-size="([\d.]+)"/.exec(atributos)?.[1] ?? layout.fonte));
      const ancora = /text-anchor="(\w+)"/.exec(atributos)?.[1];
      const x = Number(xs);
      const [de, ate] = ancora === 'end' ? [x - w, x] : ancora === 'start' ? [x, x + w] : [x - w / 2, x + w / 2];
      expect(de, conteudo).toBeGreaterThanOrEqual(0);
      expect(ate, conteudo).toBeLessThanOrEqual(layout.largura);
      expect(Number(ys), conteudo).toBeLessThanOrEqual(layout.altura);
    }
    for (const regua of tags(svg, 'gl-ano')) {
      const [de, ate] = [...attr(regua, 'd').matchAll(/[MH]([\d.-]+)/g)].map((m) => Number(m[1]));
      expect(de).toBeGreaterThanOrEqual(0);
      expect(ate).toBeLessThanOrEqual(layout.largura);
    }
  });

  it.each(NOMES_LAYOUT.flatMap((nome) => ANOS.map((ano) => [nome, ano] as const)))(
    'layout %s, só %i: nenhum rótulo da 1ª coluna invade os rótulos do eixo Y, seja qual for a altura do ponto',
    (nome, ano) => {
      const layout = LAYOUTS[nome];
      const intervalo = (m: RegExpMatchArray) => {
        const [, xs, ys, atributos, conteudo] = m;
        const w = larguraTexto(conteudo, layout.wdth, Number(/font-size="([\d.]+)"/.exec(atributos)?.[1] ?? layout.fonte));
        const ancora = /text-anchor="(\w+)"/.exec(atributos)?.[1];
        const x = Number(xs);
        const [de, ate] = ancora === 'end' ? [x - w, x] : ancora === 'start' ? [x, x + w] : [x - w / 2, x + w / 2];
        return { de, ate, y: Number(ys), eixo: ancora === 'end' && conteudo.endsWith('%'), conteudo };
      };
      for (const pct of [12, 21, 29.28, 38, 47, 58]) {
        const pontos = base.map((p) => (p.id === `${ano}-t1` && p.a ? { ...p, a: { ...p.a, pct } } : p));
        const lidos = [...renderGrafico(selecao([ano], pontos), layout, 'g').matchAll(/<text x="([\d.]+)" y="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)].map(intervalo);
        const eixo = lidos.filter((m) => m.eixo);
        for (const outro of lidos.filter((m) => !m.eixo)) {
          for (const rotulo of eixo.filter((m) => Math.abs(m.y - outro.y) < layout.fonte)) {
            expect(outro.de >= rotulo.ate + 2 || outro.ate <= rotulo.de, `${outro.conteudo} x ${rotulo.conteudo} (${ano}, A em ${pct})`).toBe(true);
          }
        }
      }
    },
  );
});

describe('renderTabela: seleção de eleições', () => {
  const linhasDe = (tabela: string) => [...tabela.matchAll(/<tr>.*?<\/tr>/gs)].map((m) => m[0]);
  const turnosDe = (tabela: string) => linhasDe(tabela).slice(1).map((l) => /<th scope="row">([^<]*)/.exec(l)?.[1]);

  it('acompanha a seleção: dois turnos por eleição escolhida, só delas', () => {
    const tabela = renderTabela({ ...dados(pontosVivo), anos: [2018, 2026] });
    expect(turnosDe(tabela)).toEqual(['1º turno 2018', '2º turno 2018', '1º turno 2026', '2º turno 2026']);
    expect(tabela).not.toContain('2022');
    expect(/<caption[^>]*>([^<]*)<\/caption>/.exec(tabela)?.[1]).toBe(tituloGraficoAnos('Brasil', [2018, 2026]));
  });

  it.each(SUBCONJUNTOS)('%j: uma linha por turno escolhido, na ordem do tempo', (...anos) => {
    const turnos = turnosDe(renderTabela({ ...dados(pontosVivo), anos }));
    expect(turnos).toEqual(anos.flatMap((ano) => [`1º turno ${ano}`, `2º turno ${ano}`]));
  });

  it('sem escolha, todas as eleições', () => {
    expect(turnosDe(renderTabela({ ...dados(), anos: [] }))).toHaveLength(6);
    expect(renderTabela({ ...dados(), anos: [...ANOS] })).toBe(renderTabela(dados()));
  });
});

describe('copy da seleção', () => {
  it('listaDeAnos separa com vírgula e "e" na ordem do tempo', () => {
    expect(listaDeAnos([2018])).toBe('2018');
    expect(listaDeAnos([2018, 2026])).toBe('2018 e 2026');
    expect(listaDeAnos([2018, 2022, 2026])).toBe('2018, 2022 e 2026');
  });

  it('o título com todas as eleições é o de sempre; com um subconjunto, só os anos dele', () => {
    expect(tituloGraficoAnos('Brasil', ANOS)).toBe('Votos válidos para presidente, Brasil: 2018, 2022 e 2026');
    expect(tituloGraficoAnos('São Luís (MA)', [2022])).toBe('Votos válidos para presidente, São Luís (MA): 2022');
  });
});

describe('copy do histórico', () => {
  it('"25 out" sai da data de início do status.json, em Brasília', () => {
    expect(diaMesCurto('2026-10-25T17:00:00-03:00')).toBe('25 out');
    expect(diaMesCurto('2026-09-07T12:00:00-03:00')).toBe('7 set');
    expect(diaMesCurto('2026-10-26T01:30:00Z')).toBe('25 out');
    expect(diaMesCurto(null)).toBe('');
    expect(diaMesCurto('amanhã')).toBe('');
  });
});
