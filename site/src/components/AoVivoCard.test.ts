import { describe, expect, it } from 'vitest';
import { montarCard } from './AoVivoCard.ts';
import type { CardData } from './Card.ts';

const casca: { card: CardData; slug?: string; uf?: 'MA' } = {
  slug: 'sao-luis-ma',
  card: {
    modo: 'parcial',
    local: 'São Luís',
    uf: 'MA',
    cargo: 'presidente',
    cand: [
      { n: 13, nome: 'Lula', partido: 'PT', pct: 0 },
      { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', pct: 0 },
    ],
    secoesPct: 0,
    hora: '17:00',
    dominio: 'dominio.com.br',
    handle: '@conta',
    bandeiraHref: '/_astro/ma-160.png',
  },
};

const cand = (pct13: number) => [
  { n: 13, nome: 'Lula', partido: 'PT', votos: 6, pct: pct13, eleito: false },
  { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', votos: 4, pct: 100 - pct13, eleito: false },
];

const cidade = {
  nome: 'São Luís',
  uf: 'MA' as const,
  atualizado: '2026-10-25T18:42:10-03:00',
  secoes_pct: 87.3,
  presidente: { cand: cand(60.2), variacao_2022: { '13': -0.18, '22': 0.18 }, diferenca_votos: 2 },
  selos: [],
  virou: false,
};

describe('montarCard', () => {
  it('a cidade vira o card da cidade, com a bandeira que o JSON ao vivo não traz', () => {
    const card = montarCard(cidade, casca, 'parcial');
    expect(card).toMatchObject({ local: 'São Luís', uf: 'MA', modo: 'parcial', secoesPct: 87.3, hora: '18:42', bandeiraHref: '/_astro/ma-160.png' });
    expect(card?.cand.map((c) => c.n)).toEqual([13, 22]);
  });

  it('em final o card sai em modo final', () => {
    expect(montarCard({ ...cidade, secoes_pct: 100 }, casca, 'final')?.modo).toBe('final');
  });

  it('o estado (casca com uf, sem slug) vira o card do placar, com o nome do estado', () => {
    const estado = { atualizado: cidade.atualizado, secoes_pct: 60, presidente: { cand: cand(55), variacao_2022: {}, brancos: 0, nulos: 0 }, governador: null };
    const card = montarCard(estado, { card: { ...casca.card, local: 'Maranhão' }, uf: 'MA' }, 'parcial');
    expect(card).toMatchObject({ local: 'Maranhão', uf: 'MA', secoesPct: 60, bandeiraHref: '/_astro/ma-160.png' });
  });

  it('sem os dois candidatos ainda não há card (a casca continua oculta)', () => {
    expect(montarCard({ nome: 'São Luís', uf: 'MA' }, casca, 'parcial')).toBeNull();
    expect(montarCard({ ...cidade, presidente: { cand: cand(50).slice(0, 1), variacao_2022: {}, diferenca_votos: 0 } }, casca, 'parcial')).toBeNull();
  });
});
