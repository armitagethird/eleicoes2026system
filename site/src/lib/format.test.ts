import { describe, expect, it } from 'vitest';
import { hora, numero, percentual, pontos, votos } from './format.ts';

describe('numero', () => {
  it('usa ponto como separador de milhar, inclusive em 4 dígitos', () => {
    expect(numero(0)).toBe('0');
    expect(numero(999)).toBe('999');
    expect(numero(1234)).toBe('1.234');
    expect(numero(1234567)).toBe('1.234.567');
    expect(numero(156_454_011)).toBe('156.454.011');
  });

  it('arredonda para inteiro', () => {
    expect(numero(2.4)).toBe('2');
    expect(numero(2.5)).toBe('3');
  });

  it('negativo usa o sinal de menos tipográfico (U+2212)', () => {
    expect(numero(-1234)).toBe('−1.234');
  });

  it('não gera "-0"', () => {
    expect(numero(-0.2)).toBe('0');
    expect(numero(-0)).toBe('0');
  });
});

describe('percentual', () => {
  it('usa vírgula e uma casa por padrão', () => {
    expect(percentual(61.3)).toBe('61,3%');
    expect(percentual(38.7)).toBe('38,7%');
  });

  it('mantém sempre a mesma largura: 0 e 100 também levam casa decimal', () => {
    expect(percentual(0)).toBe('0,0%');
    expect(percentual(100)).toBe('100,0%');
    expect(percentual(50)).toBe('50,0%');
  });

  it('arredonda a metade para longe do zero (0,05 -> 0,1)', () => {
    expect(percentual(0.05)).toBe('0,1%');
    expect(percentual(0.15)).toBe('0,2%');
    expect(percentual(61.25)).toBe('61,3%');
    expect(percentual(61.24)).toBe('61,2%');
    expect(percentual(99.96)).toBe('100,0%');
  });

  it('aceita casas = 0 (seções apuradas: "87%")', () => {
    expect(percentual(87.3, 0)).toBe('87%');
    expect(percentual(87.5, 0)).toBe('88%');
    expect(percentual(100, 0)).toBe('100%');
  });

  it('negativo mantém o sinal de menos tipográfico', () => {
    expect(percentual(-2.5)).toBe('−2,5%');
  });
});

describe('pontos', () => {
  it('sempre com sinal explícito e uma casa', () => {
    expect(pontos(3.4)).toBe('+3,4 pontos');
    expect(pontos(-3.4)).toBe('−3,4 pontos');
    expect(pontos(12)).toBe('+12,0 pontos');
  });

  it('singular quando o valor arredondado, em módulo, é <= 1', () => {
    expect(pontos(0.1)).toBe('+0,1 ponto');
    expect(pontos(-0.9)).toBe('−0,9 ponto');
    expect(pontos(1)).toBe('+1,0 ponto');
    expect(pontos(1.04)).toBe('+1,0 ponto');
    expect(pontos(1.05)).toBe('+1,1 pontos');
    expect(pontos(1.1)).toBe('+1,1 pontos');
  });

  it('zero e valores que arredondam para zero ficam sem sinal, no singular', () => {
    expect(pontos(0)).toBe('0,0 ponto');
    expect(pontos(0.04)).toBe('0,0 ponto');
    expect(pontos(-0.04)).toBe('0,0 ponto');
    expect(pontos(-0)).toBe('0,0 ponto');
  });

  it('arredonda a metade para longe do zero (0,05 -> +0,1)', () => {
    expect(pontos(0.05)).toBe('+0,1 ponto');
    expect(pontos(-0.05)).toBe('−0,1 ponto');
  });
});

describe('votos', () => {
  it('singular só para exatamente 1', () => {
    expect(votos(1)).toBe('1 voto');
    expect(votos(0)).toBe('0 votos');
    expect(votos(2)).toBe('2 votos');
  });

  it('milhar com ponto', () => {
    expect(votos(312)).toBe('312 votos');
    expect(votos(1234)).toBe('1.234 votos');
    expect(votos(1_204_330)).toBe('1.204.330 votos');
  });
});

describe('hora', () => {
  it('converte para America/Sao_Paulo a partir de ISO com offset', () => {
    expect(hora('2026-10-25T18:42:10-03:00')).toBe('18:42');
  });

  it('converte de UTC', () => {
    expect(hora('2026-10-25T21:42:00Z')).toBe('18:42');
    expect(hora('2026-10-26T02:05:00Z')).toBe('23:05');
  });

  it('meia-noite é 00:00, nunca 24:00', () => {
    expect(hora('2026-10-26T03:00:00Z')).toBe('00:00');
  });

  it('aceita Date', () => {
    expect(hora(new Date('2026-10-25T20:07:00Z'))).toBe('17:07');
  });

  it('entrada ausente ou inválida devolve "--:--" sem lançar', () => {
    expect(hora(undefined)).toBe('--:--');
    expect(hora(null)).toBe('--:--');
    expect(hora('')).toBe('--:--');
    expect(hora('ontem')).toBe('--:--');
  });
});
