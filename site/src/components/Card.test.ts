import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALAVRAS_PROIBIDAS } from '../lib/copy.ts';
import { renderCard, type Acento, type CandidatoCard, type CardData } from './Card.ts';

const lula = (pct: number, extra: Partial<CandidatoCard> = {}): CandidatoCard => ({ n: 13, nome: 'Lula', partido: 'PT', pct, ...extra });
const flavio = (pct: number, extra: Partial<CandidatoCard> = {}): CandidatoCard => ({ n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', pct, ...extra });

const BASE: CardData = {
  modo: 'parcial',
  local: 'São Luís',
  uf: 'MA',
  cargo: 'presidente',
  cand: [lula(58.6), flavio(41.4)],
  variacao: -3.4,
  diferencaVotos: 123313,
  secoesPct: 87.3,
  hora: '18:42',
  dominio: 'dominio.test',
  handle: '@conta',
  bandeiraHref: 'data:image/svg+xml;base64,AAAA',
};

const com = (extra: Partial<CardData>): CardData => ({ ...BASE, ...extra });

const VARIANTES: Record<string, CardData> = {
  'parcial 87%': BASE,
  'parcial 10%': com({ secoesPct: 10.4 }),
  final: com({ modo: 'final', secoesPct: 100 }),
  'final com eleito': com({ modo: 'final', secoesPct: 100, cand: [lula(50.9, { eleito: true }), flavio(49.1)] }),
  'com selo': com({ selo: 'mais dividida do MA' }),
  'selo longo': com({ selo: 'mais dividida do Brasil', local: 'Conceição do Mato Dentro' }),
  '13 ganhou terreno': com({ variacao: 3.4 }),
  '22 lidera': com({ cand: [lula(38.3), flavio(61.7)], variacao: 2.1 }),
  'margem de 0,1 ponto': com({ cand: [lula(49.95), flavio(50.05)], diferencaVotos: 312 }),
  '100% para um lado': com({ cand: [lula(100), flavio(0)], local: 'Una' }),
  'sem 2022': com({ variacao: undefined }),
  governador: com({ cargo: 'governador', local: 'Rio de Janeiro', uf: 'RJ', variacao: undefined, cand: [lula(39.4, { n: 12, nome: 'Fictício A', partido: 'FIC' }), flavio(60.6, { n: 45, nome: 'Fictícia B', partido: 'FIC' })] }),
  'governador, nome longo': com({
    cargo: 'governador',
    local: 'Rio de Janeiro',
    uf: 'RJ',
    variacao: undefined,
    cand: [lula(47.2, { n: 12, nome: 'Fictícia Aparecida dos Santos Pereira', partido: 'FIC' }), flavio(52.8, { n: 45, nome: 'Fictício Antônio Carlos de Souza Lima', partido: 'FIC' })],
  }),
  palpite: com({ modo: 'palpite', cand: [lula(57), flavio(43)] }),
  'palpite em final': com({ modo: 'palpite', cand: [lula(61), flavio(39)], erroPalpite: 2.6 }),
  'palpite em final, acertou': com({ modo: 'palpite', cand: [lula(58), flavio(42)], erroPalpite: 0.04 }),
  'cidade de nome longo': com({ local: 'Vila Bela da Santíssima Trindade', uf: 'MT' }),
  'cidade com cedilha': com({ local: 'Açailândia' }),
  aguardando: com({ secoesPct: 0.4 }),
  'Brasil': com({ local: 'Brasil', uf: 'BR' }),
};

interface Texto {
  classe: string;
  n: string;
  x: number;
  y: number;
  size: number;
  fill: string;
  conteudo: string;
}

const entidades: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' };

function textos(svg: string): Texto[] {
  return [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)].map(([, atributos, interno]) => {
    const atributo = (nome: string): string => atributos.match(new RegExp(`\\b${nome}="([^"]*)"`))?.[1] ?? '';
    return {
      classe: atributo('class'),
      n: atributo('data-n'),
      x: Number(atributo('x')),
      y: Number(atributo('y')),
      size: Number(atributo('font-size')),
      fill: atributo('fill'),
      conteudo: interno.replace(/<[^>]+>/g, '').replace(/&\w+;/g, (e) => entidades[e] ?? e),
    };
  });
}

const porClasse = (svg: string, classe: string): Texto[] => textos(svg).filter((t) => t.classe.split(' ').includes(classe));
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const token = (nome: string): string => (tokens.match(new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '').toLowerCase();
const BG = token('--bg');
const INK = token('--ink');
const INK_2 = token('--ink-2');
const ACCENT = token('--accent');
const VERDE = token('--verde');
const AMARELO = token('--amarelo');
const COR_13 = token('--cand-13');
const COR_22 = token('--cand-22');
/** Acentos alternativos do playground, lidos de tokens.css (o padrão, ouro, é o --accent do :root). */
const ALTERNATIVAS = Object.fromEntries([...tokens.matchAll(/\[data-acento='(\w+)'\]\s*\{\s*--accent:\s*(#[0-9a-f]{6})/g)].map(([, nome, cor]) => [nome, cor])) as Record<string, string>;
const PAGINA_CSS = readFileSync(new URL('../styles/base.css', import.meta.url), 'utf8');

/** A faixa da marca, para conferir o que é dela: o resto do card não pode ser verde nem amarelo. */
const FAIXA_RE = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{6})" class="faixa"\/>/g;
const faixa = (svg: string): Array<{ x: number; y: number; w: number; h: number; cor: string }> =>
  [...svg.matchAll(FAIXA_RE)].map(([, x, y, w, h, cor]) => ({ x: Number(x), y: Number(y), w: Number(w), h: Number(h), cor }));
const semFaixa = (svg: string): string => svg.replace(FAIXA_RE, '');

interface Forma {
  tag: string;
  classe: string;
  n: string;
  x: number;
  w: number;
  /** O que a forma pinta: o preenchimento, ou o traço dos contornos do palpite. */
  cor: string;
}

/** Textos, retângulos e triângulos do SVG: o que sobra para conferir de quem é cada cor. */
function formas(svg: string): Forma[] {
  return [...svg.matchAll(/<(text|rect|polygon)\b([^>]*?)\/?>/g)].map(([, tag, atributos]) => {
    const atributo = (nome: string): string => atributos.match(new RegExp(`(?:^|\\s)${nome}="([^"]*)"`))?.[1] ?? '';
    const fill = atributo('fill');
    return { tag, classe: atributo('class'), n: atributo('data-n'), x: Number(atributo('x')), w: Number(atributo('width')), cor: fill && fill !== 'none' ? fill : atributo('stroke') };
  });
}

const porForma = (svg: string, classe: string): Forma[] => formas(svg).filter((f) => f.classe === classe);
/** Cor de cada número de urna: 13 e 22 têm a sua; os demais (governador) ficam neutros por coluna. */
const COR_POR_NUMERO: Record<string, string> = { '13': COR_13, '22': COR_22, '12': INK, '45': INK_2 };

describe('renderCard: estrutura', () => {
  const svg = renderCard(BASE);

  it('é um SVG 1200x675 com role img, title e desc', () => {
    expect(svg).toMatch(/^<svg [^>]*width="1200" height="675" viewBox="0 0 1200 675" role="img">/);
    expect(svg).toContain('<title>São Luís (MA), 2º turno 2026</title>');
    const desc = svg.match(/<desc>(.*?)<\/desc>/)?.[1] ?? '';
    for (const trecho of ['São Luís (MA)', 'parcial · 87% das seções', '13 Lula, PT: 58,6% (lidera)', '22 Flávio Bolsonaro, PL: 41,4%', '3,4 pontos para Flávio Bolsonaro em relação a 2022', 'Fonte: TSE, 18:42']) {
      expect(desc, trecho).toContain(trecho);
    }
  });

  it('é pura: mesma entrada, mesma saída, sem mexer na entrada', () => {
    const entrada = com({ cand: [flavio(41.4), lula(58.6)] });
    const antes = JSON.stringify(entrada);
    expect(renderCard(entrada)).toBe(renderCard(entrada));
    expect(JSON.stringify(entrada)).toBe(antes);
  });

  it('números tabulares e nunca escala glifo (textLength, lengthAdjust, scale)', () => {
    expect(svg).toContain('font-variant-numeric:tabular-nums');
    for (const [nome, d] of Object.entries(VARIANTES)) expect(renderCard(d), nome).not.toMatch(/textLength|lengthAdjust|scale|transform/);
  });

  it('embute a fonte só quando recebe fonteDataUri', () => {
    expect(svg).not.toContain('@font-face');
    const uri = 'data:font/woff2;base64,AAAA';
    const comFonte = renderCard(com({ fonteDataUri: uri }));
    expect(comFonte).toContain('@font-face');
    expect(comFonte).toContain(`src:url(${uri})`);
  });

  it('escapa o que vem dos dados', () => {
    const risco = renderCard(com({ local: 'A<b>&"C', cand: [lula(50, { nome: '<x>' }), flavio(50)] }));
    expect(risco).not.toContain('<b>');
    expect(risco).not.toContain('<x>');
    expect(risco).toContain('A&lt;B&gt;&amp;&quot;C');
  });
});

describe('renderCard: ordem e cor fixa por candidato', () => {
  it.each(Object.entries(VARIANTES))('%s: coluna do menor número à esquerda, do maior à direita', (_, d) => {
    const svg = renderCard(d);
    const [menor, maior] = [...d.cand].sort((a, b) => a.n - b.n).map((c) => String(c.n));
    for (const classe of ['pct', 'placa', 'nome']) {
      const t = porClasse(svg, classe);
      expect(t[0].n, classe).toBe(menor);
      expect(t.at(-1)?.n, classe).toBe(maior);
      expect(t[0].x, classe).toBeLessThan(t.at(-1)?.x ?? 0);
    }
  });

  it('a ordem 13 -> 22 não depende da ordem em que os candidatos chegam', () => {
    expect(renderCard(com({ cand: [flavio(41.4), lula(58.6)] }))).toBe(renderCard(BASE));
  });

  const semAguardando = Object.entries(VARIANTES).filter(([nome]) => nome !== 'aguardando');

  it.each(semAguardando)('%s: barra, plaquinha e percentual de cada candidato na cor dele (13 vermelho, 22 azul claro)', (_, d) => {
    const doCandidato = formas(renderCard(d)).filter((f) => ['barra', 'plaquinha', 'pct'].includes(f.classe));
    for (const f of doCandidato) expect(f.cor, `${f.classe} do ${f.n}`).toBe(COR_POR_NUMERO[f.n]);
    expect(new Set(doCandidato.map((f) => f.n))).toEqual(new Set(d.cand.map((c) => String(c.n))));
  });

  it('a cor não troca quando a liderança troca: o 13 segue vermelho à esquerda e o 22 azul à direita', () => {
    for (const d of [BASE, VARIANTES['22 lidera']]) {
      const [esquerda, direita] = porForma(renderCard(d), 'barra');
      expect([esquerda.n, esquerda.cor]).toEqual(['13', COR_13]);
      expect([direita.n, direita.cor]).toEqual(['22', COR_22]);
      expect(esquerda.x).toBeLessThan(direita.x);
    }
  });

  it('a barra tem costura de 4 px e segmentos proporcionais aos percentuais', () => {
    for (const d of [BASE, VARIANTES['22 lidera'], com({ cand: [lula(50), flavio(50)], diferencaVotos: 0 })]) {
      const [esquerda, direita] = porForma(renderCard(d), 'barra');
      expect(direita.x - (esquerda.x + esquerda.w)).toBe(4);
      expect((esquerda.w + 2) / 1104).toBeCloseTo(d.cand[0].pct / 100, 2);
    }
  });

  it('o nome do candidato fica em --ink, qualquer que seja a posição', () => {
    for (const d of [BASE, VARIANTES['22 lidera']]) expect(porClasse(renderCard(d), 'nome').map((t) => t.fill)).toEqual([INK, INK]);
  });

  it('o número da plaquinha leva --bg, e o do palpite a cor do candidato', () => {
    expect(porClasse(renderCard(BASE), 'placa').map((t) => t.fill)).toEqual([BG, BG]);
    expect(porClasse(renderCard(VARIANTES.palpite), 'placa').map((t) => t.fill)).toEqual([COR_13, COR_22]);
  });

  it('empate exato: ninguém lidera e a cor de cada um continua a sua', () => {
    const svg = renderCard(com({ cand: [lula(50), flavio(50)], diferencaVotos: 0 }));
    expect(porClasse(svg, 'pct').map((t) => t.fill)).toEqual([COR_13, COR_22]);
    expect(porClasse(svg, 'lidera')).toHaveLength(0);
  });

  it('o rótulo LIDERA, em --bg, fica dentro do segmento do líder e só dele', () => {
    for (const [d, lider] of [[BASE, '13'], [VARIANTES['22 lidera'], '22']] as const) {
      const svg = renderCard(d);
      const [rotulo, ...outros] = porClasse(svg, 'lidera');
      const segmento = porForma(svg, 'barra').find((b) => b.n === lider);
      expect(outros).toHaveLength(0);
      expect(rotulo).toMatchObject({ conteudo: 'LIDERA', n: lider, fill: BG });
      expect(rotulo.x).toBeGreaterThanOrEqual(segmento?.x ?? Infinity);
      expect(rotulo.x).toBeLessThanOrEqual((segmento?.x ?? 0) + (segmento?.w ?? 0));
    }
  });

  it('cor de candidato só em elemento do candidato: nome, título, meta, rótulo, rodapé e selo ficam fora', () => {
    const permitidos = ['text.pct', 'rect.barra', 'rect.plaquinha', 'text.placa', 'text.frase', 'text.numero-frase', 'polygon.seta'];
    for (const [nome, d] of Object.entries({ ...VARIANTES, 'com selo e 22 lidera': com({ cand: [lula(38.3), flavio(61.7)], selo: 'virou vs 2022' }) })) {
      const pintadas = formas(renderCard(d)).filter((f) => [COR_13, COR_22].includes(f.cor));
      for (const f of pintadas) expect(permitidos, `${nome}: ${f.tag}.${f.classe}`).toContain(`${f.tag}.${f.classe}`);
    }
  });
});

describe('renderCard: zona de variação e margem', () => {
  const frase = (svg: string): Texto[] => textos(svg).filter((t) => ['frase', 'numero-frase'].includes(t.classe));

  it('margem menor que 1 ponto: DIFERENÇA DE N VOTOS em --ink, sem seta nem acento', () => {
    const svg = renderCard(VARIANTES['margem de 0,1 ponto']);
    const linha = textos(svg).map((t) => t.conteudo);
    expect(linha).toEqual(expect.arrayContaining(['DIFERENÇA DE', '312', 'VOTOS']));
    expect(frase(svg).map((t) => t.fill)).toEqual([INK, INK, INK]);
    expect(svg).not.toContain('<polygon');
    expect(semFaixa(svg)).not.toContain(ACCENT);
  });

  it('1 voto de diferença usa o singular', () => {
    const svg = renderCard(com({ cand: [lula(50), flavio(50.0001)], diferencaVotos: 1 }));
    expect(textos(svg).map((t) => t.conteudo)).toEqual(expect.arrayContaining(['1', 'VOTO']));
  });

  it('variação vs 2022 na cor do candidato que ganhou terreno, com a seta apontando para o lado dele', () => {
    const aponta = (svg: string): 'esquerda' | 'direita' => {
      const pontos = (svg.match(/<polygon class="seta" points="([^"]+)"/)?.[1] ?? '').split(' ').map((p) => Number(p.split(',')[0]));
      return pontos[1] < pontos[0] ? 'esquerda' : 'direita';
    };
    const casos = [
      ['13 ganhou terreno', VARIANTES['13 ganhou terreno'], 'esquerda', COR_13],
      ['22 ganhou terreno', BASE, 'direita', COR_22],
      ['13 ganhou terreno e o 22 lidera', VARIANTES['22 lidera'], 'esquerda', COR_13],
      ['22 ganhou terreno e o 13 lidera', BASE, 'direita', COR_22],
    ] as const;
    for (const [nome, d, lado, cor] of casos) {
      const svg = renderCard(d);
      expect(aponta(svg), nome).toBe(lado);
      expect(porForma(svg, 'seta').map((f) => f.cor), nome).toEqual([cor]);
      expect(frase(svg).map((t) => t.fill), nome).toEqual([cor, cor]);
    }
    expect(textos(renderCard(VARIANTES['13 ganhou terreno'])).find((t) => t.classe === 'numero-frase')?.conteudo).toBe('+3,4');
    expect(textos(renderCard(BASE)).find((t) => t.classe === 'numero-frase')?.conteudo).toBe('+3,4');
    expect(textos(renderCard(BASE)).map((t) => t.conteudo)).toContain('PONTOS PARA FLÁVIO BOLSONARO EM RELAÇÃO A 2022');
  });

  it('o número da variação tem 64 px e a frase, 34 px', () => {
    const svg = renderCard(BASE);
    expect(textos(svg).find((t) => t.classe === 'numero-frase')?.size).toBe(64);
  });

  it('sem 2022 (cidade nova) e no governador: a margem entre os dois, em --ink e sem seta', () => {
    for (const nome of ['sem 2022', 'governador']) {
      const svg = renderCard(VARIANTES[nome]);
      expect(textos(svg).map((t) => t.conteudo), nome).toEqual(expect.arrayContaining(['DIFERENÇA DE']));
      expect(frase(svg).map((t) => t.fill), nome).toEqual([INK, INK, INK]);
      expect(svg, nome).not.toContain('<polygon');
      expect(semFaixa(svg), nome).not.toContain(ACCENT);
    }
  });

  it('governador ignora variação mesmo que ela chegue nos dados', () => {
    expect(renderCard({ ...VARIANTES.governador, variacao: 4 })).not.toContain('<polygon');
  });

  it('variação que arredonda para zero não vira seta', () => {
    expect(renderCard(com({ variacao: 0.02 }))).not.toContain('<polygon');
  });

  it('o acento do playground troca só a cor do selo: nada mais no card é acento, nem a faixa', () => {
    expect(Object.keys(ALTERNATIVAS)).toEqual(['verde', 'violeta']);
    for (const [nome, d] of Object.entries({ ...VARIANTES, 'com selo e variação': com({ selo: 'virou vs 2022' }) })) {
      const padrao = renderCard(d);
      for (const [acento, cor] of Object.entries(ALTERNATIVAS)) {
        const outro = renderCard({ ...d, acento: acento as Acento });
        expect(semFaixa(outro).replaceAll(cor, ACCENT), `${nome}: ${acento}`).toBe(semFaixa(padrao));
        expect(faixa(outro), `${nome}: faixa com ${acento}`).toEqual(faixa(padrao));
      }
      const selos = formas(padrao).filter((f) => f.classe === 'selo' || (f.cor === ACCENT && f.classe !== 'faixa'));
      expect(selos.map((f) => `${f.tag}.${f.classe}`), nome).toEqual(d.selo || d.modo === 'palpite' ? ['rect.selo'] : []);
    }
  });
});

describe('renderCard: modos', () => {
  it('parcial diz lidera; final não tem rótulo de posição', () => {
    expect(porClasse(renderCard(BASE), 'lidera')[0].conteudo).toBe('LIDERA');
    const final = renderCard(VARIANTES.final);
    expect(porClasse(final, 'lidera')).toHaveLength(0);
    expect(final).not.toMatch(/lidera/i);
  });

  it('eleito(a) só aparece com eleito: true, nunca por percentual', () => {
    for (const [nome, d] of Object.entries(VARIANTES)) {
      if (nome === 'final com eleito') continue;
      expect(renderCard(d), nome).not.toMatch(/eleit/i);
    }
    const eleito = renderCard(VARIANTES['final com eleito']);
    expect(porClasse(eleito, 'lidera')[0].conteudo).toBe('ELEITO');
    const eleita = renderCard(com({ modo: 'final', cand: [lula(50.9, { eleito: true, feminino: true }), flavio(49.1)] }));
    expect(porClasse(eleita, 'lidera')[0].conteudo).toBe('ELEITA');
    expect(renderCard(com({ cand: [lula(50.9, { eleito: true }), flavio(49.1)] }))).toContain('>ELEITO<');
  });

  it('linha meta e rodapé: parcial, final e a fonte com a hora', () => {
    const conteudos = (d: CardData): string[] => textos(renderCard(d)).map((t) => t.conteudo);
    expect(conteudos(BASE)).toEqual(expect.arrayContaining(['MA · 2º TURNO 2026 · PARCIAL · 87% DAS SEÇÕES', 'FONTE: TSE · 18:42', 'DOMINIO.TEST · @CONTA']));
    expect(conteudos(VARIANTES.final)).toContain('MA · 2º TURNO 2026 · FINAL · 100% DAS SEÇÕES');
    expect(conteudos(VARIANTES.governador)[0]).toBe('RJ · GOVERNADOR · 2º TURNO 2026 · PARCIAL · 87% DAS SEÇÕES');
    expect(conteudos(VARIANTES.Brasil)[0]).toBe('2º TURNO 2026 · PARCIAL · 87% DAS SEÇÕES');
  });

  it('parcial nunca diz 100% das seções antes de 100%', () => {
    expect(textos(renderCard(com({ secoesPct: 99.6 })))[0].conteudo).toContain('99% DAS SEÇÕES');
  });

  it('palpite: selo, contornos na cor de cada candidato, sem lidera e sem fonte', () => {
    const svg = renderCard(VARIANTES.palpite);
    const conteudos = textos(svg).map((t) => t.conteudo);
    expect(conteudos).toEqual(expect.arrayContaining(['SEU PALPITE', 'PALPITE · NÃO É RESULTADO']));
    expect(svg).not.toMatch(/lidera|FONTE: TSE|PARCIAL/i);
    for (const cor of [COR_13, COR_22]) expect(svg).toContain(`fill="none" stroke="${cor}"`);
    const contornos = formas(svg).filter((f) => ['barra', 'plaquinha'].includes(f.classe));
    expect(contornos.map((f) => f.cor)).toEqual([COR_13, COR_22, COR_13, COR_22]);
    const cheios = (s: string): RegExpMatchArray[] => [...s.matchAll(/<rect [^>]*width="([\d.]+)"[^>]*fill="(#[0-9a-f]{6})"/g)].filter(([, largura, cor]) => Number(largura) > 10 && [COR_13, COR_22, INK, INK_2].includes(cor));
    expect(cheios(svg)).toHaveLength(0);
    expect(cheios(renderCard(BASE)).map(([, , cor]) => cor)).toEqual([COR_13, COR_22, COR_13, COR_22]);
  });

  it('o selo aparece em placa --accent (ouro, por padrão) com texto --bg', () => {
    const svg = renderCard(VARIANTES['com selo']);
    expect(svg).toMatch(new RegExp(`<rect [^>]*height="44" rx="8" fill="${ACCENT}" class="selo"/>`));
    expect(porForma(svg, 'selo').map((f) => f.cor)).toEqual([ACCENT]);
    expect(textos(svg).find((t) => t.conteudo === 'MAIS DIVIDIDA DO MA')?.fill).toBe(BG);
    expect(renderCard(BASE)).not.toContain('rx="8"');
  });

  it('cada acento do playground pinta a placa do selo: ouro, verde e violeta', () => {
    const cores = { ouro: ACCENT, ...ALTERNATIVAS } as Record<Acento, string>;
    for (const [acento, cor] of Object.entries(cores)) {
      expect(porForma(renderCard(com({ selo: 'x', acento: acento as Acento })), 'selo').map((f) => f.cor), acento).toEqual([cor]);
    }
  });
});

describe('renderCard: sem seções apuradas', () => {
  const svg = renderCard(VARIANTES.aguardando);

  it('diz aguardando primeiras seções, sem percentual, margem, barra nem posição', () => {
    expect(textos(svg).map((t) => t.conteudo)).toContain('AGUARDANDO PRIMEIRAS SEÇÕES');
    expect(porClasse(svg, 'pct').map((t) => t.conteudo)).toEqual(['—', '—']);
    expect(svg).toContain('class="barra-vazia"');
    expect(porClasse(svg, 'lidera')).toHaveLength(0);
    expect(svg).not.toMatch(/\d+,\d%|<polygon|DIFEREN/);
    expect(porClasse(svg, 'pct').map((t) => t.fill)).toEqual([INK_2, INK_2]);
  });

  it('a barra é neutra, sem segmento de candidato; as plaquinhas seguem na cor de cada um', () => {
    expect(porForma(svg, 'barra')).toHaveLength(0);
    expect(porForma(svg, 'barra-vazia').map((f) => f.cor)).toEqual([INK_2]);
    expect(porForma(svg, 'plaquinha').map((f) => f.cor)).toEqual([COR_13, COR_22]);
  });

  it('1% das seções já é apuração', () => {
    expect(renderCard(com({ secoesPct: 1 }))).not.toContain('AGUARDANDO');
  });
});

describe('renderCard: nome da cidade (DESTINO)', () => {
  const destinos = (d: CardData): Texto[] => porClasse(renderCard(d), 'destino');

  it('nome curto em uma linha, no tamanho máximo, alinhado à margem esquerda', () => {
    const [titulo] = destinos(com({ local: 'Una' }));
    expect(destinos(com({ local: 'Una' }))).toHaveLength(1);
    expect(titulo).toMatchObject({ conteudo: 'UNA', size: 150, x: 48 });
  });

  it('nome comprido quebra em 2 linhas menores', () => {
    const linhas = destinos(VARIANTES['cidade de nome longo']);
    expect(linhas.map((l) => l.conteudo)).toEqual(['VILA BELA DA', 'SANTÍSSIMA TRINDADE']);
    expect(linhas[0].size).toBeLessThan(150);
    expect(linhas[1].y).toBeGreaterThan(linhas[0].y);
  });

  it('cedilha no título empurra o resto para baixo, sem tocar a variação', () => {
    const y = (d: CardData): number => textos(renderCard(d)).find((t) => t.classe === 'numero-frase')?.y ?? 0;
    expect(y(VARIANTES['cidade com cedilha'])).toBeGreaterThan(y(BASE));
  });
});

describe('renderCard: escala e área segura', () => {
  const variantes = Object.entries(VARIANTES);

  it.each(variantes)('%s: nenhum texto abaixo de 28 px e percentuais acima de 100 px', (_, d) => {
    const svg = renderCard(d);
    for (const t of textos(svg)) expect(t.size, t.conteudo).toBeGreaterThanOrEqual(28);
    for (const m of svg.matchAll(/<tspan [^>]*font-size="([\d.]+)"[^>]*>%<\/tspan>/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(52);
    for (const t of porClasse(svg, 'pct')) expect(t.size, t.conteudo).toBeGreaterThan(100);
  });

  // A faixa da marca é sangrada de propósito (0..1200, y 0..8) e não é conteúdo: o recorte 2:1 do X a corta sem perda.
  it.each(variantes)('%s: nada crítico acima de y=44 nem abaixo de y=631, nem fora das margens de 48 px', (_, d) => {
    const svg = semFaixa(renderCard(d));
    for (const t of textos(svg)) {
      expect(t.y, t.conteudo).toBeGreaterThan(44);
      expect(t.y, t.conteudo).toBeLessThanOrEqual(631);
    }
    for (const m of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [x, y, w, h] = m.slice(1).map(Number);
      expect(x, 'x do retângulo').toBeGreaterThanOrEqual(48 - 0.01);
      expect(x + w, 'borda direita do retângulo').toBeLessThanOrEqual(1152 + 0.01);
      expect(y, 'topo do retângulo').toBeGreaterThanOrEqual(44);
      expect(y + h, 'base do retângulo').toBeLessThanOrEqual(631);
    }
  });
});

describe('renderCard: erro do palpite em final (zona C)', () => {
  /** A frase da zona C em ordem de leitura: texto menor, número grande, texto menor. */
  const zonaC = (svg: string): Texto[] => textos(svg).filter((t) => ['frase', 'numero-frase', 'acertou'].some((c) => t.classe.split(' ').includes(c)));
  const lido = (svg: string): string[] => zonaC(svg).map((t) => t.conteudo);
  const palpite = (extra: Partial<CardData>): CardData => com({ modo: 'palpite', cand: [lula(61), flavio(39)], ...extra });

  it('diz "você errou por X pontos" no lugar da diferença entre os dois', () => {
    const svg = renderCard(VARIANTES['palpite em final']);
    expect(lido(svg)).toEqual(['VOCÊ ERROU POR', '2,6', 'PONTOS']);
    expect(svg).not.toContain('DIFERENÇA DE');
  });

  it('é de ninguém: em --ink, sem seta, e o número leva o tamanho de destaque', () => {
    const svg = renderCard(VARIANTES['palpite em final']);
    for (const t of zonaC(svg)) expect(t.fill, t.conteudo).toBe(INK);
    expect(svg).not.toContain('class="seta"');
    expect(porClasse(svg, 'numero-frase')[0].size).toBeGreaterThanOrEqual(56);
    for (const t of porClasse(svg, 'frase')) expect(t.size, t.conteudo).toBeGreaterThanOrEqual(30);
  });

  it('singular e plural pelo format.ts: 1,0 e 0,5 são "ponto", 1,1 é "pontos"', () => {
    expect(lido(renderCard(palpite({ erroPalpite: 1.04 })))).toEqual(['VOCÊ ERROU POR', '1,0', 'PONTO']);
    expect(lido(renderCard(palpite({ erroPalpite: 0.5 })))).toEqual(['VOCÊ ERROU POR', '0,5', 'PONTO']);
    expect(lido(renderCard(palpite({ erroPalpite: 1.1 })))).toEqual(['VOCÊ ERROU POR', '1,1', 'PONTOS']);
    expect(lido(renderCard(palpite({ erroPalpite: 22 })))).toEqual(['VOCÊ ERROU POR', '22,0', 'PONTOS']);
  });

  it('erro que arredonda para 0,0 vira "você acertou o resultado", numa linha só, sem número nem "pontos"', () => {
    const svg = renderCard(VARIANTES['palpite em final, acertou']);
    expect(lido(svg)).toEqual(['VOCÊ ACERTOU O RESULTADO']);
    expect(porClasse(svg, 'acertou')[0].size).toBeGreaterThanOrEqual(56);
    expect(porClasse(svg, 'acertou')[0].fill).toBe(INK);
    expect(svg).not.toMatch(/PONTO|DIFERENÇA DE/);
  });

  it('o selo SEU PALPITE e o rodapé PALPITE · NÃO É RESULTADO continuam', () => {
    for (const nome of ['palpite em final', 'palpite em final, acertou']) {
      const conteudos = textos(renderCard(VARIANTES[nome])).map((t) => t.conteudo);
      expect(conteudos, nome).toEqual(expect.arrayContaining(['SEU PALPITE', 'PALPITE · NÃO É RESULTADO']));
    }
  });

  it('só aparece no modo palpite e só com o erro definido', () => {
    const semErro = renderCard(palpite({}));
    expect(lido(semErro)).toEqual(['DIFERENÇA DE', '22,0', 'PONTOS']);
    expect(semErro).not.toMatch(/VOCÊ/);
    for (const modo of ['parcial', 'final'] as const) expect(renderCard(com({ modo, erroPalpite: 2.6 })), modo).not.toMatch(/VOCÊ ERROU/);
  });

  it('o texto alternativo diz o mesmo que o card', () => {
    const desc = (d: CardData): string => renderCard(d).match(/<desc>(.*?)<\/desc>/)?.[1] ?? '';
    expect(desc(VARIANTES['palpite em final'])).toContain('você errou por 2,6 pontos');
    expect(desc(VARIANTES['palpite em final, acertou'])).toContain('você acertou o resultado');
  });
});

describe('renderCard: faixa da marca', () => {
  const variantes = Object.entries(VARIANTES);

  it.each(variantes)('%s: faixa no topo, verde de 0 a 62% e amarela de 62 a 100%, de 8 px, em cortes retos', (_, d) => {
    const svg = renderCard(d);
    expect(faixa(svg)).toEqual([
      { x: 0, y: 0, w: 744, h: 8, cor: VERDE },
      { x: 744, y: 0, w: 456, h: 8, cor: AMARELO },
    ]);
    expect(svg).not.toMatch(/gradient/i);
  });

  it('o corte é o da faixa da página (base.css)', () => {
    const corteDaPagina = Number(PAGINA_CSS.match(/var\(--verde\)\s+0\s+(\d+)%,\s*var\(--amarelo\)\s+\1%/)?.[1]);
    expect(faixa(renderCard(BASE))[0].w / 12).toBe(corteDaPagina);
  });

  it.each(variantes)('%s: verde e amarelo só na faixa e no selo, com qualquer acento', (_, d) => {
    const comSelo = Boolean(d.selo) || d.modo === 'palpite';
    for (const acento of ['ouro', 'verde', 'violeta'] as const) {
      const foraDaFaixa = [...semFaixa(renderCard({ ...d, acento })).matchAll(new RegExp(`${VERDE}|${AMARELO}`, 'gi'))];
      expect(foraDaFaixa, acento).toHaveLength(comSelo && acento !== 'violeta' ? 1 : 0);
    }
  });
});

describe('renderCard: vocabulário e tokens', () => {
  it.each(Object.entries(VARIANTES))('%s: nenhuma palavra proibida', (_, d) => {
    const svg = renderCard(d).toLowerCase();
    for (const palavra of PALAVRAS_PROIBIDAS) expect(svg).not.toContain(palavra);
  });

  it('as cores do SVG são as de styles/tokens.css', () => {
    const svg = renderCard(com({ selo: 'x' }));
    for (const nome of ['--bg', '--ink', '--ink-2', '--cand-13', '--cand-22', '--accent', '--verde', '--amarelo']) expect(svg, nome).toContain(token(nome));
  });

  it('só as cores dos tokens: tinta, cinza, os dois candidatos, o acento e o verde e o amarelo da faixa', () => {
    const permitidas = new Set([BG, INK, INK_2, COR_13, COR_22, ACCENT, VERDE, AMARELO]);
    for (const [nome, d] of Object.entries(VARIANTES)) {
      for (const cor of renderCard(d).match(/#[0-9a-f]{6}/gi) ?? []) expect(permitidas.has(cor.toLowerCase()), `${nome}: ${cor}`).toBe(true);
    }
  });
});
