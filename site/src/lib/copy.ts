import type { Selo } from './contratos.ts';
import { diaMes, hora, horaCurta, percentual, pontos, votos } from './format.ts';
import type { Modo } from './status.ts';

/**
 * Vocabulário fixo do site (brief, seção 4). Nada de texto de matéria; nenhuma outra palavra de resultado.
 * Proibido em qualquer lugar da interface: "venceu", "virada confirmada", "projeção".
 */
export const PALAVRAS_PROIBIDAS = ['venceu', 'virada confirmada', 'projeção'] as const;

export const AGUARDANDO_SECOES = 'aguardando primeiras seções';

/** "lidera" em parcial; "eleito(a)" SOMENTE quando o JSON traz eleito: true (nunca inferir de percentual). */
export function rotuloPosicao(eleito: boolean, feminino = false): 'lidera' | 'eleito' | 'eleita' {
  if (!eleito) return 'lidera';
  return feminino ? 'eleita' : 'eleito';
}

/** Linha de apuração de todo card: "parcial · 87% das seções · Fonte: TSE · 18:42". Parcial nunca arredonda para 100% (apuracaoCard). */
export function linhaApuracao(
  fase: 'parcial' | 'final',
  secoesPct: number,
  atualizado: string | null | undefined,
): string {
  return `${apuracaoCard(fase, secoesPct)} · Fonte: TSE · ${hora(atualizado)}`;
}

/** Falha de rede: o front mantém o último dado e avisa. */
export function semConexao(atualizado: string | null | undefined): string {
  return `Sem conexão, mostrando a última atualização às ${hora(atualizado)}.`;
}

// Home e placar (design/DIRECTION.md, Home). PENDENTE de aprovação do Romero.

/**
 * Pílula de estado do cabeçalho. Ao vivo nunca arredonda para 100% (como apuracaoCard); sem seções apuradas conhecidas,
 * omite o percentual em vez de inventar um.
 */
export function pilula(modo: Modo, secoesPct?: number, atualizado?: string | null): string {
  if (modo === 'pre') return '1º turno apurado · 2º turno 25 out';
  const partes = [modo === 'live' ? 'ao vivo' : 'final'];
  if (secoesPct !== undefined) partes.push(percentual(modo === 'live' ? Math.min(99, secoesPct) : secoesPct, 0));
  return [...partes, hora(atualizado)].join(' · ');
}

/** Rótulo visível da contagem regressiva do painel (modo pre); os números vêm em placas que viram. */
export const CONTAGEM_ROTULO = 'Apuração do 2º turno em';

/** A mesma contagem por extenso, para leitor de tela. */
export function contagemFalada({ d, h, min }: { d: number; h: number; min: number }): string {
  const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
  return `${CONTAGEM_ROTULO} ${plural(d, 'dia', 'dias')}, ${plural(h, 'hora', 'horas')} e ${plural(min, 'minuto', 'minutos')}`;
}

/** Variação vs 2022 de quem ganhou terreno. A seta não entra no texto: vai desenhada no lado do candidato. */
export function variacao2022(nome: string, pts: number): string {
  return `${pontos(pts)} para ${nome} em relação a 2022`;
}

export const PRIMEIRO_TURNO_2026 = '1º turno 2026';
export const SEGUNDO_TURNO_2022 = '2º turno 2022';
export const OUTROS_CANDIDATOS = 'outros candidatos';
/** Linha de apuração do placar no modo pre (1º turno já apurado, sem hora de atualização). */
export const LINHA_PRIMEIRO_TURNO = '1º turno 2026 · 100% das seções · Fonte: TSE';

export const FONTE_TSE = 'Fonte: TSE';
export const AVISO_FICTICIO = 'Dados fictícios, só para desenvolvimento. Não são resultados.';

// Card 1200x675 (design/DIRECTION.md, Card). O card põe estes textos em caixa-alta. PENDENTE de aprovação do Romero.

export const TURNO_CARD = '2º turno 2026';
export const CARGO_GOVERNADOR = 'governador';
export const SELO_PALPITE = 'seu palpite';
export const RODAPE_PALPITE = 'palpite · não é resultado';
/** A liderança de hoje é diferente da de 2022. Comparação factual, não projeção. */
export const SELO_VIROU = 'virou vs 2022';

const SELOS_RANKING: Record<Selo, (uf: string) => string> = {
  mais_dividida_br: () => 'mais dividida do Brasil',
  mais_dividida_uf: (uf) => `mais dividida do ${uf}`,
  mais_unanime_br: () => 'mais unânime do Brasil',
  maior_virada_br: () => 'maior virada do Brasil',
  maior_virada_uf: (uf) => `maior virada do ${uf}`,
};

export const seloDoRanking = (selo: Selo, uf: string): string => SELOS_RANKING[selo](uf);

/** "parcial · 87% das seções". Parcial nunca arredonda para 100%: 99,6% apurado não é "100% das seções". */
export function apuracaoCard(fase: 'parcial' | 'final', secoesPct: number): string {
  const inteiro = fase === 'final' ? 100 : Math.min(99, Math.round(secoesPct));
  return `${fase} · ${inteiro}% das seções`;
}

/** Linha de destaque do card: texto menor, número grande, texto menor. */
export interface FraseCard {
  antes: string;
  numero: string;
  depois: string;
}

export function variacaoCard(nome: string, pts: number): FraseCard {
  const [numero, ...resto] = variacao2022(nome, pts).split(' ');
  return { antes: '', numero, depois: resto.join(' ') };
}

/** Margem menor que 1 ponto: o que importa é quantos votos separam os dois. */
export function diferencaVotosCard(n: number): FraseCard {
  const [numero, unidade] = votos(n).split(' ');
  return { antes: 'diferença de', numero, depois: unidade };
}

/** Sem 2022 para comparar (governador, cidade nova): a margem entre os dois. */
export function diferencaPontosCard(pts: number): FraseCard {
  const [numero, unidade] = pontos(Math.abs(pts)).replace('+', '').split(' ');
  return { antes: 'diferença de', numero, depois: unidade };
}

// Mapa, o muro de 28 placas (design/DIRECTION.md, Mapa). O componente põe em caixa-alta. PENDENTE de aprovação do Romero.

export const MAPA_TITULO = 'estado por estado';
export const MAPA_SETA = 'seta: o lado que ganhou pontos desde 2022';

/**
 * Nome acessível de uma placa: sempre 13 antes de 22, qualquer que seja o líder. "Maranhão: 13, 61,1%; 22, 38,9%; 13 lidera;
 * +3,4 pontos para 13 em relação a 2022; parcial · 87% das seções". `variacao` = pontos do 13 vs 2022 (o 22 é o espelho).
 */
export function rotuloPlacaMapa(
  nome: string,
  fase: 'pre' | 'parcial' | 'final',
  pct: { '13': number; '22': number; outros: number } | null,
  variacao: number | null,
  secoesPct: number | null,
): string {
  if (!pct) return `${nome}: ${AGUARDANDO_SECOES}`;
  if (fase === 'pre') {
    return `${nome}, ${PRIMEIRO_TURNO_2026}: 13, ${percentual(pct['13'])}; ${OUTROS_CANDIDATOS}, ${percentual(pct.outros)}; 22, ${percentual(pct['22'])}`;
  }
  const partes = [`${nome}: 13, ${percentual(pct['13'])}; 22, ${percentual(pct['22'])}`];
  if (fase === 'parcial' && pct['13'] !== pct['22']) partes.push(`${pct['13'] > pct['22'] ? 13 : 22} ${rotuloPosicao(false)}`);
  if (variacao !== null && Math.abs(variacao) >= 0.05) partes.push(variacao2022(variacao > 0 ? '13' : '22', Math.abs(variacao)));
  if (secoesPct !== null) partes.push(apuracaoCard(fase, secoesPct));
  return partes.join('; ');
}

// Página de cidade (BRIEF Fase 2; design/DIRECTION.md). PENDENTE de aprovação do Romero.

export const COMPARATIVO_TITULO = '2º turno 2022 × 1º turno 2026';
export const SEM_2022 = 'Não há dados do 2º turno de 2022 para esta cidade, por isso não há comparação.';
export const SEM_MUDANCA_2022 = 'Entre 13 e 22, praticamente igual a 2022.';

/** Por que a variação do comparativo só olha 13 e 22: o 1º turno de 2026 tem outros candidatos e o 2º turno de 2022 não. */
export function notaSoEntreDois(outrosPct: number): string {
  return `Variação só entre 13 e 22: o 1º turno de 2026 teve outros candidatos (${percentual(outrosPct)}) e o 2º turno de 2022, só dois.`;
}

/** Legenda do card em espera (modo pre): a promessa do que vem no dia da apuração. */
export function esperaDoCard(horaInicio: string, dia: string): string {
  return `${AGUARDANDO_SECOES[0].toLocaleUpperCase('pt-BR')}${AGUARDANDO_SECOES.slice(1)}. A apuração do 2º turno começa às ${horaInicio} de ${dia} e este card passa a mostrar a cidade ao vivo.`;
}

export interface DadosTexto {
  local: string;
  /** Qualquer ordem: o texto sai sempre com o menor número de urna primeiro. */
  cand: ReadonlyArray<{ n: number; nome: string; pct: number }>;
  /** Variação do candidato de menor número vs 2022, em pontos; ausente = sem comparação. */
  variacao?: number;
  modo: 'parcial' | 'final';
  secoesPct: number;
}

/**
 * Texto pré-preenchido do compartilhamento: "São Luís: Lula 61,1% × Flávio Bolsonaro 38,9%, +2,6 pts para Flávio Bolsonaro
 * vs 2022 · 87% apurado · dominio.com.br/c/sao-luis-ma?t=1842". Os números são os do card. Sem `link`, o texto termina na
 * apuração: no navigator.share o link vai à parte (`url`), senão o app de destino o repete.
 */
export function textoCompartilhar({ local, cand, variacao, modo, secoesPct }: DadosTexto, link?: string): string {
  const [esquerda, direita] = [...cand].sort((a, b) => a.n - b.n);
  const ganhou = variacao !== undefined && Math.abs(variacao) >= 0.05 ? (variacao > 0 ? esquerda : direita) : null;
  const placar = `${local}: ${esquerda.nome} ${percentual(esquerda.pct)} × ${direita.nome} ${percentual(direita.pct)}`;
  const mudanca = ganhou && `, ${pontos(Math.abs(variacao ?? 0)).replace(/ pontos?$/, ' pts')} para ${ganhou.nome} vs 2022`;
  const apurado = `${modo === 'final' ? 100 : Math.min(99, Math.round(secoesPct))}% apurado`;
  return [`${placar}${mudanca ?? ''}`, apurado, link].filter(Boolean).join(' · ');
}

/** <title> da página de cidade (brief, Fase 2). PENDENTE de aprovação do Romero. */
export const tituloCidade = (nome: string, uf: string): string => `Resultado do 2º turno 2026 em ${nome} (${uf}) — comparado com 2022`;

/** Meta description da cidade: sem número nem estado de apuração, que envelheceriam no HTML estático. PENDENTE de aprovação do Romero. */
export const descricaoCidade = (nome: string, uf: string): string =>
  `Como ${nome} (${uf}) votou no 1º turno de 2026 e quanto mudou desde 2022. Acompanhe o 2º turno e compartilhe o card da cidade.`;

// Página do estado e rankings (BRIEF Fase 2). PENDENTE de aprovação do Romero.

/** <title> do estado. Sem "em": a preposição muda por estado ("no Maranhão", "em Alagoas", "na Bahia"). */
export const tituloUf = (nome: string, uf: string): string => `${nome} (${uf}): resultado do 2º turno 2026, comparado com 2022`;

/** Meta description do estado: sem número nem estado de apuração, que envelheceriam no HTML estático. */
export const descricaoUf = (nome: string, uf: string): string =>
  `${nome} (${uf}): como o estado votou no 1º turno de 2026, quanto mudou desde 2022 e as cidades por número de eleitores. Acompanhe o 2º turno.`;

/** Governador antes da apuração: só o dia, sem número. */
export const GOVERNADOR_PRE = '2º turno para governador em 25/10';

export const tituloRankings = 'Rankings do 2º turno 2026: cidades e capitais';

export const descricaoRankings =
  'As cidades mais divididas, as mais unânimes e as maiores viradas do 2º turno de 2026, e as capitais, durante a apuração.';

export const ROTULO_RANKING = {
  dividida: 'mais dividida',
  unanime: 'mais unânime',
  virada: 'maior virada',
  capitais: 'capitais',
} as const;

/** Rankings antes da apuração. Sem início conhecido, não inventa hora. */
export function rankingsComecam(inicio: string | null | undefined): string {
  const horario = horaCurta(inicio);
  const dia = diaMes(inicio).split(' ')[0];
  return horario && dia ? `os rankings começam às ${horario} do dia ${dia}` : 'os rankings começam com a apuração do 2º turno';
}

// Pesquisas registradas no TSE (home, só no modo pre; design/DIRECTION.md, Pesquisas registradas). Base legal: Res. TSE 23.600,
// art. 10. Pesquisa não é resultado: aqui nunca entra "lidera", "eleito", média nem tendência. PENDENTE de aprovação do Romero.

export const PESQUISAS_TITULO = 'Pesquisas registradas no TSE';
export const PESQUISAS_APOIO = 'Cada pesquisa como o instituto divulgou. Não é resultado.';
/** Base dos percentuais, como o instituto divulgou. O componente põe em caixa-alta. */
export const TIPO_PESQUISA = { votos_totais: 'votos totais', votos_validos: 'votos válidos' } as const;
/** Nome de cada fatia da barra e do texto alternativo; 13 e 22 pelo número de urna. */
export const ROTULO_RESULTADO_PESQUISA = { '13': '13', brancos_nulos: 'brancos e nulos', indecisos: 'indecisos', '22': '22' } as const;
/** Antes do fim da coleta, no cabeçalho de cada pesquisa: "coleta até 4/out". */
export const PESQUISA_COLETA_ATE = 'coleta até';
export const PESQUISA_ANTES_1O_TURNO = 'antes do 1º turno';
export const PESQUISA_VER_DIVULGACAO = 'ver divulgação original';
/** Carimbo de cada linha de exemplo no playground (/design/pesquisas). Nunca aparece com dado real. */
export const PESQUISA_FICTICIA = 'exemplo fictício';

/** Frase do estado pre de /rankings: o h1 da página já diz "rankings", então ela não repete. Sem início conhecido, não inventa hora. PENDENTE de aprovação do Romero. */
export function listasAbrem(inicio: string | null | undefined): string {
  const horario = horaCurta(inicio);
  const dia = diaMes(inicio).split(' ')[0];
  return horario && dia ? `as listas abrem com a apuração, às ${horario} do dia ${dia}` : 'as listas abrem com a apuração do 2º turno';
}
