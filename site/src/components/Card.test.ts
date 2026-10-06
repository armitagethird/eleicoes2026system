import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALAVRAS_PROIBIDAS } from '../lib/copy.ts';
import { renderCard, type CandidatoCard, type CardData } from './Card.ts';

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
const INK = token('--ink');
const INK_2 = token('--ink-2');

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

describe('renderCard: ordem e cor por posição', () => {
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

  it('o líder veste --ink e o segundo --ink-2, e a cor troca de dono com a liderança', () => {
    const cores = (svg: string): string[] => porClasse(svg, 'pct').map((t) => t.fill);
    expect(cores(renderCard(BASE))).toEqual([INK, INK_2]);
    expect(cores(renderCard(VARIANTES['22 lidera']))).toEqual([INK_2, INK]);
    const nomes = porClasse(renderCard(VARIANTES['22 lidera']), 'nome').map((t) => t.fill);
    expect(nomes).toEqual([INK_2, INK]);
  });

  it('empate exato: ninguém lidera, os dois em --ink e sem rótulo', () => {
    const svg = renderCard(com({ cand: [lula(50), flavio(50)], diferencaVotos: 0 }));
    expect(porClasse(svg, 'pct').map((t) => t.fill)).toEqual([INK, INK]);
    expect(porClasse(svg, 'lidera')).toHaveLength(0);
  });

  it('o rótulo de posição fica no segmento do líder', () => {
    expect(porClasse(renderCard(BASE), 'lidera')[0].x).toBeLessThan(600);
    expect(porClasse(renderCard(VARIANTES['22 lidera']), 'lidera')[0].x).toBeGreaterThan(600);
  });
});

describe('renderCard: zona de variação e margem', () => {
  it('margem menor que 1 ponto: DIFERENÇA DE N VOTOS, sem seta nem acento', () => {
    const svg = renderCard(VARIANTES['margem de 0,1 ponto']);
    const linha = textos(svg).map((t) => t.conteudo);
    expect(linha).toEqual(expect.arrayContaining(['DIFERENÇA DE', '312', 'VOTOS']));
    expect(svg).not.toContain('<polygon');
    expect(svg).not.toContain(token('--accent'));
  });

  it('1 voto de diferença usa o singular', () => {
    const svg = renderCard(com({ cand: [lula(50), flavio(50.0001)], diferencaVotos: 1 }));
    expect(textos(svg).map((t) => t.conteudo)).toEqual(expect.arrayContaining(['1', 'VOTO']));
  });

  it('variação vs 2022 em --accent com a seta apontando para o lado de quem ganhou terreno', () => {
    const accent = token('--accent');
    const aponta = (svg: string): 'esquerda' | 'direita' => {
      const pontos = (svg.match(/<polygon class="seta" points="([^"]+)"/)?.[1] ?? '').split(' ').map((p) => Number(p.split(',')[0]));
      return pontos[1] < pontos[0] ? 'esquerda' : 'direita';
    };
    const gana13 = renderCard(VARIANTES['13 ganhou terreno']);
    const gana22 = renderCard(BASE);
    expect(aponta(gana13)).toBe('esquerda');
    expect(aponta(gana22)).toBe('direita');
    expect(gana13).toContain(`<polygon class="seta" points="`);
    expect(gana13).toContain(`fill="${accent}"`);
    expect(textos(gana13).find((t) => t.classe === 'numero-frase')?.conteudo).toBe('+3,4');
    expect(textos(gana22).find((t) => t.classe === 'numero-frase')?.conteudo).toBe('+3,4');
    expect(textos(gana22).map((t) => t.conteudo)).toContain('PONTOS PARA FLÁVIO BOLSONARO EM RELAÇÃO A 2022');
  });

  it('o número da variação tem 64 px e a frase, 34 px', () => {
    const svg = renderCard(BASE);
    expect(textos(svg).find((t) => t.classe === 'numero-frase')?.size).toBe(64);
  });

  it('sem 2022 (cidade nova) e no governador: a margem entre os dois, monocromático', () => {
    for (const nome of ['sem 2022', 'governador']) {
      const svg = renderCard(VARIANTES[nome]);
      expect(textos(svg).map((t) => t.conteudo), nome).toEqual(expect.arrayContaining(['DIFERENÇA DE']));
      expect(svg, nome).not.toContain('<polygon');
      expect(svg, nome).not.toContain(token('--accent'));
    }
  });

  it('governador ignora variação mesmo que ela chegue nos dados', () => {
    expect(renderCard({ ...VARIANTES.governador, variacao: 4 })).not.toContain('<polygon');
  });

  it('variação que arredonda para zero não vira seta', () => {
    expect(renderCard(com({ variacao: 0.02 }))).not.toContain('<polygon');
  });

  it('o acento do playground troca só a cor do acento', () => {
    const teal = renderCard(com({ acento: 'teal' }));
    expect(teal).toContain('#24ccc1');
    expect(teal).not.toContain(token('--accent'));
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

  it('palpite: selo, contornos sem preenchimento, sem lidera e sem fonte', () => {
    const svg = renderCard(VARIANTES.palpite);
    const conteudos = textos(svg).map((t) => t.conteudo);
    expect(conteudos).toEqual(expect.arrayContaining(['SEU PALPITE', 'PALPITE · NÃO É RESULTADO']));
    expect(svg).not.toMatch(/lidera|FONTE: TSE|PARCIAL/i);
    expect(svg).toContain('fill="none" stroke="');
    const cheios = [...svg.matchAll(/<rect [^>]*width="([\d.]+)"[^>]*fill="(#[0-9a-f]{6})"/g)].filter(([, largura, cor]) => Number(largura) > 10 && [INK, INK_2].includes(cor));
    expect(cheios).toHaveLength(0);
    expect([...renderCard(BASE).matchAll(/<rect [^>]*width="([\d.]+)"[^>]*fill="#(f2eee3|8b867a)"/g)].filter(([, largura]) => Number(largura) > 10)).not.toHaveLength(0);
  });

  it('o selo aparece em placa --accent com texto --bg', () => {
    const svg = renderCard(VARIANTES['com selo']);
    expect(svg).toMatch(/<rect [^>]*height="44" rx="8" fill="#b57bff"\/>/);
    expect(textos(svg).find((t) => t.conteudo === 'MAIS DIVIDIDA DO MA')?.fill).toBe(token('--bg'));
    expect(renderCard(BASE)).not.toContain('rx="8"');
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

  it.each(variantes)('%s: nada crítico acima de y=44 nem abaixo de y=631, nem fora das margens de 48 px', (_, d) => {
    const svg = renderCard(d);
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

describe('renderCard: vocabulário e tokens', () => {
  it.each(Object.entries(VARIANTES))('%s: nenhuma palavra proibida', (_, d) => {
    const svg = renderCard(d).toLowerCase();
    for (const palavra of PALAVRAS_PROIBIDAS) expect(svg).not.toContain(palavra);
  });

  it('as cores do SVG são as de styles/tokens.css, e o acento alternativo as do playground', () => {
    const svg = renderCard(com({ selo: 'x' }));
    for (const nome of ['--bg', '--ink', '--ink-2', '--accent']) expect(svg, nome).toContain(token(nome));
    const alternativas = [...tokens.matchAll(/\[data-acento='(\w+)'\]\s*\{\s*--accent:\s*(#[0-9a-f]{6})/g)];
    expect(alternativas.map((m) => m[1])).toEqual(['teal', 'coral']);
    for (const [, nome, cor] of alternativas) expect(renderCard(com({ acento: nome as 'teal' | 'coral' })), nome).toContain(cor);
  });

  it('nenhuma cor de partido: só os quatro tokens e o acento escolhido', () => {
    const permitidas = new Set([token('--bg'), INK, INK_2, token('--accent')]);
    for (const [nome, d] of Object.entries(VARIANTES)) {
      for (const cor of renderCard(d).match(/#[0-9a-f]{6}/gi) ?? []) expect(permitidas.has(cor.toLowerCase()), `${nome}: ${cor}`).toBe(true);
    }
  });
});
