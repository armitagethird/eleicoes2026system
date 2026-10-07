import { describe, expect, it } from 'vitest';
import {
  AGUARDANDO_SECOES,
  AVISO_FICTICIO,
  GOVERNADOR_PRE,
  LINHA_PRIMEIRO_TURNO,
  PALAVRAS_PROIBIDAS,
  apuracaoCard,
  contagemFalada,
  descricaoUf,
  linhaApuracao,
  pilula,
  rotuloPosicao,
  semConexao,
  tituloUf,
  variacao2022,
  LINHA_APURADA,
  aoVivoAPartir,
  descricaoApuracao,
  legendaMapa,
  rotuloAba,
  semVirada,
  tituloApuracao,
  turnoDaCamada,
  variacaoDesdeCamada,
  BRASIL,
  MAPA_TECLAS,
  rotuloMotor,
} from './copy.ts';

describe('copy', () => {
  it('eleito(a) só com eleito: true', () => {
    expect(rotuloPosicao(false)).toBe('lidera');
    expect(rotuloPosicao(false, true)).toBe('lidera');
    expect(rotuloPosicao(true)).toBe('eleito');
    expect(rotuloPosicao(true, true)).toBe('eleita');
  });

  it('linha de apuração do card', () => {
    expect(linhaApuracao('parcial', 87.3, '2026-10-25T18:42:10-03:00')).toBe('parcial · 87% das seções · Fonte: TSE · 18:42');
    expect(linhaApuracao('final', 100, '2026-10-25T21:03:00-03:00')).toBe('final · 100% das seções · Fonte: TSE · 21:03');
  });

  it('parcial nunca diz 100% das seções, em nenhum dos três textos de apuração', () => {
    expect(linhaApuracao('parcial', 99.6, '2026-10-25T21:00:00-03:00')).toBe('parcial · 99% das seções · Fonte: TSE · 21:00');
    expect(linhaApuracao('parcial', 100, '2026-10-25T21:00:00-03:00')).toContain('99% das seções');
    expect(linhaApuracao('parcial', 99.6, undefined)).toBe(`${apuracaoCard('parcial', 99.6)} · Fonte: TSE · --:--`);
    expect(pilula('live', 99.6, '2026-10-25T21:00:00-03:00')).toBe('ao vivo · 99% · 21:00');
  });

  it('sem conexão cita a hora da última atualização', () => {
    expect(semConexao('2026-10-25T18:42:10-03:00')).toBe('Sem conexão, mostrando a última atualização às 18:42.');
  });

  it('nenhum texto usa palavra proibida', () => {
    const textos = [
      AGUARDANDO_SECOES,
      rotuloPosicao(false),
      rotuloPosicao(true),
      linhaApuracao('parcial', 10, undefined),
      semConexao(undefined),
    ].join(' ');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(textos).not.toContain(palavra);
  });
});

describe('copy da home', () => {
  it('pílula de estado por modo', () => {
    expect(pilula('pre')).toBe('1º turno apurado · 2º turno 25 out');
    expect(pilula('live', 87.3, '2026-10-25T18:42:10-03:00')).toBe('ao vivo · 87% · 18:42');
    expect(pilula('final', 100, '2026-10-25T21:03:00-03:00')).toBe('final · 100% · 21:03');
  });

  it('pílula ao vivo nunca arredonda para 100% (como o card)', () => {
    expect(pilula('live', 99.6, '2026-10-25T20:50:00-03:00')).toBe('ao vivo · 99% · 20:50');
  });

  it('pílula sem seções apuradas não inventa percentual', () => {
    expect(pilula('live', undefined, '2026-10-25T18:42:10-03:00')).toBe('ao vivo · 18:42');
  });

  it('contagem falada com singular e plural', () => {
    expect(contagemFalada({ d: 18, h: 6, min: 12 })).toBe('Apuração do 2º turno em 18 dias, 6 horas e 12 minutos');
    expect(contagemFalada({ d: 1, h: 1, min: 1 })).toBe('Apuração do 2º turno em 1 dia, 1 hora e 1 minuto');
    expect(contagemFalada({ d: 0, h: 0, min: 0 })).toBe('Apuração do 2º turno em 0 dias, 0 horas e 0 minutos');
  });

  it('variação vs 2022 diz para quem foi o deslocamento', () => {
    expect(variacao2022('Lula', 3.4)).toBe('+3,4 pontos para Lula em relação a 2022');
    expect(variacao2022('Flávio Bolsonaro', 1.04)).toBe('+1,0 ponto para Flávio Bolsonaro em relação a 2022');
  });

  it('nenhum texto da home usa palavra proibida', () => {
    const textos = [
      pilula('pre'),
      pilula('live', 50, undefined),
      pilula('final', 100, undefined),
      contagemFalada({ d: 2, h: 3, min: 4 }),
      variacao2022('Lula', 1),
      LINHA_PRIMEIRO_TURNO,
      AVISO_FICTICIO,
    ].join(' ');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(textos).not.toContain(palavra);
  });
});

describe('copy de estado, rankings e 404', () => {
  it('título e descrição do estado levam o nome e a sigla, sem preposição que mude por estado', () => {
    expect(tituloUf('Maranhão', 'MA')).toBe('Maranhão (MA): resultado do 2º turno 2026, comparado com 2022');
    expect(descricaoUf('Mato Grosso do Sul', 'MS')).toContain('Mato Grosso do Sul (MS)');
  });

  it('governador em modo pre só avisa o dia, sem número', () => {
    expect(GOVERNADOR_PRE).toBe('2º turno para governador em 25/10');
    expect(GOVERNADOR_PRE).not.toMatch(/\d+[,.]\d/);
  });

  it('nenhum texto novo usa palavra proibida', () => {
    const textos = [
      tituloUf('Bahia', 'BA'),
      descricaoUf('Bahia', 'BA'),
      GOVERNADOR_PRE,
    ].join(' ');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(textos).not.toContain(palavra);
  });
});

describe('copy da apuração', () => {
  it('título do brief da página', () => {
    expect(tituloApuracao).toBe('Apuração em tempo real do 2º turno 2026 — mapa por município');
  });

  it('nome de cada camada; o ao vivo só se chama assim durante a apuração', () => {
    expect(turnoDaCamada('2018-t1')).toBe('1º turno 2018');
    expect(turnoDaCamada('2022-t2')).toBe('2º turno 2022');
    expect(turnoDaCamada('ao-vivo')).toBe('2º turno 2026');
    expect(rotuloAba('ao-vivo', true)).toBe('ao vivo 2026');
    expect(rotuloAba('ao-vivo', false)).toBe('2º turno 2026');
    expect(rotuloAba('2026-t1', true)).toBe('1º turno 2026');
  });

  it('a variação contra o 2º turno de 2022 é exatamente a frase de sempre; contra outro ano, só troca o ano', () => {
    expect(variacaoDesdeCamada('Lula', 3.4, '2022-t2')).toBe(variacao2022('Lula', 3.4));
    expect(variacaoDesdeCamada('Lula', 1, '2018-t2')).toBe('+1,0 ponto para Lula em relação a 2018');
  });

  it('contra um 1º turno, a frase diz o turno (a cidade e o card comparam com o 2º turno de 2022)', () => {
    expect(variacaoDesdeCamada('Flávio Bolsonaro', 5.1, '2022-t1')).toBe('+5,1 pontos para Flávio Bolsonaro em relação ao 1º turno de 2022');
    expect(variacaoDesdeCamada('Lula', 1, '2018-t1')).toBe('+1,0 ponto para Lula em relação ao 1º turno de 2018');
  });

  it('"lidera" na legenda só durante a apuração', () => {
    expect(legendaMapa('resultado', true, '')).toContain('lidera');
    expect(legendaMapa('resultado', false, '')).not.toContain('lidera');
    expect(legendaMapa('variacao', true, '2º turno 2018')).toContain('desde o 2º turno 2018');
  });

  it('quando o mapa passa a ser ao vivo, sem inventar hora', () => {
    expect(aoVivoAPartir('2026-10-25T17:00:00-03:00')).toBe('ao vivo a partir das 17h do dia 25');
    expect(aoVivoAPartir(null)).toBe('ao vivo durante a apuração do 2º turno');
  });

  it('nenhum texto da apuração usa palavra proibida', () => {
    const textos = [
      tituloApuracao,
      descricaoApuracao,
      LINHA_APURADA,
      legendaMapa('resultado', true, ''),
      legendaMapa('resultado', false, ''),
      legendaMapa('variacao', false, '2º turno 2018'),
      semVirada('2º turno 2018'),
    ].join(' ');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(textos.toLowerCase()).not.toContain(palavra);
  });
});

describe('copy do motor do mapa', () => {
  it('nome acessível do canvas: o rótulo do mapa e o lugar em foco', () => {
    expect(rotuloMotor('2º turno 2022', 'Maranhão')).toBe(
      'Mapa por município, 2º turno 2022. A mesma informação está na tabela abaixo do mapa. Mostrando: Maranhão.',
    );
    expect(rotuloMotor(null, BRASIL)).toBe('Mostrando: Brasil.');
  });

  it('instrução de teclado sem palavra proibida nem resultado', () => {
    for (const palavra of [...PALAVRAS_PROIBIDAS, 'lidera', 'eleit']) expect(MAPA_TECLAS.toLowerCase()).not.toContain(palavra);
    expect(MAPA_TECLAS).toContain('Esc volta ao Brasil');
  });
});
