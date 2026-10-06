import { describe, expect, it } from 'vitest';
import {
  AGUARDANDO_SECOES,
  AVISO_FICTICIO,
  GOVERNADOR_PRE,
  LINHA_PRIMEIRO_TURNO,
  PALAVRAS_PROIBIDAS,
  apuracaoCard,
  contagemFalada,
  descricaoRankings,
  descricaoUf,
  linhaApuracao,
  listasAbrem,
  pilula,
  rankingsComecam,
  rotuloPosicao,
  semConexao,
  tituloRankings,
  tituloUf,
  variacao2022,
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

  it('rankings no pre dizem a hora e o dia do início, lidos do status', () => {
    expect(rankingsComecam('2026-10-25T17:00:00-03:00')).toBe('os rankings começam às 17h do dia 25');
    expect(rankingsComecam('2026-10-25T17:30:00-03:00')).toBe('os rankings começam às 17h30 do dia 25');
  });

  it('rankings no pre sem início conhecido não inventa hora', () => {
    expect(rankingsComecam(null)).toBe('os rankings começam com a apuração do 2º turno');
    expect(rankingsComecam('amanhã')).toBe('os rankings começam com a apuração do 2º turno');
  });

  it('a frase do pre de /rankings diz hora e dia do início e não repete "rankings"', () => {
    expect(listasAbrem('2026-10-25T17:00:00-03:00')).toBe('as listas abrem com a apuração, às 17h do dia 25');
    expect(listasAbrem('2026-10-25T17:30:00-03:00')).toBe('as listas abrem com a apuração, às 17h30 do dia 25');
    expect(listasAbrem('2026-10-25T17:00:00-03:00')).not.toContain('ranking');
  });

  it('a frase do pre de /rankings sem início conhecido não inventa hora', () => {
    for (const inicio of [null, undefined, 'amanhã']) {
      expect(listasAbrem(inicio)).toBe('as listas abrem com a apuração do 2º turno');
    }
  });

  it('nenhum texto novo usa palavra proibida', () => {
    const textos = [
      tituloUf('Bahia', 'BA'),
      descricaoUf('Bahia', 'BA'),
      GOVERNADOR_PRE,
      rankingsComecam('2026-10-25T17:00:00-03:00'),
      rankingsComecam(null),
      listasAbrem('2026-10-25T17:00:00-03:00'),
      listasAbrem(null),
      tituloRankings,
      descricaoRankings,
    ].join(' ');
    for (const palavra of PALAVRAS_PROIBIDAS) expect(textos).not.toContain(palavra);
  });
});
