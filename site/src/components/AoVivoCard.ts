// O card da cidade e do estado na ilha ao vivo (AoVivo.ts). Módulo à parte, carregado só onde há card: a home não tem, e
// renderCard (Card, destino, vocabulário) pesa uns 7 KB gzip que ela não precisa baixar.
import { cardDeCidade, cardDePlacar } from '../lib/card-dados.ts';
import type { Cidade, Placar, UF } from '../lib/contratos.ts';
import { renderCard, type CardData } from './Card.ts';

export { renderCard };

/**
 * O CardData do JSON ao vivo da cidade (slug) ou do estado (uf), mais o que o JSON não repete: a bandeira, do card em espera
 * que a casca traz. null enquanto o JSON não tem os dois candidatos.
 */
export function montarCard(
  dados: Partial<Placar> | Partial<Cidade>,
  casca: { card: CardData; uf?: UF },
  fase: 'parcial' | 'final',
): CardData | null {
  const card = casca.uf
    ? cardDePlacar(dados as Placar, { nome: casca.card.local, uf: casca.uf }, fase)
    : cardDeCidade(dados as Cidade, undefined, fase);
  return card && { ...card, bandeiraHref: casca.card.bandeiraHref };
}
