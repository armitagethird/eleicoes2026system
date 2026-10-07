// A parte do Palpite que só carrega ao confirmar: o card em modo palpite (Card.ts, destino, fonte) e o compartilhar, que é o fluxo
// de compartilhar-png.ts (o mesmo do card da cidade).
import { comPalpite } from '../lib/card-dados.ts';
import { linkCidade } from '../lib/cidade.ts';
import { textoPalpite } from '../lib/copy.ts';
import { renderCard, type CardData } from './Card.ts';
import { arquivoDoCard, compartilharPng } from './compartilhar-png.ts';

export interface Palpite {
  card: CardData;
  slug: string;
  /** Palpite do 13, de 0 a 100. */
  pct13: number;
  /** Só em final: quantos pontos o palpite errou. */
  erro?: number;
}

/** O card em modo palpite. Com `erro` (só em final), a zona C diz "você errou por X pontos" em vez da diferença entre os dois. */
export function desenharCard(figura: HTMLElement, { card, pct13, erro }: Pick<Palpite, 'card' | 'pct13' | 'erro'>): void {
  figura.innerHTML = renderCard({ ...comPalpite(card, pct13), erroPalpite: erro });
}

/** Compartilha o card do palpite. Quem chama passa o botão (aria-disabled durante o preparo, para o foco ficar nele) e o elemento de estado. */
export async function compartilhar({ card, slug, pct13, erro }: Palpite, botao: HTMLElement, estado: HTMLElement): Promise<void> {
  await compartilharPng(botao, estado, async () => {
    const doPalpite = { ...comPalpite(card, pct13), erroPalpite: erro };
    const arquivo = await arquivoDoCard(doPalpite, `${slug}-palpite-2026.png`, `${slug}:${pct13}:${erro ?? ''}`);
    const frase = { local: card.local, cand: doPalpite.cand, erro };
    const { completo, curto } = linkCidade(slug, '');
    return { arquivo, texto: textoPalpite(frase), textoComLink: textoPalpite(frase, curto), url: completo };
  });
}
