// Página de cidade (c/[slug].astro): variação do comparativo, card em espera e o que o botão Compartilhar envia.
// Domínio e @ vêm de lib/site.ts, nunca de componente ou template.
import type { CandidatoCard, CardData } from '../components/Card.ts';
import type { Candidato, Hist, UF } from './contratos.ts';
import { textoCompartilhar } from './copy.ts';
import { hora } from './format.ts';
import { SITE_URL, X_HANDLE } from './site.ts';

const DOMINIO = new URL(SITE_URL).host;

/**
 * Variação do 13 (em pontos) entre o 2º turno de 2022 e o 1º turno de 2026, só entre 13 e 22: o 1º turno teve outros
 * candidatos, então a fatia do 13 é refeita sobre os votos dos dois. null sem 2022 ou sem votos para os dois.
 */
export function variacaoEntreDois(hist: Hist | null | undefined): number | null {
  const de2022 = hist?.t2_2022?.pct['13'];
  const t1 = hist?.t1_2026.pct;
  if (de2022 === undefined || !t1) return null;
  const soma = t1['13'] + t1['22'];
  return soma > 0 ? (t1['13'] / soma) * 100 - de2022 : null;
}

/** O card do 2º turno antes da apuração: sem seção nenhuma, com a hora de início no lugar da hora de atualização. */
export function cardEmEspera(
  lugar: { nome: string; uf: UF },
  cand: ReadonlyArray<Pick<Candidato, 'n' | 'nome' | 'partido'>>,
  inicio: string | null,
): CardData {
  const [a, b] = [...cand].sort((x, y) => x.n - y.n).map(({ n, nome, partido }): CandidatoCard => ({ n, nome, partido, pct: 0 }));
  return { modo: 'parcial', local: lugar.nome, uf: lugar.uf, cargo: 'presidente', cand: [a, b], secoesPct: 0, hora: hora(inicio), dominio: DOMINIO, handle: X_HANDLE };
}

/** "18:42" vira "1842" para o ?t= do link; hora desconhecida não vira parâmetro. */
export const parametroHora = (horaCard: string): string => (/^\d{2}:\d{2}$/.test(horaCard) ? horaCard.replace(':', '') : '');

interface Link {
  completo: string;
  curto: string;
}

/** Link da página com a hora do card em ?t= (o preview no X reflete aquele momento); a canônica da página continua limpa. */
function linkComHora(caminho: string, horaCard: string): Link {
  const t = parametroHora(horaCard);
  const comHora = `${caminho}${t && `?t=${t}`}`;
  return { completo: new URL(comHora, SITE_URL).href, curto: `${DOMINIO}${comHora}` };
}

export const linkCidade = (slug: string, horaCard: string): Link => linkComHora(`/c/${slug}`, horaCard);

export const linkUf = (uf: string, horaCard: string): Link => linkComHora(`/uf/${uf.toLowerCase()}`, horaCard);

/** Tudo que o Compartilhar envia. O texto do share não leva o link (vai em `url`); o do fallback, que só copia, leva. */
function envio(card: CardData, { completo, curto }: Link): { texto: string; textoComLink: string; url: string } {
  const texto = textoCompartilhar({
    local: card.local,
    cand: card.cand,
    variacao: card.variacao,
    modo: card.modo === 'final' ? 'final' : 'parcial',
    secoesPct: card.secoesPct,
  });
  return { texto, textoComLink: `${texto} · ${curto}`, url: completo };
}

export const compartilhamento = (card: CardData, slug: string) => envio(card, linkCidade(slug, card.hora));

export const compartilhamentoUf = (card: CardData, uf: string) => envio(card, linkUf(uf, card.hora));
