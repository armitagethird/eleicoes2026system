// Modelo do mapa (design/DIRECTION.md, Mapa): 28 placas em qualquer fase, e o texto de cada uma.
// pre: 1º turno 2026 do hist (13 · outros · 22), sem seta. parcial/final: 2º turno do placar de cada lugar, com a variação
// vs 2022. Puro e tolerante a campos ausentes: serve o build (Mapa.astro) e, na Fase 3, a ilha ao vivo.
import { LUGARES, type Lugar } from './cartograma.ts';
import { NOME_UF, type Hist } from './contratos.ts';
import { AGUARDANDO_SECOES, PRIMEIRO_TURNO_2026, apuracaoCard, rotuloPlacaMapa, variacao2022 } from './copy.ts';
import { percentual } from './format.ts';

export type Fase = 'pre' | 'parcial' | 'final';

/** O que o mapa lê de um placar: serve o /data/uf/{uf}.json inteiro e a placa de /data/mapa.json (proposta). */
export interface PlacarMapa {
  secoes_pct?: number;
  presidente?: { cand?: Array<{ n: number; pct: number }>; variacao_2022?: Record<string, number> };
}

export interface Placa {
  lugar: Lugar;
  nome: string;
  href: string;
  /** Percentuais na ordem da barra. outros = 0 no 2º turno. null = sem dado (aguardando primeiras seções). */
  pct: { '13': number; outros: number; '22': number } | null;
  /** Pontos do 13 vs 2022 (o 22 é o espelho). null = sem 2022 ou 1º turno. */
  variacao: number | null;
  secoes: number | null;
}

export interface Mapa {
  fase: Fase;
  atualizado: string | null;
  /** secoes_pct do Brasil, para o título. */
  secoes: number | null;
  /** Na ordem de leitura do cartograma (LUGARES). */
  placas: Placa[];
}

export interface VistaPlaca {
  /** aria-label do link. */
  rotulo: string;
  /** Linha de apuração do painel. */
  meta: string;
  /** Percentuais formatados de 13, outros e 22 ('' sem dado). */
  a: string;
  o: string;
  b: string;
  /** Quem ganhou terreno vs 2022 ('' sem variação). A seta aponta para o lado dele (◀ 13, ▶ 22) e veste a cor dele. */
  ganhou: '13' | '22' | '';
  /** A placa só desenha a seta com |variação| >= 0,5 ponto. */
  seta: boolean;
  /** "+3,4": o número que acompanha a seta nas placas largas. */
  setaNumero: string;
  /** Frase do painel: "+3,4 pontos para 13 em relação a 2022" ('' sem variação). */
  variacao: string;
  /** Quem tem mais votos ali, para a cor da sigla ('' = sigla neutra: sem dado, empate ou "outros" na frente). A placa nunca é pintada. */
  maisVotado: '13' | '22' | '';
  /** Proporções da barra em custom properties. */
  estilo: string;
}

const numero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nome = (l: Lugar): string => (l === 'BR' ? 'Brasil' : NOME_UF[l]);
// /uf/{uf} é a página do estado; o Brasil não tem página própria e leva à home, onde está o placar BR.
const href = (l: Lugar): string => (l === 'BR' ? '/' : `/uf/${l.toLowerCase()}`);
const base = (l: Lugar) => ({ lugar: l, nome: nome(l), href: href(l) });

export function mapaPre(hist: (l: Lugar) => Hist | undefined): Mapa {
  const placas = LUGARES.map((l): Placa => {
    const t1 = hist(l)?.t1_2026.pct;
    return { ...base(l), pct: t1 ? { '13': t1['13'], outros: t1.outros, '22': t1['22'] } : null, variacao: null, secoes: null };
  });
  return { fase: 'pre', atualizado: null, secoes: null, placas };
}

function placaApuracao(l: Lugar, placar: PlacarMapa | undefined): Placa {
  const secoes = numero(placar?.secoes_pct) ? placar.secoes_pct : null;
  const pctDe = (n: number) => placar?.presidente?.cand?.find((c) => c.n === n)?.pct;
  const [p13, p22] = [pctDe(13), pctDe(22)];
  const semDado = !numero(p13) || !numero(p22) || p13 + p22 <= 0 || (secoes !== null && secoes < 1);
  const v = placar?.presidente?.variacao_2022 ?? {};
  const variacao = semDado ? null : numero(v['13']) ? v['13'] : numero(v['22']) ? -v['22'] : null;
  return { ...base(l), pct: semDado ? null : { '13': p13, outros: 0, '22': p22 }, variacao, secoes };
}

export function mapaApuracao(
  fase: 'parcial' | 'final',
  placares: Partial<Record<Lugar, PlacarMapa>>,
  atualizado: string | null = null,
): Mapa {
  const placas = LUGARES.map((l) => placaApuracao(l, placares[l]));
  return { fase, atualizado, secoes: placas.find((p) => p.lugar === 'BR')?.secoes ?? null, placas };
}

// Arredonda como o texto mostra: a seta e o número nunca discordam ("+0,5" sempre vem com seta).
const umaCasa = (x: number): number => Math.round(Math.abs(x) * 10) / 10;

// Por número de urna, nunca por posição. No 1º turno "outros" soma os demais candidatos: se ele passa os dois, ninguém tem a cor.
function quemTemMaisVotos(pct: Placa['pct']): '13' | '22' | '' {
  if (!pct) return '';
  if (pct['13'] > pct['22'] && pct['13'] > pct.outros) return '13';
  if (pct['22'] > pct['13'] && pct['22'] > pct.outros) return '22';
  return '';
}

export function vista(placa: Placa, fase: Fase): VistaPlaca {
  const { pct, variacao, secoes } = placa;
  const rotulo = rotuloPlacaMapa(placa.lugar, placa.nome, fase, pct, variacao, secoes);
  const meta = !pct ? AGUARDANDO_SECOES : fase === 'pre' ? PRIMEIRO_TURNO_2026 : secoes === null ? fase : apuracaoCard(fase, secoes);
  const ganhou = variacao === null || umaCasa(variacao) === 0 ? '' : variacao > 0 ? '13' : '22';
  const texto = ganhou ? variacao2022(ganhou, Math.abs(variacao as number)) : '';
  const seta = ganhou !== '' && umaCasa(variacao as number) >= 0.5;
  return {
    rotulo,
    meta,
    a: pct ? percentual(pct['13']) : '',
    o: pct && fase === 'pre' ? percentual(pct.outros) : '',
    b: pct ? percentual(pct['22']) : '',
    ganhou,
    seta,
    setaNumero: seta ? texto.split(' ')[0] : '',
    variacao: texto,
    maisVotado: quemTemMaisVotos(pct),
    estilo: pct ? `--a:${pct['13']};--o:${pct.outros};--b:${pct['22']}` : '--a:0;--o:0;--b:0',
  };
}
