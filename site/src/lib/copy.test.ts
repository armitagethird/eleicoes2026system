import { describe, expect, it } from 'vitest';
import { AGUARDANDO_SECOES, PALAVRAS_PROIBIDAS, linhaApuracao, rotuloPosicao, semConexao } from './copy.ts';

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
