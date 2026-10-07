// O card: SVG 1200x675 autossuficiente e puro (renderCard(dados): string). Fonte de verdade do produto: o mesmo SVG vai inline na
// página, vira PNG no navegador (Compartilhar) e, depois, é renderizado no servidor para a OG. Zonas e regras: design/DIRECTION.md.
// Escala própria do card: todo texto >= 28 px, percentuais > 100 px, margens de 48 px, nada crítico fora de y 44..631 (recorte 2:1 do X).
import {
  AGUARDANDO_SECOES,
  CARGO_GOVERNADOR,
  FONTE_TSE,
  RODAPE_PALPITE,
  SELO_PALPITE,
  TURNO_CARD,
  apuracaoCard,
  diferencaPontosCard,
  diferencaVotosCard,
  rotuloPosicao,
  variacaoCard,
  type FraseCard,
} from '../lib/copy.ts';
import { corCandidato } from '../lib/cores.ts';
import { ALTURAS, ajustarDestino, larguraTexto } from '../lib/destino.ts';
import { percentual } from '../lib/format.ts';

export type ModoCard = 'parcial' | 'final' | 'palpite';
export type Acento = 'ouro' | 'verde' | 'violeta';

export interface CandidatoCard {
  /** Número de urna: define a ordem das colunas (menor à esquerda, 13 antes de 22), nunca quem lidera. */
  n: number;
  nome: string;
  partido: string;
  pct: number;
  /** Só true quando o JSON marcar eleito: true. Nunca inferido de percentual. */
  eleito?: boolean;
  feminino?: boolean;
}

export interface CardData {
  modo: ModoCard;
  /** Nome do lugar como se escreve (o card põe em caixa-alta): cidade, estado ou "Brasil". */
  local: string;
  /** Sigla da UF, ou "BR" para o país. */
  uf: string;
  cargo: 'presidente' | 'governador';
  cand: [CandidatoCard, CandidatoCard];
  /** Variação, em pontos percentuais vs 2022, do candidato de menor número (o outro tem o oposto). Ausente = sem comparação. */
  variacao?: number;
  /** Votos entre os dois; usado quando a margem é menor que 1 ponto. */
  diferencaVotos?: number;
  /** Menor que 1 = aguardando primeiras seções. Ignorado no palpite. */
  secoesPct: number;
  /** HH:MM da última atualização. Ignorado no palpite. */
  hora: string;
  selo?: string;
  dominio: string;
  handle: string;
  /** Data URI ou URL da bandeira intacta. Para o PNG tem de ser data URI (um SVG usado como imagem não carrega recursos externos). */
  bandeiraHref?: string;
  /** Subset da fonte (data URI). Presente só ao exportar PNG; inline na página o SVG usa a fonte já carregada. */
  fonteDataUri?: string;
  /** Só para o playground de aprovação (/design). Troca a cor do selo e de mais nada; padrão: ouro. */
  acento?: Acento;
}

// Cores alinhadas a styles/tokens.css (Card.test.ts confere). O SVG não pode depender de custom properties: vira PNG isolado.
// As dos candidatos vêm de lib/cores.ts: a cor é do número de urna, nunca da posição nem de quem lidera.
const COR = { bg: '#0e1411', ink: '#f4f1e6', ink2: '#95a097' } as const;
const ACENTOS: Record<Acento, string> = { ouro: '#f5c518', verde: '#2bb673', violeta: '#b57bff' };

// A faixa da marca é a de base.css (verde 0-62%, amarelo 62-100%, cortes retos). Fora dela e do selo, nada no card é verde nem amarelo.
const FAIXA = { altura: 8, corte: 744, verde: '#2bb673', amarelo: '#f5c518' } as const;

const X0 = 48;
const X1 = 1152;
const LARGURA_UTIL = X1 - X0;
// 1% de folga sobre a largura prevista (o Chrome pode arredondar posições de glifo).
const SEGURANCA = 1.01;
const { cap: CAP, acento: ACENTO_TOPO, desce: CEDILHA } = ALTURAS;

// Âncoras verticais (px, DIRECTION.md). O título de 2 linhas ou com cedilha empurra variação, barra e rótulos para baixo;
// os percentuais e o rodapé ficam onde estão.
const Y = { titulo: 104, tituloBase: 236, variacao: 304, barra: 322, rotulo: 418, percentuais: 572, rodape: 626 } as const;
const TITULO = { max: 150, min: 84, entrelinha: 0.92 } as const;
const BARRA = { altura: 40, costura: 4 } as const;
const FRASE = { numero: 64, texto: 34, seta: 30, folga: 16 } as const;
const PLACA = { altura: 44, folga: 14 } as const;
const TAMANHOS = { meta: [30, 28], rotulo: 34, lidera: 32 } as const;

const maiusculas = (s: string): string => s.toLocaleUpperCase('pt-BR');
const num = (v: number): string => String(Math.round(v * 10) / 10);
const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numeroDoPercentual = (pct: number): string => percentual(pct, 1).slice(0, -1);

interface Estilo {
  size: number;
  wdth: number;
  fill: string;
}

/** `conteudo` é marcação SVG: quem passa texto de dados escapa antes. */
function texto(x: number, y: number, { size, wdth, fill }: Estilo, conteudo: string, atributos = ''): string {
  return `<text x="${num(x)}" y="${num(y)}" font-size="${num(size)}" fill="${fill}" style="font-stretch:${num(wdth)}%"${atributos}>${conteudo}</text>`;
}

/** Maior wdth (até `maximo`) em que o conteúdo cabe; o menor valor da fonte se nem assim couber. */
function wdthQueCabe(cabe: (wdth: number) => boolean, maximo: number): number {
  for (let w = maximo; w > 62; w -= 1) if (cabe(w)) return w;
  return 62;
}

function zonaA(d: CardData, modo: ModoCard, selo: string | undefined, acento: string): string {
  const xMeta = d.bandeiraHref ? X0 + 56 + 16 : X0;
  const partes = [d.uf === 'BR' ? '' : d.uf, d.cargo === 'governador' ? CARGO_GOVERNADOR : '', TURNO_CARD];
  if (modo !== 'palpite') partes.push(apuracaoCard(modo, d.secoesPct));
  const meta = maiusculas(partes.filter(Boolean).join(' · '));
  const rotuloSelo = selo ? maiusculas(selo) : '';

  const ajustar = (size: number): { size: number; wdth: number } => {
    const largura = (w: number): number =>
      larguraTexto(meta, w, size) + (rotuloSelo ? 16 + larguraTexto(rotuloSelo, w, size) + 32 : 0);
    return { size, wdth: wdthQueCabe((w) => largura(w) * SEGURANCA <= X1 - xMeta, 100) };
  };
  // O tamanho maior só vale se não precisar condensar demais.
  const maior = ajustar(TAMANHOS.meta[0]);
  const { size, wdth } = maior.wdth >= 80 ? maior : ajustar(TAMANHOS.meta[1]);
  const base = 70 + (size * CAP) / 2;

  const saida: string[] = [];
  if (d.bandeiraHref) {
    saida.push(`<image href="${escapar(d.bandeiraHref)}" x="${X0}" y="51" width="56" height="39" preserveAspectRatio="xMidYMid meet"/>`);
  }
  // Os números ficam em --ink, o resto da linha em --ink-2.
  const runs = meta
    .split(/(\d+[º%]?)/)
    .map((parte, i) => (i % 2 ? `<tspan fill="${COR.ink}">${escapar(parte)}</tspan>` : escapar(parte)))
    .join('');
  saida.push(texto(xMeta, base, { size, wdth, fill: COR.ink2 }, runs));
  if (rotuloSelo) {
    const larguraPlaca = larguraTexto(rotuloSelo, wdth, size) + 32;
    saida.push(`<rect x="${num(X1 - larguraPlaca)}" y="48" width="${num(larguraPlaca)}" height="44" rx="8" fill="${acento}" class="selo"/>`);
    saida.push(texto(X1 - 16, base, { size, wdth, fill: COR.bg }, escapar(rotuloSelo), ' text-anchor="end"'));
  }
  return saida.join('');
}

/** Título em DESTINO: o nome do lugar de margem a margem pelo eixo wdth. Devolve o SVG e quanto desce o que vem abaixo. */
function zonaB(local: string): { svg: string; desce: number } {
  const { linhas } = ajustarDestino(maiusculas(local), { largura: LARGURA_UTIL, tamMax: TITULO.max, tamMin: TITULO.min });
  const tamanho = linhas[0].tamanho;
  const passo = tamanho * TITULO.entrelinha;
  const ultimaBase = Math.max(Y.tituloBase, Y.titulo + ACENTO_TOPO * tamanho + passo * (linhas.length - 1));
  const svg = linhas
    .map((l, i) => texto(X0, ultimaBase - passo * (linhas.length - 1 - i), { size: l.tamanho, wdth: l.wdth, fill: COR.ink }, escapar(l.texto), ' class="destino"'))
    .join('');
  // A cedilha do Ç desce 22% do corpo: sem folga, encosta no número da variação logo abaixo.
  const cedilha = linhas[linhas.length - 1].texto.includes('Ç') ? CEDILHA * tamanho : 0;
  const topoDaVariacao = Y.variacao - FRASE.numero * CAP;
  return { svg, desce: Math.max(ultimaBase - Y.tituloBase, ultimaBase + cedilha + 8 - topoDaVariacao) };
}

interface OpcoesFrase {
  cor: string;
  /** Lado da seta de deslocamento (o do candidato que ganhou terreno); sem seta, null. */
  seta: 'esq' | 'dir' | null;
  y: number;
}

/** Zona C: texto menor, número grande, texto menor; com a seta ◀ ▶ (triângulo desenhado: a Archivo não tem os glifos). */
function zonaC(frase: FraseCard, { cor, seta, y }: OpcoesFrase): string {
  const antes = maiusculas(frase.antes);
  const depois = maiusculas(frase.depois);
  const larguraNumero = larguraTexto(frase.numero, 125, FRASE.numero);
  const total = (w: number): number =>
    (seta ? FRASE.seta + FRASE.folga : 0) +
    (antes ? larguraTexto(antes, w, FRASE.texto) + FRASE.folga : 0) +
    larguraNumero +
    (depois ? FRASE.folga + larguraTexto(depois, w, FRASE.texto) : 0);
  const wdth = wdthQueCabe((w) => total(w) * SEGURANCA <= LARGURA_UTIL, 125);
  // A linha encosta no lado de quem ganhou terreno, o mesmo da sua coluna.
  let x = seta === 'dir' ? X1 - total(wdth) : X0;

  const topo = y - FRASE.numero * CAP;
  const meio = (y + topo) / 2;
  const triangulo = (xa: number): string => {
    const [ponta, base] = seta === 'esq' ? [xa, xa + FRASE.seta] : [xa + FRASE.seta, xa];
    return `<polygon class="seta" points="${num(base)},${num(topo)} ${num(ponta)},${num(meio)} ${num(base)},${num(y)}" fill="${cor}"/>`;
  };

  const saida: string[] = [];
  if (seta === 'esq') {
    saida.push(triangulo(x));
    x += FRASE.seta + FRASE.folga;
  }
  if (antes) {
    saida.push(texto(x, y, { size: FRASE.texto, wdth, fill: cor }, escapar(antes), ' class="frase"'));
    x += larguraTexto(antes, wdth, FRASE.texto) + FRASE.folga;
  }
  saida.push(texto(x, y, { size: FRASE.numero, wdth: 125, fill: cor }, escapar(frase.numero), ' class="numero-frase"'));
  x += larguraNumero;
  if (depois) {
    x += FRASE.folga;
    saida.push(texto(x, y, { size: FRASE.texto, wdth, fill: cor }, escapar(depois), ' class="frase"'));
    x += larguraTexto(depois, wdth, FRASE.texto);
  }
  if (seta === 'dir') saida.push(triangulo(x + FRASE.folga));
  return saida.join('');
}

/** Sem seções apuradas, a zona C vira o aviso, no tamanho do número, em vez de qualquer percentual ou margem. */
function zonaAguardando(y: number): string {
  const { linhas } = ajustarDestino(maiusculas(AGUARDANDO_SECOES), { largura: LARGURA_UTIL, tamMax: FRASE.numero, tamMin: FRASE.numero, maxLinhas: 1 });
  return texto(X0, y, { size: linhas[0].tamanho, wdth: linhas[0].wdth, fill: COR.ink }, escapar(linhas[0].texto), ' class="aguardando"');
}

/** O que a barra e as colunas mostram de cada candidato: a cor é a dele; o rótulo de posição (lidera/eleito) é só de quem o tem. */
interface Segmento {
  n: number;
  fill: string;
  rotulo: string | null;
}

interface OpcoesBarra {
  modo: ModoCard;
  y: number;
  /** Fatia do candidato da esquerda, 0..100. */
  pctEsq: number;
  esq: Segmento;
  dir: Segmento;
  aguardando: boolean;
}

/** Zona D: dois segmentos proporcionais (13 à esquerda, 22 à direita), costura de 4 px, marca de 50% e o rótulo de posição em --bg dentro do segmento de quem o tem. */
function zonaD({ modo, y, pctEsq, esq, dir, aguardando }: OpcoesBarra): string {
  if (aguardando) {
    return `<rect class="barra-vazia" x="${X0 + 2}" y="${y + 2}" width="${LARGURA_UTIL - 4}" height="${BARRA.altura - 4}" fill="none" stroke="${COR.ink2}" stroke-width="4"/>`;
  }
  const corte = X0 + (LARGURA_UTIL * pctEsq) / 100;
  // Uma fatia de menos de 6 px não vira segmento: seria um traço sem leitura, só uma costura.
  const temEsq = corte - X0 >= 6;
  const temDir = X1 - corte >= 6;
  const meiaCostura = temEsq && temDir ? BARRA.costura / 2 : 0;
  const segmentos = [
    { visivel: temEsq, x: X0, w: temDir ? corte - meiaCostura - X0 : LARGURA_UTIL, lado: esq, ancora: 'start' as const },
    { visivel: temDir, x: temEsq ? corte + meiaCostura : X0, w: temEsq ? X1 - corte - meiaCostura : LARGURA_UTIL, lado: dir, ancora: 'end' as const },
  ];
  const saida = segmentos
    .filter((s) => s.visivel)
    .map(({ x, w, lado, ancora }) => {
      const identidade = `class="barra" data-n="${lado.n}"`;
      const forma =
        modo === 'palpite'
          ? `<rect x="${num(x + 2)}" y="${y + 2}" width="${num(w - 4)}" height="${BARRA.altura - 4}" fill="none" stroke="${lado.fill}" stroke-width="4" ${identidade}/>`
          : `<rect x="${num(x)}" y="${y}" width="${num(w)}" height="${BARRA.altura}" fill="${lado.fill}" ${identidade}/>`;
      if (!lado.rotulo || larguraTexto(lado.rotulo, 100, TAMANHOS.lidera) + 32 > w) return forma;
      const xTexto = ancora === 'start' ? x + 16 : x + w - 16;
      const base = y + (BARRA.altura + TAMANHOS.lidera * CAP) / 2;
      return forma + texto(xTexto, base, { size: TAMANHOS.lidera, wdth: 100, fill: COR.bg }, escapar(lado.rotulo), ` text-anchor="${ancora}" data-n="${lado.n}" class="lidera"`);
    });
  saida.push(`<rect x="598" y="${y - 8}" width="4" height="8" fill="${COR.ink2}"/>`, `<rect x="598" y="${y + BARRA.altura}" width="4" height="8" fill="${COR.ink2}"/>`);
  return saida.join('');
}

interface ColunaE {
  cand: CandidatoCard;
  /** Cor do candidato: plaquinha, percentual e (no palpite) contorno. O nome fica sempre em --ink. */
  fill: string;
  lado: 'esq' | 'dir';
}

/** Rótulo "[13] LULA · PT": plaquinha com o número (--bg sobre a cor do candidato) e o nome em até 2 linhas, todos no mesmo wdth nas duas colunas. */
function rotulos(colunas: ColunaE[], modo: ModoCard, yBase: number): { svg: string; linhas: number } {
  const size = TAMANHOS.rotulo;
  const larguraPlaca = (n: number): number => larguraTexto(String(n), 100, size) + 24;
  const meia = (LARGURA_UTIL - 24) / 2;
  const ajustes = colunas.map(({ cand }) =>
    ajustarDestino(maiusculas(`${cand.nome} · ${cand.partido}`), { largura: meia - larguraPlaca(cand.n) - PLACA.folga, tamMax: size, tamMin: size }).linhas,
  );
  const wdth = Math.min(100, ...ajustes.flat().map((l) => l.wdth));
  const saida = colunas.map(({ cand, fill, lado }, i) => {
    const linhas = ajustes[i];
    const wPlaca = larguraPlaca(cand.n);
    const xPlaca = lado === 'esq' ? X0 : X1 - larguraTexto(linhas[0].texto, wdth, size) - PLACA.folga - wPlaca;
    const yPlaca = yBase - (PLACA.altura + size * CAP) / 2;
    const identidade = `data-n="${cand.n}" class="plaquinha"`;
    const placa =
      modo === 'palpite'
        ? `<rect x="${num(xPlaca + 2)}" y="${num(yPlaca + 2)}" width="${num(wPlaca - 4)}" height="${PLACA.altura - 4}" fill="none" stroke="${fill}" stroke-width="4" ${identidade}/>`
        : `<rect x="${num(xPlaca)}" y="${num(yPlaca)}" width="${num(wPlaca)}" height="${PLACA.altura}" fill="${fill}" ${identidade}/>`;
    const numero = texto(xPlaca + wPlaca / 2, yBase, { size, wdth: 100, fill: modo === 'palpite' ? fill : COR.bg }, String(cand.n), ` text-anchor="middle" data-n="${cand.n}" class="placa"`);
    const nomes = linhas.map((l, j) =>
      texto(lado === 'esq' ? X0 + wPlaca + PLACA.folga : X1, yBase + j * (size + 8), { size, wdth, fill: COR.ink }, escapar(l.texto), `${lado === 'dir' ? ' text-anchor="end"' : ''} data-n="${cand.n}" class="nome"`),
    );
    return placa + numero + nomes.join('');
  });
  return { svg: saida.join(''), linhas: Math.max(...ajustes.map((a) => a.length)) };
}

const PERCENTUAIS = [
  [160, 125], [160, 112.5], [160, 100], [150, 100], [140, 100], [132, 100], [132, 87.5], [132, 75],
] as const;

/** Maior par (tamanho, wdth) em que os dois percentuais cabem lado a lado e não encostam nos rótulos acima. */
function escolherPercentuais(esq: string, dir: string, tetoDeAltura: number): { size: number; wdth: number } {
  const ocupa = (t: string, size: number, wdth: number): number => larguraTexto(t, wdth, size) + 6 + larguraTexto('%', wdth, size * 0.4);
  const [size, wdth] =
    PERCENTUAIS.find(([s, w]) => s <= tetoDeAltura && (ocupa(esq, s, w) + ocupa(dir, s, w)) * SEGURANCA + 32 <= LARGURA_UTIL) ??
    PERCENTUAIS[PERCENTUAIS.length - 1];
  return { size, wdth };
}

/** Sem seções apuradas não há número a pintar: o traço fica neutro. */
function percentuais(colunas: ColunaE[], aguardando: boolean, tetoDeAltura: number): string {
  const numeros = colunas.map(({ cand }) => (aguardando ? '—' : numeroDoPercentual(cand.pct)));
  const { size, wdth } = escolherPercentuais(numeros[0], numeros[1], tetoDeAltura);
  return colunas
    .map(({ cand, fill, lado }, i) => {
      const sinal = aguardando ? '' : `<tspan font-size="${num(size * 0.4)}" dx="6">%</tspan>`;
      const atributos = `${lado === 'dir' ? ' text-anchor="end"' : ''} data-n="${cand.n}" class="pct"`;
      return texto(lado === 'esq' ? X0 : X1, Y.percentuais, { size, wdth, fill: aguardando ? COR.ink2 : fill }, numeros[i] + sinal, atributos);
    })
    .join('');
}

function rodape(d: CardData, modo: ModoCard): string {
  const esquerda = maiusculas(`${d.dominio} · ${d.handle}`);
  const direita = maiusculas(modo === 'palpite' ? RODAPE_PALPITE : `${FONTE_TSE} · ${d.hora}`);
  const size = 30;
  const wdth = wdthQueCabe((w) => (larguraTexto(esquerda, w, size) + larguraTexto(direita, w, size)) * SEGURANCA + 32 <= LARGURA_UTIL, 100);
  const estilo = { size, wdth, fill: COR.ink2 };
  return texto(X0, Y.rodape, estilo, escapar(esquerda)) + texto(X1, Y.rodape, estilo, escapar(direita), ' text-anchor="end"');
}

/** Texto alternativo completo, em caixa normal: quem não vê o card recebe o mesmo que ele diz. */
function descricao(d: CardData, modo: ModoCard, aguardando: boolean, frase: FraseCard | null, cand: CandidatoCard[], segmentos: Segmento[]): string {
  const lugar = d.uf === 'BR' ? d.local : `${d.local} (${d.uf})`;
  const cargo = d.cargo === 'governador' ? `${CARGO_GOVERNADOR}, ` : '';
  const apuracao = modo === 'palpite' ? RODAPE_PALPITE : aguardando ? AGUARDANDO_SECOES : apuracaoCard(modo, d.secoesPct);
  const candidatos = cand.map((c, i) => {
    const valor = aguardando ? '' : `: ${percentual(c.pct, 1)}`;
    const rotulo = segmentos[i].rotulo ? ` (${segmentos[i].rotulo.toLowerCase()})` : '';
    return `${c.n} ${c.nome}, ${c.partido}${valor}${rotulo}`;
  });
  const destaque = frase ? [frase.antes, frase.numero, frase.depois].filter(Boolean).join(' ') : '';
  const fonte = modo === 'palpite' ? '' : `${FONTE_TSE}, ${d.hora}.`;
  return [`${lugar}, ${cargo}${TURNO_CARD}, ${apuracao}.`, `${candidatos.join('. ')}.`, destaque && `${destaque}.`, fonte].filter(Boolean).join(' ');
}

/** O que a zona C diz, em ordem de prioridade (e a cor e a seta que a acompanham). A margem é neutra; a variação é do candidato que ganhou terreno. */
function escolherFrase(d: CardData, e: CandidatoCard, r: CandidatoCard, modo: ModoCard): { frase: FraseCard; cor: string; seta: OpcoesFrase['seta'] } {
  const margem = Math.abs(e.pct - r.pct);
  const margemEmPontos = { frase: diferencaPontosCard(margem), cor: COR.ink, seta: null };
  if (modo === 'palpite') return margemEmPontos;
  if (margem < 1 && d.diferencaVotos !== undefined) return { frase: diferencaVotosCard(d.diferencaVotos), cor: COR.ink, seta: null };
  // Governador não tem comparação com 2022: mostra a margem entre os dois.
  if (d.cargo === 'presidente' && margem >= 1 && d.variacao !== undefined && Math.abs(d.variacao) >= 0.05) {
    const [ganhou, coluna] = d.variacao > 0 ? ([e, 0] as const) : ([r, 1] as const);
    return { frase: variacaoCard(ganhou.nome, Math.abs(d.variacao)), cor: corCandidato(ganhou.n, coluna).hex, seta: coluna === 0 ? 'esq' : 'dir' };
  }
  return margemEmPontos;
}

export function renderCard(d: CardData): string {
  const [e, r] = [...d.cand].sort((a, b) => a.n - b.n);
  const modo = d.modo;
  const aguardando = modo !== 'palpite' && d.secoesPct < 1;

  // Cor pertence ao candidato (cores.ts), nunca à posição: quem lidera se diz no rótulo e pela barra. Empate: ninguém lidera.
  const diferenca = e.pct - r.pct;
  const lider = aguardando || Math.abs(diferenca) < 1e-9 ? null : diferenca > 0 ? e : r;
  const rotuloDe = (c: CandidatoCard): string | null => {
    if (modo === 'palpite' || aguardando) return null;
    if (c.eleito) return maiusculas(rotuloPosicao(true, c.feminino));
    return modo === 'parcial' && c === lider ? maiusculas(rotuloPosicao(false)) : null;
  };
  const segmentos: Segmento[] = [
    { n: e.n, fill: corCandidato(e.n, 0).hex, rotulo: rotuloDe(e) },
    { n: r.n, fill: corCandidato(r.n, 1).hex, rotulo: rotuloDe(r) },
  ];
  const colunas: ColunaE[] = [
    { cand: e, fill: segmentos[0].fill, lado: 'esq' },
    { cand: r, fill: segmentos[1].fill, lado: 'dir' },
  ];

  const titulo = zonaB(d.local);
  const destaque = aguardando ? null : escolherFrase(d, e, r, modo);
  const rot = rotulos(colunas, modo, Y.rotulo + titulo.desce);
  const fundoDosRotulos = Y.rotulo + titulo.desce + (rot.linhas === 2 ? TAMANHOS.rotulo + 8 + CEDILHA * TAMANHOS.rotulo : (PLACA.altura - TAMANHOS.rotulo * CAP) / 2);
  const tetoDosPercentuais = (Y.percentuais - fundoDosRotulos - 20) / CAP;

  const fonte = d.fonteDataUri ? `<style>@font-face{font-family:Archivo;font-weight:900;font-stretch:62% 125%;src:url(${d.fonteDataUri}) format("woff2")}</style>` : '';
  const tituloSvg = escapar(`${d.local}${d.uf === 'BR' ? '' : ` (${d.uf})`}, ${TURNO_CARD}`);
  const descr = escapar(descricao(d, modo, aguardando, destaque?.frase ?? null, [e, r], segmentos));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img">`,
    `<title>${tituloSvg}</title><desc>${descr}</desc>`,
    fonte,
    `<rect width="1200" height="675" fill="${COR.bg}"/>`,
    `<rect x="0" y="0" width="${FAIXA.corte}" height="${FAIXA.altura}" fill="${FAIXA.verde}" class="faixa"/>`,
    `<rect x="${FAIXA.corte}" y="0" width="${1200 - FAIXA.corte}" height="${FAIXA.altura}" fill="${FAIXA.amarelo}" class="faixa"/>`,
    `<g style="font-family:Archivo,'Arial Narrow',Arial,sans-serif;font-weight:900;font-variant-numeric:tabular-nums">`,
    zonaA(d, modo, modo === 'palpite' ? SELO_PALPITE : d.selo, ACENTOS[d.acento ?? 'ouro']),
    titulo.svg,
    destaque ? zonaC(destaque.frase, { cor: destaque.cor, seta: destaque.seta, y: Y.variacao + titulo.desce }) : zonaAguardando(Y.variacao + titulo.desce),
    zonaD({ modo, y: Y.barra + titulo.desce, pctEsq: e.pct, esq: segmentos[0], dir: segmentos[1], aguardando }),
    rot.svg,
    percentuais(colunas, aguardando, tetoDosPercentuais),
    rodape(d, modo),
    `</g></svg>`,
  ].join('');
}
