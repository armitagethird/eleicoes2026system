import { describe, expect, it } from 'vitest';
import { destaques, type Lugar } from '../../lib/apuracao-dados.ts';
import { lerCamada, type Camada } from '../../lib/camada-mapa.ts';
import { PALAVRAS_PROIBIDAS } from '../../lib/copy.ts';
import { destaquesHtml, esc, legendaHtml, placarHtml, semQuebraNoSeparador, tabelaHtml, type Contexto } from './painel.ts';

function camada(candidatos: unknown[], br: number[], municipios: number[][] = []): Camada {
  const c = lerCamada({ v: 1, id: 'x', rotulo: 'x', atualizado: '2026-10-25T18:42:10-03:00', candidatos, br, ufs: {}, municipios });
  if (!c) throw new Error('camada de teste inválida');
  return c;
}

const de2018 = camada(
  [
    { n: 13, nome: 'Fernando Haddad', partido: 'PT', cor: '13' },
    { n: 17, nome: 'Jair Bolsonaro', partido: 'PSL', cor: '22' },
  ],
  [44.87, 55.13, 0, 0, 100],
);
const aoVivo = camada(
  [
    { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
    { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', cor: '22' },
  ],
  [48.3, 51.7, 0, 0, 63.4],
  [[2111300, 57.6, 42.4, 0, 0, 80]],
);
const ctx = (c: Camada, id: Contexto['id'], parcial: boolean, idReferencia: Contexto['idReferencia'] = null): Contexto => ({
  id,
  camada: c,
  idReferencia,
  parcial,
});
const texto = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('placar', () => {
  it('A sempre antes de B, mesmo com B na frente', () => {
    const html = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'Brasil', sigla: 'br' }, aoVivo.br, null);
    expect(html.indexOf('Lula')).toBeLessThan(html.indexOf('Flávio Bolsonaro'));
    expect(html.indexOf('48,3')).toBeLessThan(html.indexOf('51,7'));
  });

  it('em 2018 o 17 veste o azul do 22 (a cor vem do dado)', () => {
    const html = placarHtml(ctx(de2018, '2018-t2', false), { nome: 'Brasil' }, de2018.br, null);
    expect(html).toContain('<span class="placa-n">17</span>');
    expect(html).toMatch(/--cor:var\(--cand-22\)"><p class="quem"><span class="placa-n">17/);
  });

  it('"lidera" só durante a apuração, e no lado de quem lidera', () => {
    const parcial = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'Brasil' }, aoVivo.br, null);
    expect(parcial).toMatch(/class="dir"[^>]*><span class="rotulo">lidera/);
    expect(texto(parcial)).toContain('22 lidera');
    const final = placarHtml(ctx(aoVivo, 'ao-vivo', false), { nome: 'Brasil' }, aoVivo.br, null);
    expect(final).not.toContain('lidera');
  });

  it('abaixo de 1% das seções: aguardando, sem número', () => {
    const html = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'Brasil' }, { a: 60, b: 40, outros: 0, liderOutro: null, secoes: 0.4 }, null);
    expect(html).toContain('aguardando primeiras seções');
    expect(html).not.toContain('data-flap-chave');
  });

  it('eleição já apurada: lugar sem número é "sem dado", nunca "aguardando", e sem a linha "final · 100%"', () => {
    const semResultado = placarHtml(ctx(de2018, '2018-t2', false), { nome: 'Boa Esperança do Norte', uf: 'MT' }, null, null, true);
    expect(texto(semResultado)).toContain('sem dado');
    expect(texto(semResultado)).not.toContain('aguardando');
    expect(texto(semResultado)).not.toContain('100%');
    const comResultado = placarHtml(ctx(de2018, '2018-t2', false), { nome: 'Brasil' }, de2018.br, null);
    expect(texto(comResultado)).toContain('final · 100% das seções');
  });

  it('seta para quem ganhou terreno, com o ano da referência', () => {
    const html = placarHtml(ctx(aoVivo, 'ao-vivo', true, '2022-t2'), { nome: 'Brasil' }, aoVivo.br, -1.2);
    expect(texto(html)).toContain('+1,2 pontos para Flávio Bolsonaro em relação a 2022');
    expect(html).toContain('class="seta dir"');
  });

  it('escapa o que vem do dado', () => {
    expect(esc('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
    const html = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'A<script>' }, aoVivo.br, null);
    expect(html).not.toContain('<script>');
  });
});

describe('detalhe: o botão que leva ao card', () => {
  const maranhao = { nome: 'Maranhão', sigla: 'ma', ufCard: 'ma' } as const;
  const valorMa = { a: 66.85, b: 33.15, outros: 0, liderOutro: null, secoes: 69.4 };
  const detalheMa = placarHtml(ctx(aoVivo, 'ao-vivo', true, '2022-t2'), maranhao, valorMa, -4.29, true);

  it('UF: leva a /uf/{uf}, com o nome acessível do estado', () => {
    expect(detalheMa).toMatch(/<a class="ir" href="\/uf\/ma" aria-label="ver o card de Maranhão">ver o card/);
  });

  it('UF: o mesmo placar completo do município (bandeira, meta, variação vs 2022, linha de apuração)', () => {
    expect(detalheMa).toContain('class="bandeira"');
    expect(detalheMa).toContain('folha-lugar compacto');
    const falado = texto(detalheMa);
    expect(falado).toContain('presidente · 2º turno 2026');
    expect(falado).toContain('+4,3 pontos para Flávio Bolsonaro em relação a 2022');
    expect(falado).toContain('parcial · 69% das seções · Fonte: TSE · 18:42');
  });

  it('município segue levando a /c/{slug}; o Brasil não tem card', () => {
    const cidade = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'São Luís', uf: 'MA', slug: 'sao-luis-ma' }, valorMa, null, true);
    expect(cidade).toMatch(/<a class="ir" href="\/c\/sao-luis-ma" aria-label="ver o card de São Luís">/);
    expect(placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'Brasil', sigla: 'br' }, aoVivo.br, null)).not.toContain('class="ir"');
  });
});

describe('destaques, tabela e legenda', () => {
  const indice = new Map<number, Lugar>([[2111300, { ibge: 2111300, slug: 'sao-luis-ma', nome: 'São Luís', uf: 'MA', eleitores: 1 }]]);

  it('destaques sem camada: linhas de espera; com camada: o município e o botão que leva o mapa até ele', () => {
    expect(destaquesHtml(null, null, 'Brasil')).toContain('dq-espera');
    const html = destaquesHtml(ctx(aoVivo, 'ao-vivo', true), destaques(aoVivo, null, indice, null), 'Brasil');
    expect(html).toContain('data-ibge="2111300"');
    expect(html).toContain('São Luís');
  });

  it('tabela com A antes de B e o link do card no município', () => {
    const linhas = [{ chave: '2111300', nome: 'São Luís', valor: aoVivo.municipios.get(2111300) ?? null, variacao: 2.5 }];
    const html = tabelaHtml(ctx(aoVivo, 'ao-vivo', true, '2022-t2'), linhas, 'Maranhão', true, () => 'sao-luis-ma');
    expect(html.indexOf('Lula')).toBeLessThan(html.indexOf('Flávio Bolsonaro'));
    expect(html).toContain('href="/c/sao-luis-ma"');
    expect(texto(html)).toContain('13 +2,5');
  });

  it('legenda: A em cima, e "lidera" só durante a apuração', () => {
    const parcial = legendaHtml(ctx(aoVivo, 'ao-vivo', true), 'resultado');
    expect(parcial.indexOf('Lula')).toBeLessThan(parcial.indexOf('Flávio Bolsonaro'));
    expect(parcial).toContain('lidera');
    expect(legendaHtml(ctx(de2018, '2018-t2', false), 'resultado')).not.toContain('lidera');
  });

  it('nenhum painel usa palavra proibida', () => {
    const html = [
      placarHtml(ctx(aoVivo, 'ao-vivo', true, '2022-t2'), { nome: 'Brasil' }, aoVivo.br, 3),
      legendaHtml(ctx(aoVivo, 'ao-vivo', true, '2022-t2'), 'variacao'),
      destaquesHtml(ctx(aoVivo, 'ao-vivo', true, '2022-t2'), destaques(aoVivo, de2018, indice, null), 'Brasil'),
    ].join(' ');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(texto(html).toLowerCase()).not.toContain(palavra);
  });
});

describe('correções da revisão', () => {
  const primeiroTurno = camada(
    [
      { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
      { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', cor: '22' },
    ],
    [38.4, 55.5, 6.1, 0, 100],
  );

  it('a variação do 1º turno diz que a referência é o 1º turno de 2022; a do 2º turno segue "a 2022"', () => {
    const t1 = placarHtml(ctx(primeiroTurno, '2026-t1', false, '2022-t1'), { nome: 'Brasil' }, primeiroTurno.br, -5.1);
    expect(texto(t1)).toContain('+5,1 pontos para Flávio Bolsonaro em relação ao 1º turno de 2022');
    const t2 = placarHtml(ctx(aoVivo, 'ao-vivo', true, '2022-t2'), { nome: 'Brasil' }, aoVivo.br, -5.1);
    expect(texto(t2)).toContain('em relação a 2022');
    expect(texto(t2)).not.toContain('1º turno de 2022');
  });

  it('a "mais dividida" mostra duas casas, porque com uma só quase todas viram 50,0 e 50,0', () => {
    const empatadas = camada(
      [
        { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
        { n: 22, nome: 'Jair Bolsonaro', partido: 'PL', cor: '22' },
      ],
      [50.9, 49.1, 0, 0, 100],
      [
        [3144300, 50.01, 49.99, 0, 0, 100],
        [2111300, 57.6, 42.4, 0, 0, 100],
      ],
    );
    const lista = new Map<number, Lugar>([
      [3144300, { ibge: 3144300, slug: 'nanuque-mg', nome: 'Nanuque', uf: 'MG', eleitores: 1 }],
      [2111300, { ibge: 2111300, slug: 'sao-luis-ma', nome: 'São Luís', uf: 'MA', eleitores: 1 }],
    ]);
    const html = destaquesHtml(ctx(empatadas, '2022-t2', false), destaques(empatadas, null, lista, null), 'Brasil');
    const [dividida, unanime] = html.split('<section').slice(1);
    expect(texto(dividida)).toContain('50,01 49,99');
    expect(texto(unanime)).toContain('57,6 42,4');
  });

  it('o bloco de contexto pode ir sem foto nem crédito (o detalhe do município já tem)', () => {
    const com = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'Maranhão', sigla: 'ma' }, aoVivo.br, null);
    expect(com).toContain('class="foto"');
    expect(com).toContain('Foto: TSE');
    const sem = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'Maranhão', sigla: 'ma', semFoto: true }, aoVivo.br, null);
    expect(sem).not.toContain('class="foto"');
    expect(sem).not.toContain('Foto: TSE');
    expect(sem).not.toContain('com-foto');
  });

  it('o separador da linha de apuração nunca abre a linha (espaço inquebrável antes do ·)', () => {
    const html = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'Brasil' }, aoVivo.br, null);
    expect(html).toContain('parcial · 63% das seções · Fonte: TSE · 18:42');
    expect(semQuebraNoSeparador('a · b · c')).toBe('a · b · c');
  });

  it('o card a um toque fica num rodapé próprio, que a gaveta do celular prende embaixo', () => {
    const detalhe = placarHtml(ctx(aoVivo, 'ao-vivo', true), { nome: 'São Luís', uf: 'MA', slug: 'sao-luis-ma' }, aoVivo.municipios.get(2111300) ?? null, null, true);
    expect(detalhe).toMatch(/<div class="ir-fixo"><a class="ir" href="\/c\/sao-luis-ma"/);
  });
});
