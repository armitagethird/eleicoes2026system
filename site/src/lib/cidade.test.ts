import { describe, expect, it } from 'vitest';
import type { CardData } from '../components/Card.ts';
import type { Hist } from './contratos.ts';
import { PALAVRAS_PROIBIDAS, descricaoCidade, esperaDoCard, notaSoEntreDois, textoCompartilhar, tituloCidade } from './copy.ts';
import { cardEmEspera, compartilhamento, linkCidade, parametroHora, variacaoEntreDois } from './cidade.ts';
import { diaMes } from './format.ts';
import { SITE_URL } from './site.ts';

const hist = (t2: [number, number] | null, t1: [number, number, number]): Hist => ({
  t2_2022: t2 && { pct: { '13': t2[0], '22': t2[1] }, comparecimento_pct: 80 },
  t1_2026: { pct: { '13': t1[0], '22': t1[1], outros: t1[2] }, comparecimento_pct: 80 },
});

describe('variacaoEntreDois', () => {
  it('compara só 13 e 22: os outros candidatos do 1º turno saem da conta', () => {
    // 44,79 / (44,79 + 30,88) = 59,19% contra 63,74% em 2022
    expect(variacaoEntreDois(hist([63.74, 36.26], [44.79, 30.88, 24.33]))).toBeCloseTo(-4.55, 2);
  });

  it('é simétrica: trocar 13 e 22 inverte o sinal, sem favorecer lado nenhum', () => {
    const a = variacaoEntreDois(hist([63.74, 36.26], [44.79, 30.88, 24.33]));
    const b = variacaoEntreDois(hist([36.26, 63.74], [30.88, 44.79, 24.33]));
    expect(a).not.toBeNull();
    expect(b).toBeCloseTo(-(a as number), 10);
  });

  it('sem 2022, sem hist ou sem votos dos dois: não há comparação', () => {
    expect(variacaoEntreDois(hist(null, [28.41, 46.28, 25.31]))).toBeNull();
    expect(variacaoEntreDois(undefined)).toBeNull();
    expect(variacaoEntreDois(hist([50, 50], [0, 0, 100]))).toBeNull();
  });
});

describe('cardEmEspera', () => {
  const cand = [
    { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL' },
    { n: 13, nome: 'Lula', partido: 'PT' },
  ];
  const card = cardEmEspera({ nome: 'São Luís', uf: 'MA' }, cand, '2026-10-25T17:00:00-03:00');

  it('é um card parcial sem nenhuma seção, com a hora de início', () => {
    expect(card).toMatchObject({ modo: 'parcial', local: 'São Luís', uf: 'MA', cargo: 'presidente', secoesPct: 0, hora: '17:00' });
  });

  it('mantém 13 antes de 22 e nenhum percentual', () => {
    expect(card.cand.map((c) => c.n)).toEqual([13, 22]);
    expect(card.cand.map((c) => c.pct)).toEqual([0, 0]);
  });

  it('sem início conhecido a hora fica em branco, nunca inventada', () => {
    expect(cardEmEspera({ nome: 'São Luís', uf: 'MA' }, cand, null).hora).toBe('--:--');
  });
});

describe('parametroHora', () => {
  it('HH:MM vira HHMM para o ?t= do link', () => {
    expect(parametroHora('18:42')).toBe('1842');
    expect(parametroHora('09:05')).toBe('0905');
  });

  it('hora desconhecida não vira parâmetro', () => {
    expect(parametroHora('--:--')).toBe('');
    expect(parametroHora('')).toBe('');
  });
});

describe('textoCompartilhar', () => {
  const lula = (pct: number) => ({ n: 13, nome: 'Lula', pct });
  const flavio = (pct: number) => ({ n: 22, nome: 'Flávio Bolsonaro', pct });
  const saoLuis = { local: 'São Luís', cand: [lula(61.13), flavio(38.87)], variacao: -2.61, modo: 'parcial', secoesPct: 87.3 } as const;

  it('segue o formato do brief e termina no link com a hora', () => {
    expect(textoCompartilhar(saoLuis, 'dominio.com.br/c/sao-luis-ma?t=1842')).toBe(
      'São Luís: Lula 61,1% × Flávio Bolsonaro 38,9%, +2,6 pts para Flávio Bolsonaro vs 2022 · 87% apurado · dominio.com.br/c/sao-luis-ma?t=1842',
    );
  });

  it('sem link, o texto acaba na apuração (o link vai à parte no navigator.share)', () => {
    expect(textoCompartilhar(saoLuis)).toBe('São Luís: Lula 61,1% × Flávio Bolsonaro 38,9%, +2,6 pts para Flávio Bolsonaro vs 2022 · 87% apurado');
  });

  it('sempre 13 antes de 22, qualquer que seja a ordem de entrada e quem lidera', () => {
    const texto = textoCompartilhar({ ...saoLuis, cand: [flavio(61.7), lula(38.3)] });
    expect(texto.indexOf('Lula')).toBeLessThan(texto.indexOf('Flávio Bolsonaro'));
  });

  it('o ganho de terreno vai para o candidato certo nos dois sentidos', () => {
    expect(textoCompartilhar({ ...saoLuis, variacao: 3.4 })).toContain('+3,4 pts para Lula vs 2022');
    expect(textoCompartilhar({ ...saoLuis, variacao: -3.4 })).toContain('+3,4 pts para Flávio Bolsonaro vs 2022');
  });

  it('sem comparação com 2022 (ou variação nula), a frase da variação some', () => {
    expect(textoCompartilhar({ ...saoLuis, variacao: undefined })).toBe('São Luís: Lula 61,1% × Flávio Bolsonaro 38,9% · 87% apurado');
    expect(textoCompartilhar({ ...saoLuis, variacao: 0.01 })).not.toContain('vs 2022');
  });

  it('parcial nunca arredonda para 100%; final diz 100%', () => {
    expect(textoCompartilhar({ ...saoLuis, secoesPct: 99.7 })).toContain('99% apurado');
    expect(textoCompartilhar({ ...saoLuis, modo: 'final', secoesPct: 100 })).toContain('100% apurado');
  });

  it('não usa palavra proibida nem rótulo de posição', () => {
    const texto = textoCompartilhar(saoLuis, 'dominio.com.br/c/sao-luis-ma');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(texto).not.toContain(palavra);
    expect(texto).not.toMatch(/lidera|eleit/i);
  });
});

describe('textos da página de cidade', () => {
  it('a espera do card cita a hora e o dia do início', () => {
    expect(esperaDoCard('17:00', '25 de outubro')).toBe(
      'Aguardando primeiras seções. A apuração do 2º turno começa às 17:00 de 25 de outubro e este card passa a mostrar a cidade ao vivo.',
    );
  });

  it('a nota explica que a variação ignora os outros candidatos', () => {
    expect(notaSoEntreDois(24.33)).toContain('24,3%');
    expect(notaSoEntreDois(24.33)).toContain('13 e 22');
  });
});

describe('diaMes', () => {
  it('dia e mês por extenso em America/Sao_Paulo', () => {
    expect(diaMes('2026-10-25T17:00:00-03:00')).toBe('25 de outubro');
    // 01:30 UTC do dia 26 ainda é dia 25 em Brasília
    expect(diaMes('2026-10-26T01:30:00Z')).toBe('25 de outubro');
  });

  it('entrada ausente ou inválida devolve texto vazio', () => {
    expect(diaMes(null)).toBe('');
    expect(diaMes('amanhã')).toBe('');
  });
});

describe('linkCidade', () => {
  const dominio = new URL(SITE_URL).host;

  it('leva a hora do card no ?t=; a canônica continua sem query', () => {
    expect(linkCidade('sao-luis-ma', '18:42')).toEqual({
      completo: `${SITE_URL}/c/sao-luis-ma?t=1842`,
      curto: `${dominio}/c/sao-luis-ma?t=1842`,
    });
  });

  it('sem hora conhecida o link sai limpo', () => {
    expect(linkCidade('sao-luis-ma', '--:--')).toEqual({ completo: `${SITE_URL}/c/sao-luis-ma`, curto: `${dominio}/c/sao-luis-ma` });
  });
});

describe('compartilhamento', () => {
  const card: CardData = {
    modo: 'parcial',
    local: 'São Luís',
    uf: 'MA',
    cargo: 'presidente',
    cand: [
      { n: 13, nome: 'Lula', partido: 'PT', pct: 61.13 },
      { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', pct: 38.87 },
    ],
    variacao: -2.61,
    secoesPct: 87.3,
    hora: '18:42',
    dominio: 'x',
    handle: '@x',
  };
  const { texto, textoComLink, url } = compartilhamento(card, 'sao-luis-ma');

  it('o texto do navigator.share não repete o link (ele vai em url)', () => {
    expect(texto).toBe('São Luís: Lula 61,1% × Flávio Bolsonaro 38,9%, +2,6 pts para Flávio Bolsonaro vs 2022 · 87% apurado');
    expect(url).toBe(`${SITE_URL}/c/sao-luis-ma?t=1842`);
  });

  it('o texto copiado no fallback termina no link curto com a hora', () => {
    expect(textoComLink).toBe(`${texto} · ${new URL(SITE_URL).host}/c/sao-luis-ma?t=1842`);
  });

  it('card final diz 100% apurado', () => {
    expect(compartilhamento({ ...card, modo: 'final', secoesPct: 100 }, 'sao-luis-ma').texto).toContain('100% apurado');
  });
});

describe('textos de SEO da cidade', () => {
  it('o título segue o padrão do brief', () => {
    expect(tituloCidade('São Luís', 'MA')).toBe('Resultado do 2º turno 2026 em São Luís (MA) — comparado com 2022');
  });

  it('a descrição cita a cidade, o 1º turno, 2022 e fica abaixo de 160 caracteres, sem palavra proibida', () => {
    const descricao = descricaoCidade('Vila Bela da Santíssima Trindade', 'MT');
    expect(descricao).toContain('Vila Bela da Santíssima Trindade (MT)');
    expect(descricao).toContain('1º turno de 2026');
    expect(descricao).toContain('2022');
    expect(descricao.length).toBeLessThanOrEqual(160);
    for (const palavra of PALAVRAS_PROIBIDAS) expect(descricao).not.toContain(palavra);
  });
});
