import { describe, expect, it } from 'vitest';
import {
  EVENTO_MODO,
  caminhoDados,
  decidirModo,
  diferencas,
  esperaPre,
  estadoAoVivo,
  intervaloPolling,
  mesclar,
  modoParaAnunciar,
  vistaPlacar,
} from './ao-vivo.ts';
import type { CargoPlacar } from './contratos.ts';

const meio = () => 0.5;

describe('caminhoDados', () => {
  it('traduz a página no JSON de /data', () => {
    expect(caminhoDados('br')).toBe('/data/br.json');
    expect(caminhoDados('uf/rj')).toBe('/data/uf/rj.json');
    expect(caminhoDados('c/sao-luis-ma')).toBe('/data/c/sao-luis-ma.json');
    expect(caminhoDados('c/santa-barbara-doeste-sp')).toBe('/data/c/santa-barbara-doeste-sp.json');
  });

  it('só aceita o que sai de /data: nenhuma outra URL', () => {
    for (const ruim of [undefined, '', 'status', 'uf/RJ', 'uf/rjj', 'c/', 'c/Sao Luis', '../x', 'c/../../x', '//evil.com/x', 'https://evil.com/x', '/data/br.json']) {
      expect(caminhoDados(ruim), String(ruim)).toBeNull();
    }
  });
});

describe('decidirModo', () => {
  const status = (modo: string) => ({ v: 1, modo: modo as 'pre' | 'live' | 'final', inicio: null, atualizado: null });

  it('o modo é o do status.json lido', () => {
    expect(decidirModo(status('live'), 'pre')).toBe('live');
    expect(decidirModo(status('final'), 'live')).toBe('final');
    expect(decidirModo(status('pre'), 'live')).toBe('pre');
  });

  it('falha de rede não muda o modo: mantém o que a página já mostra', () => {
    expect(decidirModo(null, 'live')).toBe('live');
    expect(decidirModo(null, 'final')).toBe('final');
  });
});

describe('modoParaAnunciar (contrato aovivo:modo com o Palpite)', () => {
  it('o evento tem o nome combinado com as outras ilhas', () => {
    expect(EVENTO_MODO).toBe('aovivo:modo');
  });

  it('a primeira leitura sempre é anunciada, inclusive pre', () => {
    expect(modoParaAnunciar(null, 'pre')).toBe('pre');
    expect(modoParaAnunciar(null, 'live')).toBe('live');
  });

  it('depois, só quando o modo muda', () => {
    expect(modoParaAnunciar('live', 'live')).toBeNull();
    expect(modoParaAnunciar('pre', 'live')).toBe('live');
    expect(modoParaAnunciar('live', 'final')).toBe('final');
  });
});

describe('estadoAoVivo', () => {
  const boa = '2026-10-25T18:42:10-03:00';

  it('aguardando quando secoes_pct < 1', () => {
    expect(estadoAoVivo({ secoesPct: 0, falhas: 0, ultimaBoa: boa }).aguardando).toBe(true);
    expect(estadoAoVivo({ secoesPct: 0.99, falhas: 0, ultimaBoa: boa }).aguardando).toBe(true);
    expect(estadoAoVivo({ secoesPct: 1, falhas: 0, ultimaBoa: boa }).aguardando).toBe(false);
  });

  it('seção ausente ou inválida não inventa "aguardando"', () => {
    expect(estadoAoVivo({ secoesPct: undefined, falhas: 0, ultimaBoa: null }).aguardando).toBe(false);
    expect(estadoAoVivo({ secoesPct: Number.NaN, falhas: 0, ultimaBoa: null }).aguardando).toBe(false);
  });

  it('sem conexão só depois de duas falhas seguidas, com a hora da última atualização boa', () => {
    expect(estadoAoVivo({ secoesPct: 50, falhas: 0, ultimaBoa: boa }).semConexao).toBeNull();
    expect(estadoAoVivo({ secoesPct: 50, falhas: 1, ultimaBoa: boa }).semConexao).toBeNull();
    expect(estadoAoVivo({ secoesPct: 50, falhas: 2, ultimaBoa: boa }).semConexao).toBe('Sem conexão, mostrando a última atualização às 18:42.');
    expect(estadoAoVivo({ secoesPct: 50, falhas: 9, ultimaBoa: boa }).semConexao).toBe('Sem conexão, mostrando a última atualização às 18:42.');
  });

  it('sem nenhuma atualização boa não há "última atualização" para mostrar', () => {
    expect(estadoAoVivo({ secoesPct: undefined, falhas: 5, ultimaBoa: null }).semConexao).toBeNull();
  });
});

describe('intervaloPolling', () => {
  it('ao vivo: 20 s', () => {
    expect(intervaloPolling('live', 0, meio)).toBe(20_000);
  });

  it('jitter de no máximo 10% para os aparelhos não baterem juntos', () => {
    expect(intervaloPolling('live', 0, () => 0)).toBe(18_000);
    expect(intervaloPolling('live', 0, () => 1)).toBe(22_000);
  });

  it('cada falha dobra a espera, até o teto de 60 s', () => {
    expect(intervaloPolling('live', 1, meio)).toBe(40_000);
    expect(intervaloPolling('live', 2, meio)).toBe(60_000);
    expect(intervaloPolling('live', 8, meio)).toBe(60_000);
  });

  it('final: devagar (60 s), só para pegar correção tardia', () => {
    expect(intervaloPolling('final', 0, meio)).toBe(60_000);
    expect(intervaloPolling('final', 4, meio)).toBe(60_000);
  });

  it('pre: a página não faz polling', () => {
    expect(intervaloPolling('pre', 0, meio)).toBeNull();
  });
});

describe('esperaPre', () => {
  const inicio = '2026-10-25T17:00:00-03:00';
  const em = (minutosAntes: number) => new Date(inicio).getTime() - minutosAntes * 60_000;

  it('longe do início: acorda 5 minutos antes dele', () => {
    expect(esperaPre(inicio, em(120), () => 0)).toBe(115 * 60_000);
  });

  it('a menos de 5 minutos do início, ou depois dele: confere o status a cada minuto', () => {
    expect(esperaPre(inicio, em(3), () => 0)).toBe(60_000);
    expect(esperaPre(inicio, em(-40), () => 0)).toBe(60_000);
  });

  it('o jitter só espalha, nunca antecipa (até 30 s)', () => {
    expect(esperaPre(inicio, em(3), () => 1)).toBe(90_000);
  });

  it('nunca passa de 24 h (limite do setTimeout)', () => {
    expect(esperaPre(inicio, em(60 * 24 * 10), () => 0)).toBe(24 * 3_600_000);
  });

  it('sem início conhecido não há o que esperar', () => {
    expect(esperaPre(null, 0, meio)).toBeNull();
    expect(esperaPre('ontem', 0, meio)).toBeNull();
  });
});

describe('mesclar', () => {
  const antes = {
    secoes_pct: 50,
    atualizado: '2026-10-25T18:00:00-03:00',
    presidente: {
      cand: [
        { n: 13, nome: 'Lula', pct: 40, votos: 400, eleito: false },
        { n: 22, nome: 'Flávio Bolsonaro', pct: 60, votos: 600, eleito: false },
      ],
      variacao_2022: { '13': -1, '22': 1 },
    },
  };

  it('campo ausente no JSON novo mantém o antigo', () => {
    const r = mesclar(antes, { atualizado: '2026-10-25T18:20:00-03:00' });
    expect(r.secoes_pct).toBe(50);
    expect(r.atualizado).toBe('2026-10-25T18:20:00-03:00');
    expect(r.presidente.cand[1].nome).toBe('Flávio Bolsonaro');
  });

  it('número inválido, nulo ou de outro tipo não apaga o valor bom', () => {
    for (const ruim of [Number.NaN, Number.POSITIVE_INFINITY, null, '70', undefined]) {
      expect(mesclar(antes, { secoes_pct: ruim }).secoes_pct, String(ruim)).toBe(50);
    }
  });

  it('candidatos são mesclados pelo número de urna, na ordem 13 → 22, e nunca perdem o nome', () => {
    const r = mesclar(antes, { presidente: { cand: [{ n: 22, pct: 58 }, { n: 13, pct: 42 }] } });
    expect(r.presidente.cand.map((c) => c.n)).toEqual([13, 22]);
    expect(r.presidente.cand.map((c) => c.pct)).toEqual([42, 58]);
    expect(r.presidente.cand.map((c) => c.nome)).toEqual(['Lula', 'Flávio Bolsonaro']);
  });

  it('candidato que sumiu do JSON novo continua com o último valor', () => {
    const r = mesclar(antes, { presidente: { cand: [{ n: 13, pct: 45 }] } });
    expect(r.presidente.cand.map((c) => c.pct)).toEqual([45, 60]);
  });

  it('variacao_2022 vazia não apaga a anterior', () => {
    expect(mesclar(antes, { presidente: { variacao_2022: {} } }).presidente.variacao_2022).toEqual({ '13': -1, '22': 1 });
  });

  it('eleito do JSON novo vale como veio (nunca é inferido)', () => {
    const r = mesclar(antes, { presidente: { cand: [{ n: 13, eleito: true }] } });
    expect(r.presidente.cand.map((c) => c.eleito)).toEqual([true, false]);
  });

  it('primeiro JSON: sem anterior, entra como veio', () => {
    const dados = { secoes_pct: 12, presidente: { cand: [{ n: 13, pct: 1 }] } };
    expect(mesclar(undefined, dados)).toEqual(dados);
  });

  it('lixo no lugar do JSON mantém tudo', () => {
    for (const lixo of [null, undefined, 42, 'x', []]) expect(mesclar(antes, lixo)).toEqual(antes);
  });

  it('não altera o que recebeu', () => {
    const copia = structuredClone(antes);
    mesclar(antes, { secoes_pct: 99, presidente: { cand: [{ n: 13, pct: 1 }] } });
    expect(antes).toEqual(copia);
  });
});

describe('diferencas', () => {
  const base = {
    secoes_pct: 50,
    atualizado: '18:00',
    presidente: {
      cand: [
        { n: 13, pct: 40 },
        { n: 22, pct: 60 },
      ],
    },
  };

  it('iguais não mudam nada', () => {
    expect(diferencas(base, structuredClone(base))).toEqual([]);
  });

  it('lista só os números que mudaram, com o candidato pelo número de urna', () => {
    const novo = structuredClone(base);
    novo.presidente.cand[1].pct = 59.5;
    expect(diferencas(base, novo)).toEqual(['presidente.cand.22.pct']);
  });

  it('seções e hora entram', () => {
    expect(diferencas(base, { ...base, secoes_pct: 51, atualizado: '18:20' })).toEqual(['atualizado', 'secoes_pct']);
  });

  it('a ordem do array de candidatos não conta como mudança', () => {
    const invertido = { ...base, presidente: { cand: [...base.presidente.cand].reverse() } };
    expect(diferencas(base, invertido)).toEqual([]);
  });

  it('o primeiro JSON muda tudo o que traz', () => {
    expect(diferencas(undefined, { secoes_pct: 5 })).toEqual(['secoes_pct']);
  });
});

describe('vistaPlacar', () => {
  const cargo = (pct13: number, pct22: number, extra: Partial<CargoPlacar> = {}): Partial<CargoPlacar> => ({
    cand: [
      { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', votos: 0, pct: pct22, eleito: false },
      { n: 13, nome: 'Lula', partido: 'PT', votos: 0, pct: pct13, eleito: false },
    ],
    variacao_2022: { '13': -1.59, '22': 1.59 },
    ...extra,
  });
  const hora = '2026-10-25T18:42:10-03:00';

  it('13 sempre à esquerda, com a cor do candidato, quem quer que lidere', () => {
    const v = vistaPlacar(cargo(49.31, 50.69), 'live', 67, hora);
    expect(v.lados.map((l) => l.n)).toEqual([13, 22]);
    expect(v.lados.map((l) => l.cor)).toEqual(['var(--cand-13)', 'var(--cand-22)']);
    const virado = vistaPlacar(cargo(60, 40), 'live', 67, hora);
    expect(virado.lados.map((l) => l.cor)).toEqual(['var(--cand-13)', 'var(--cand-22)']);
  });

  it('percentual sem o sinal (o % é desenhado à parte)', () => {
    const v = vistaPlacar(cargo(49.31, 50.69), 'live', 67, hora);
    expect(v.lados.map((l) => l.texto)).toEqual(['49,3', '50,7']);
  });

  it('ao vivo, só quem lidera leva o rótulo; empate não tem líder', () => {
    expect(vistaPlacar(cargo(49.31, 50.69), 'live', 67, hora).lados.map((l) => l.rotulo)).toEqual([null, 'lidera']);
    expect(vistaPlacar(cargo(60, 40), 'live', 67, hora).lados.map((l) => l.rotulo)).toEqual(['lidera', null]);
    expect(vistaPlacar(cargo(50, 50), 'live', 67, hora).lados.map((l) => l.rotulo)).toEqual([null, null]);
  });

  it('final: "eleito" só com eleito: true no JSON, nunca pelo percentual', () => {
    expect(vistaPlacar(cargo(40, 60), 'final', 100, hora).lados.map((l) => l.rotulo)).toEqual([null, null]);
    const c = cargo(40, 60);
    c.cand = c.cand?.map((x) => (x.n === 22 ? { ...x, eleito: true } : x));
    expect(vistaPlacar(c, 'final', 100, hora).lados.map((l) => l.rotulo)).toEqual([null, 'eleito']);
  });

  it('aguardando com secoes_pct < 1: sem números, sem líder, sem seta', () => {
    const v = vistaPlacar(cargo(0, 0), 'live', 0.4, hora);
    expect(v.aguardando).toBe(true);
    expect(v.lados.map((l) => l.rotulo)).toEqual([null, null]);
    expect(v.seta).toBeNull();
  });

  it('sem os dois candidatos também aguarda, e mantém o que há (nome e número)', () => {
    expect(vistaPlacar(undefined, 'live', 50, hora).aguardando).toBe(true);
    const v = vistaPlacar({ cand: [{ n: 13, nome: 'Lula', partido: 'PT', votos: 0, pct: 40, eleito: false }] }, 'live', 50, hora);
    expect(v.aguardando).toBe(true);
  });

  it('a seta aponta para quem ganhou terreno desde 2022, na cor dele', () => {
    const v = vistaPlacar(cargo(49.31, 50.69), 'live', 67, hora);
    expect(v.seta).toEqual({ lado: 1, cor: 'var(--cand-22)', numero: '+1,6', resto: 'pontos para Flávio Bolsonaro em relação a 2022' });
    const outro = vistaPlacar(cargo(49.31, 50.69, { variacao_2022: { '13': 2.04 } }), 'live', 67, hora);
    expect(outro.seta).toMatchObject({ lado: 0, cor: 'var(--cand-13)', numero: '+2,0' });
  });

  it('sem variação, ou menor que 0,05 ponto, não há seta', () => {
    expect(vistaPlacar(cargo(49.31, 50.69, { variacao_2022: {} }), 'live', 67, hora).seta).toBeNull();
    expect(vistaPlacar(cargo(49.31, 50.69, { variacao_2022: { '13': 0.04 } }), 'live', 67, hora).seta).toBeNull();
  });

  it('governador sem cor própria fica neutro; só o 13 e o 22 têm cor', () => {
    const gov: Partial<CargoPlacar> = {
      cand: [
        { n: 12, nome: 'Fictício A', partido: 'FIC', votos: 0, pct: 49.2, eleito: false },
        { n: 45, nome: 'Fictícia B', partido: 'FIC', votos: 0, pct: 50.8, eleito: false },
      ],
      variacao_2022: {},
    };
    expect(vistaPlacar(gov, 'live', 67, hora).lados.map((l) => l.cor)).toEqual(['var(--ink)', 'var(--ink-2)']);
  });

  it('"longo" quando um lado passa de 99,95%', () => {
    expect(vistaPlacar(cargo(0, 100), 'live', 100, hora).longo).toBe(true);
    expect(vistaPlacar(cargo(49.31, 50.69), 'live', 67, hora).longo).toBe(false);
  });

  it('linha de apuração do vocabulário fixo; parcial nunca vira 100%', () => {
    expect(vistaPlacar(cargo(49.31, 50.69), 'live', 67, hora).linha).toBe('parcial · 67% das seções · Fonte: TSE · 18:42');
    expect(vistaPlacar(cargo(49.31, 50.69), 'live', 99.6, hora).linha).toBe('parcial · 99% das seções · Fonte: TSE · 18:42');
    expect(vistaPlacar(cargo(49.31, 50.69), 'final', 100, hora).linha).toBe('final · 100% das seções · Fonte: TSE · 18:42');
    expect(vistaPlacar(cargo(49.31, 50.69), 'live', undefined, hora).linha).toBeNull();
  });
});
