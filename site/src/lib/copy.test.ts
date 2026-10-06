import { describe, expect, it } from 'vitest';
import {
  AGUARDANDO_SECOES,
  AVISO_FICTICIO,
  LINHA_PRIMEIRO_TURNO,
  PALAVRAS_PROIBIDAS,
  contagemFalada,
  linhaApuracao,
  pilula,
  rotuloPosicao,
  semConexao,
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

  it('sem conexão cita a hora da última atualização', () => {
    expect(semConexao('2026-10-25T18:42:10-03:00')).toBe('sem conexão, mostrando última atualização às 18:42');
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
