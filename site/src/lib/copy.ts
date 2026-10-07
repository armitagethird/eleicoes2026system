import type { Selo } from './contratos.ts';
import { diaMes, diaMesCurto, hora, horaCurta, percentual, pontos, votos } from './format.ts';
import { complemento } from './palpite.ts';
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
/** Crédito das fotos oficiais de candidatura (CC-BY), uma vez por bloco de placar. PENDENTE de aprovação do Romero. */
export const CREDITO_FOTO = 'Foto: TSE';
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
/** Legenda neutra da cor da sigla (sem nome de candidato): "lidera" só em parcial, nas outras fases quem teve mais votos. */
export const MAPA_SIGLA = {
  pre: 'sigla na cor de quem tem mais votos',
  parcial: 'sigla na cor de quem lidera',
  final: 'sigla na cor de quem tem mais votos',
} as const;

/**
 * Nome acessível de uma placa. Começa pelo texto visível, a sigla (WCAG 2.5.3), e traz sempre 13 antes de 22, qualquer que seja
 * o líder: "MA Maranhão: 13, 61,1%; 22, 38,9%; 13 lidera; +3,4 pontos para 13 em relação a 2022; parcial · 87% das seções".
 * `variacao` = pontos do 13 vs 2022 (o 22 é o espelho).
 */
export function rotuloPlacaMapa(
  sigla: string,
  nome: string,
  fase: 'pre' | 'parcial' | 'final',
  pct: { '13': number; '22': number; outros: number } | null,
  variacao: number | null,
  secoesPct: number | null,
): string {
  const local = `${sigla} ${nome}`;
  if (!pct) return `${local}: ${AGUARDANDO_SECOES}`;
  if (fase === 'pre') {
    return `${local}, ${PRIMEIRO_TURNO_2026}: 13, ${percentual(pct['13'])}; ${OUTROS_CANDIDATOS}, ${percentual(pct.outros)}; 22, ${percentual(pct['22'])}`;
  }
  const partes = [`${local}: 13, ${percentual(pct['13'])}; 22, ${percentual(pct['22'])}`];
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

/** Legenda do card em espera (modo pre): a promessa do que vem no dia da apuração. `quem`: "a cidade" (padrão) ou "o estado". */
export function esperaDoCard(horaInicio: string, dia: string, quem = 'a cidade'): string {
  return `${AGUARDANDO_SECOES[0].toLocaleUpperCase('pt-BR')}${AGUARDANDO_SECOES.slice(1)}. A apuração do 2º turno começa às ${horaInicio} de ${dia} e este card passa a mostrar ${quem} ao vivo.`;
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

// Página do estado e rótulos dos destaques de /apuracao, os antigos rankings (BRIEF Fase 2). PENDENTE de aprovação do Romero.

/** <title> do estado. Sem "em": a preposição muda por estado ("no Maranhão", "em Alagoas", "na Bahia"). */
export const tituloUf = (nome: string, uf: string): string => `${nome} (${uf}): resultado do 2º turno 2026, comparado com 2022`;

/** Meta description do estado: sem número nem estado de apuração, que envelheceriam no HTML estático. */
export const descricaoUf = (nome: string, uf: string): string =>
  `${nome} (${uf}): como o estado votou no 1º turno de 2026, quanto mudou desde 2022 e as cidades por número de eleitores. Acompanhe o 2º turno.`;

/** Governador antes da apuração: só o dia, sem número. */
export const GOVERNADOR_PRE = '2º turno para governador em 25/10';

export const ROTULO_RANKING = {
  dividida: 'mais dividida',
  unanime: 'mais unânime',
  virada: 'maior virada',
  capitais: 'capitais',
} as const;

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

// Apuração (/apuracao, decisão do Romero de 06/10: mapa municipal e comparação histórica). O componente põe rótulos em
// caixa-alta. PENDENTE de aprovação do Romero.

export const tituloApuracao = 'Apuração em tempo real do 2º turno 2026 — mapa por município';

export const descricaoApuracao =
  'O mapa da apuração do 2º turno de 2026, município por município, ao vivo no dia 25 e comparado com 2022. Antes disso, os mapas de 2022 e do 1º turno de 2026.';

/** "2º turno 2018"; o ao vivo é o 2º turno de 2026. */
export const turnoDaCamada = (id: string): string => (id === 'ao-vivo' ? '2º turno 2026' : `${id.slice(-1)}º turno ${id.slice(0, 4)}`);

/** Nome da aba: o ao vivo só se chama "ao vivo" durante a apuração. */
export const rotuloAba = (id: string, aoVivo: boolean): string => (id === 'ao-vivo' && aoVivo ? 'ao vivo 2026' : turnoDaCamada(id));

/** Os dois modos de cor do mapa. */
export const MODO_MAPA = { resultado: 'resultado', variacao: 'comparar' } as const;

/** A mesma frase de variacao2022, para qualquer ano de referência ("... em relação a 2018"). */
export function variacaoDesde(nome: string, pts: number, ano: string): string {
  return `${pontos(pts)} para ${nome} em relação a ${ano}`;
}

/** Legenda do mapa: o que a cor diz em cada modo. "lidera" só durante a apuração. */
export function legendaMapa(modo: 'resultado' | 'variacao', parcial: boolean, referencia: string): string {
  if (modo === 'variacao') return `cor do lado que ganhou pontos desde o ${referencia}; mais forte, mais pontos`;
  return `${parcial ? 'cor de quem lidera' : 'cor de quem teve mais votos'}; mais forte, maior a margem`;
}

export const SEM_DADO = 'sem dado';
/** 1º turno: município em que um terceiro candidato teve mais votos (pintado em neutro). */
export const OUTRO_MAIS_VOTADO = 'outro candidato mais votado';
export const maisVotado = (n: number): string => `mais votado: ${n}`;
/** Linha de apuração de uma camada já apurada (sem hora: não é atualização de hoje). */
export const LINHA_APURADA = 'final · 100% das seções · Fonte: TSE';

export const semVirada = (referencia: string): string => `Nenhum município mudou de lado desde o ${referencia}.`;
export const VER_TABELA = 'ver em tabela';
export const BUSCAR_MUNICIPIO = 'buscar município';
export const verCidade = (nome: string): string => `ver o card de ${nome}`;
/** O mesmo botão no detalhe de um estado em /apuracao: leva a /uf/{uf}. PENDENTE de aprovação do Romero. */
export const verEstado = (nome: string): string => `ver o card de ${nome}`;
export const ERRO_CAMADA = 'Não deu para carregar este mapa.';
export const TENTAR_DE_NOVO = 'tentar de novo';
export const rotuloMapa = (turno: string): string => `Mapa por município, ${turno}. A mesma informação está na tabela abaixo do mapa.`;

/** /apuracao no modo pre: quando o mapa passa a ser ao vivo. Sem início conhecido, não inventa hora. PENDENTE de aprovação do Romero. */
export function aoVivoAPartir(inicio: string | null | undefined): string {
  const horario = horaCurta(inicio);
  const dia = diaMes(inicio).split(' ')[0];
  return horario && dia ? `ao vivo a partir das ${horario} do dia ${dia}` : 'ao vivo durante a apuração do 2º turno';
}

/** Régua da legenda do mapa: a unidade dos números embaixo dos degraus (lib/cores-mapa.ts: no resultado, a diferença entre os dois; no comparar, os pontos que o lado ganhou entre os dois, como o placar). PENDENTE de aprovação do Romero. */
export const UNIDADE_LEGENDA = { resultado: 'pontos de diferença entre os dois', variacao: 'pontos ganhos entre os dois' } as const;

// Motor do mapa de /apuracao (components/apuracao/motor.ts): o que o leitor de tela ouve no canvas. Sem número nem
// resultado: isso fica no painel e na tabela da página. PENDENTE de aprovação do Romero.

export const BRASIL = 'Brasil';
export const MAPA_TECLAS = 'Setas escolhem um estado e, dentro dele, um município. Enter abre, Esc volta ao Brasil, + e − aproximam e afastam.';
/** Nome acessível do canvas: o rótulo do mapa da página e o lugar em foco. */
export const rotuloMotor = (turno: string | null, local: string): string =>
  turno ? `${rotuloMapa(turno)} Mostrando: ${local}.` : `Mostrando: ${local}.`;

/** Botão do detalhe do município em /apuracao: o nome da cidade já está no título logo acima (o nome completo vai no aria-label, verCidade). PENDENTE de aprovação do Romero. */
export const VER_CARD = 'ver o card';

// Histórico (/historico, decisão do Romero de 06/10: gráfico de linha comparando 2018, 2022 e 2026). O gráfico e a página
// põem os rótulos em caixa-alta. Nenhum texto de resultado: só o que o eixo e a tabela medem. PENDENTE de aprovação do Romero.

export const tituloHistorico = 'Histórico das eleições presidenciais: 2018, 2022 e 2026 lado a lado';
export const descricaoHistorico =
  'Os votos válidos de cada candidato à presidência nos dois turnos de 2018, 2022 e 2026, no Brasil, em cada estado e em cada cidade.';
export const HISTORICO_TITULO = 'Histórico';
/** Subtítulo do gráfico: o que o eixo Y mede. */
export const HISTORICO_EIXO = '% dos votos válidos para presidente, 1º e 2º turnos';
export const HISTORICO_NOTA_BASE = 'No 1º turno há outros candidatos; no 2º turno, só dois.';
/** Em 2018 o candidato de Bolsonaro era o 17 (PSL) e o gráfico o pinta de azul claro: a cor segue o lado, não o número. */
export const HISTORICO_NOTA_2018 = 'Em 2018 o candidato de Bolsonaro era o 17, do PSL. A cor acompanha o lado, não o número.';

export const FILTRO_ROTULO = 'Ver por';
export const FILTRO_ESTADO = 'Estado';
export const FILTRO_ESTADO_VAZIO = 'Estado';
export const FILTRO_CIDADE = 'Cidade';
export const FILTRO_CIDADE_DICA = 'Nome da cidade';
export const FILTRO_CARREGANDO = 'Carregando as cidades…';
export const FILTRO_CIDADE_VAZIA = 'Nenhuma cidade com esse nome';
export const filtroQuantas = (n: number): string => `${n} ${n === 1 ? 'cidade' : 'cidades'}. Use as setas para escolher.`;
export const ERRO_HISTORICO = 'Não deu para carregar o histórico.';
/** Anúncio de leitor de tela quando o gráfico muda de lugar. */
export const historicoDe = (lugar: string): string => `Histórico: ${lugar}`;

export const GRAFICO_OUTROS = 'outros';
export const GRAFICO_AO_VIVO = 'ao vivo';
/** Ponto vazio do 2º turno de 2026 antes da apuração: o dia em que ele chega. Sem início conhecido, não inventa data. */
export const rotuloPontoVazio = (inicio: string | null | undefined): string => diaMesCurto(inicio) || 'em breve';
/** Cabeçalho da tabela alternativa ao gráfico. */
export const TABELA_HISTORICO = { eleicao: 'eleição', a: 'PT', b: 'Bolsonaro', outros: 'outros' } as const;

// Seleção de eleições do histórico (decisão do Romero, 06/10: o gráfico abre com todas e a pessoa escolhe qualquer combinação).
// O seletor põe os rótulos em caixa-alta. PENDENTE de aprovação do Romero.

/** "2018", "2018 e 2026", "2018, 2022 e 2026". */
export const listaDeAnos = (anos: readonly number[]): string => new Intl.ListFormat('pt-BR').format(anos.map(String));
/** <title> do SVG e legenda da tabela com as eleições que estão à vista; a <desc> traz os números de cada uma. */
export const tituloGraficoAnos = (lugar: string, anos: readonly number[]): string => `Votos válidos para presidente, ${lugar}: ${listaDeAnos(anos)}`;
export const ELEICOES_ROTULO = 'Eleições';
export const ELEICOES_TODAS = 'Todas';
/** Ao lado do rótulo do seletor: o que ele faz; e, com uma só eleição ligada, por que o botão dela não desliga. */
export const ELEICOES_DICA = 'Ligue para comparar';
export const ELEICOES_TRAVADA = 'Uma fica sempre ligada';
/** Anúncio de leitor de tela quando a seleção muda. */
export const eleicoesMostradas = (anos: readonly number[]): string => `Mostrando ${listaDeAnos(anos)}.`;

// Palpite (BRIEF, seção 4 e Fase 3; components/Palpite.astro). É local: fica no aparelho, nunca é enviado nem somado (enquete é
// proibida no período eleitoral), e a interface diz isso. O componente põe os rótulos em caixa-alta. PENDENTE de aprovação do Romero.

export const PALPITE_TITULO = 'Seu palpite';
export const PALPITE_LOCAL = 'Seu palpite fica só neste aparelho.';
export const PALPITE_NAO_E_ENQUETE = 'Não é enquete: nada é enviado nem somado.';
export const palpitePergunta = (local: string, uf: string): string => `Quanto o 13 terá dos votos válidos em ${local} (${uf})?`;
export const PALPITE_CONFIRMAR = 'Confirmar palpite';
export const PALPITE_VER_CARD = 'Ver o card do palpite';
export const PALPITE_COMPARTILHAR = 'Compartilhar palpite';
export const PALPITE_SALVO = 'Palpite salvo neste aparelho.';
export const PALPITE_NAO_SALVO = 'Não deu para salvar neste aparelho. O card sai igual.';
/** Em final: rótulo da barra com a apuração, ao lado da barra do palpite (SELO_PALPITE). */
export const PALPITE_RESULTADO = 'resultado final';
export const PALPITE_SEM_RESULTADO = 'Não deu para carregar o resultado final. Seu palpite continua salvo neste aparelho.';

/** Valor do slider para leitor de tela: os dois candidatos, 13 primeiro. */
export const palpiteFalado = (nome13: string, nome22: string, pct13: number): string =>
  `13 ${nome13}, ${percentual(pct13)}; 22 ${nome22}, ${percentual(complemento(pct13))}`;

/**
 * O erro do palpite em partes (texto, número, texto), para o card dar ao número o tamanho de destaque. Erro que arredonda para
 * 0,0 não é "errou por 0,0 ponto": acertou, sem número. A frase muda de pessoa, não de conta.
 */
function partesDoErro(pts: number, [acertou, errou]: readonly [string, string]): FraseCard {
  if (Math.round(pts * 10) === 0) return { antes: acertou, numero: '', depois: '' };
  const [numero, unidade] = pontos(pts).replace('+', '').split(' ');
  return { antes: errou, numero, depois: unidade };
}

const emFrase = ({ antes, numero, depois }: FraseCard): string => [antes, numero, depois].filter(Boolean).join(' ');

/** Zona C do card do palpite em final: "você errou por [1,6] pontos". */
export const erroPalpiteCard = (pts: number): FraseCard => partesDoErro(pts, ['você acertou o resultado', 'você errou por']);

/** Em final, para quem fez o palpite: "você errou por 1,6 pontos". */
export const erroDoPalpite = (pts: number): string => emFrase(erroPalpiteCard(pts));

/**
 * Texto do compartilhamento do palpite, em primeira pessoa: "Meu palpite para São Luís: Lula 60,0% × Flávio Bolsonaro 40,0% ·
 * não é resultado". Em final troca o fecho pelo erro. Sem `link`, termina aí (no navigator.share o link vai à parte, em `url`).
 */
export function textoPalpite(
  { local, cand, erro }: { local: string; cand: ReadonlyArray<{ n: number; nome: string; pct: number }>; erro?: number },
  link?: string,
): string {
  const [esquerda, direita] = [...cand].sort((a, b) => a.n - b.n);
  const fecho = erro === undefined ? 'não é resultado' : emFrase(partesDoErro(erro, ['acertei o resultado', 'errei por']));
  const placar = `Meu palpite para ${local}: ${esquerda.nome} ${percentual(esquerda.pct)} × ${direita.nome} ${percentual(direita.pct)}`;
  return [placar, fecho, link].filter(Boolean).join(' · ');
}

// Minhas cidades (BRIEF Fase 3; components/MinhasCidades.astro). Fica só neste aparelho. O componente põe os rótulos em
// caixa-alta. PENDENTE de aprovação do Romero.

export const MINHAS_CIDADES_TITULO = 'Minhas cidades';
export const MINHAS_CIDADES_ADICIONAR = 'Adicionar às minhas cidades';
export const MINHAS_CIDADES_REMOVER = 'Remover das minhas cidades';
export const MINHAS_CIDADES_GUARDADA = 'Guardada neste aparelho. Ela aparece na página inicial.';
/** Passou de 5: a ilha completa a frase com o nome da cidade que saiu. */
export const MINHAS_CIDADES_GUARDADA_TROCA = 'Guardada. O limite é 5 cidades, então saiu a mais antiga:';
export const MINHAS_CIDADES_REMOVIDA = 'Removida das suas cidades.';
export const MINHAS_CIDADES_SEM_ARMAZENAMENTO = 'Não deu para guardar neste navegador.';

// Me avisa (BRIEF, seção 4; components/MeAvisa.astro). Coleta e-mail, que é dado pessoal (LGPD): a promessa é de dois envios,
// o consentimento é explícito e a finalidade e a saída estão sempre à vista. Atrás de flag (lib/flags.ts).
// PENDENTE de aprovação do Romero: é texto de consentimento, com compromisso jurídico (apagar o e-mail depois do 2º envio).

export const ME_AVISA_TITULO = 'Me avisa';
/** Os dois envios prometidos. Sem início conhecido, não inventa hora. */
export function meAvisaPromessa(inicio: string | null | undefined): string {
  const horario = horaCurta(inicio);
  const dia = diaMes(inicio).split(' ')[0];
  const primeiro = horario && dia ? `um às ${horario} do dia ${dia}` : 'um quando a apuração começar';
  return `Dois e-mails, e só dois: ${primeiro}, com o link da sua cidade, e outro com o resultado final.`;
}
export const ME_AVISA_CAMPO = 'Seu e-mail';
export const ME_AVISA_EXEMPLO = 'nome@exemplo.com';
/** Texto da caixa de consentimento: nunca pré-marcada, e dita a cidade, quem usa o e-mail e a finalidade restrita. */
export const meAvisaConsentimento = (site: string, cidade: string): string =>
  `Concordo em receber esses dois e-mails sobre ${cidade}. O ${site} usa o meu e-mail só para isso, não repassa a ninguém e o apaga depois do resultado final.`;
export const ME_AVISA_FINALIDADE =
  'Finalidade: avisar sobre o 2º turno de 2026, e mais nada. Para sair, use o link de cancelar que vai nos dois e-mails.';
export const ME_AVISA_ENVIAR = 'Me avisa';
export const ME_AVISA_ENVIANDO = 'Enviando…';
export const ME_AVISA_ERRO = {
  vazio: 'Digite o seu e-mail.',
  invalido: 'Esse e-mail não parece certo. Confira e tente de novo.',
  consentimento: 'Marque a caixa para concordar. Sem isso não dá para enviar.',
} as const;
export const ME_AVISA_FALHA = 'Não deu para enviar agora. Tente de novo em instantes.';
/** A ilha completa a frase com o e-mail digitado (que fica só na tela, nunca no aparelho). */
export const ME_AVISA_OK = 'Pedido recebido. Os dois e-mails vão para';
export const ME_AVISA_JA_PEDIU = 'Você já pediu o aviso desta cidade neste aparelho.';
export const ME_AVISA_OUTRO = 'Usar outro e-mail';
