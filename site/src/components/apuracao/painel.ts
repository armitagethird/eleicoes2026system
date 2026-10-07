// HTML dos painéis de /apuracao (placar, detalhe do município, destaques, tabela e leitura do mapa). Funções puras que
// devolvem string: o build usa as mesmas para a primeira pintura (set:html) e a ilha para redesenhar (innerHTML), então
// o HTML do build e o do navegador nunca divergem. Mesma linguagem do Placar.astro (folhas, costura de 4 px, marca de
// 50%, seta de deslocamento), com a cor de cada candidato vinda do campo "cor" da camada (em 2018 o 17 veste o azul do 22).
// Ordem sempre A antes de B (13 antes de 22). Os estilos ficam em Apuracao.astro.
import { altBandeira, rasterBandeira, type Sigla } from '../../lib/bandeiras.ts';
import type { Camada, CandidatoCamada, Valor } from '../../lib/camada-mapa.ts';
import {
  AGUARDANDO_SECOES,
  CREDITO_FOTO,
  LINHA_APURADA,
  OUTRO_MAIS_VOTADO,
  OUTROS_CANDIDATOS,
  ROTULO_RANKING,
  SEM_DADO,
  UNIDADE_LEGENDA,
  VER_CARD,
  legendaMapa,
  linhaApuracao,
  maisVotado,
  rotuloPosicao,
  semVirada,
  turnoDaCamada,
  variacaoDesdeCamada,
  verCidade,
  verEstado,
} from '../../lib/copy.ts';
import { corCandidato } from '../../lib/cores.ts';
import { DEGRAUS, ESTAVEL, LIMIARES, type ModoCor } from '../../lib/cores-mapa.ts';
import { ajustarDestino } from '../../lib/destino.ts';
import { percentual, pontos } from '../../lib/format.ts';
import { fotoCandidato } from '../../lib/fotos.ts';
import { anoDe, comDados, quemLidera, type Destaque, type Destaques, type IdCamada, type LinhaTabela } from '../../lib/apuracao-dados.ts';

/** O que todo painel precisa saber da camada em tela. */
export interface Contexto {
  id: IdCamada;
  camada: Camada;
  /** Camada comparada (null = sem comparação). */
  idReferencia: IdCamada | null;
  /** Durante a apuração ao vivo: "lidera" e linha com hora. */
  parcial: boolean;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (texto: string): string => texto.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const corDe = (c: CandidatoCamada, coluna: 0 | 1): string => corCandidato(c.cor === null ? 0 : Number(c.cor), coluna).css;

const semSinal = (pct: number, casas = 1): string => percentual(pct, casas).replace('%', '');

/** Espaço inquebrável antes de cada "·" (o mesmo de Mapa.astro): a linha quebra depois do separador, nunca começa com ele. */
export const semQuebraNoSeparador = (texto: string): string => texto.replaceAll(' · ', ' · ');

/** Bandeira intacta numa caixa 10:7, igual à de Bandeira.astro (o raster inteiro dentro da caixa, sem recorte). */
export function bandeiraHtml(sigla: Sigla, largura: number): string {
  const { src, srcset } = rasterBandeira(sigla, largura);
  return `<img class="bandeira" src="${src}" srcset="${srcset}" alt="${esc(altBandeira(sigla))}" width="${largura}" height="${Math.round(largura * 0.7)}" decoding="async">`;
}

/**
 * Foto oficial do TSE (mesma caixa de FotoCandidato.astro: filete de 3 px na cor do candidato, width e height explícitos).
 * Só nas camadas de 2026: em 2022 o 22 era Jair Bolsonaro e em 2018 o 17, então a foto de hoje seria de outra pessoa. Sem foto, vazio.
 */
function fotoHtml(ctx: Contexto, c: CandidatoCamada, coluna: 0 | 1): string {
  const foto = anoDe(ctx.id) === '2026' ? fotoCandidato(c.n) : null;
  return foto
    ? `<span class="foto" style="--cor:${corDe(c, coluna)}"><img src="${foto.src}" srcset="${foto.srcset}" alt="${esc(foto.alt)}" width="${foto.width}" height="${foto.height}" loading="lazy" decoding="async"></span>`
    : '';
}

// DESTINO compacto: o nome ajustado numa caixa de referência (`ref`, a largura típica da caixa real) e escrito como fração
// da largura real (`largura`, uma expressão CSS: 100cqi da própria caixa ou uma var(--caixa) que a lista calcula), em até
// duas linhas: numa caixa mais estreita o nome encolhe junto, numa mais larga para no tamanho máximo. Nas listas a largura
// vem de um container só por lista: um container por linha custava ~300 ms de layout a cada redesenho (medido no Chrome).
// O HTML guarda a caixa original (o CSS põe em caixa-alta), para o leitor de tela não soletrar.
export function nomeDestino(nome: string, ref: number, tamMax: number, tamMin: number, maxLinhas: 1 | 2 = 2, largura = '100cqi'): string {
  const { linhas } = ajustarDestino(nome.toLocaleUpperCase('pt-BR'), { largura: ref, tamMax, tamMin, maxLinhas });
  const palavras = nome.split(' ');
  let usadas = 0;
  return linhas
    .map((l) => {
      const texto = palavras.slice(usadas, (usadas += l.texto.split(' ').length)).join(' ');
      const fracao = Math.round((l.tamanho / ref) * 10_000) / 10_000;
      return `<span class="nd" style="font-size:min(${tamMax}px,calc(${largura} * ${fracao}));font-stretch:${l.wdth}%">${esc(texto)}</span>`;
    })
    .join(' ');
}

const TRIANGULO = { esq: 'M0 6 10 0v12z', dir: 'M10 6 0 0v12z' };
const triangulo = (lado: 'esq' | 'dir'): string => `<svg class="tri" viewBox="0 0 10 12" aria-hidden="true"><path d="${TRIANGULO[lado]}"/></svg>`;

/** Seta de deslocamento (gesto 3): aponta para o lado de quem ganhou terreno, na cor dele. Sem variação visível, nada. */
function setaHtml(ctx: Contexto, delta: number | null): string {
  if (delta === null || !ctx.idReferencia || Math.abs(delta) < 0.05) return '';
  const coluna = delta > 0 ? 0 : 1;
  const cand = ctx.camada.candidatos[coluna];
  const [numero, ...resto] = variacaoDesdeCamada(cand.nome, Math.abs(delta), ctx.idReferencia).split(' ');
  const lado = coluna === 0 ? 'esq' : 'dir';
  return `<p class="seta ${lado}" style="--cor:${corDe(cand, coluna)}">${triangulo(lado)}<strong class="pts">${numero}</strong><span class="resto">${esc(resto.join(' '))}</span></p>`;
}

/** Barra do site: A | outros | B, proporcionais, costura de 4 px e marca de 50%. "lidera" dentro da folha só em parcial. */
function barraHtml(ctx: Contexto, v: Valor | null): string {
  if (!comDados(v)) return '<div class="barra vazia" aria-hidden="true"></div>';
  const lider = v.liderOutro === null ? quemLidera(v) : null;
  const folha = (coluna: 0 | 1, p: number): string => {
    const rotulo = ctx.parcial && lider === coluna ? `<span class="rotulo">${rotuloPosicao(false)}</span>` : '';
    return p > 0 ? `<i class="${coluna === 0 ? 'esq' : 'dir'}" style="--p:${p};--cor:${corDe(ctx.camada.candidatos[coluna], coluna)}">${rotulo}</i>` : '';
  };
  const outros = v.outros > 0 ? `<i class="outros" style="--p:${v.outros}"></i>` : '';
  return `<div class="barra" aria-hidden="true">${folha(0, v.a)}${outros}${folha(1, v.b)}</div>`;
}

/**
 * O que dizer de um lugar sem número: "aguardando primeiras seções" só vale na apuração ao vivo. Numa eleição já apurada o
 * lugar sem número não existia nela (Boa Esperança do Norte nasceu depois de 2022): é "sem dado", e a linha "final · 100%"
 * ficaria falando de um lugar que não tem resultado.
 */
const semNumero = (ctx: Contexto): string => (ctx.parcial ? AGUARDANDO_SECOES : SEM_DADO);

function linhaDaCamada(ctx: Contexto, v: Valor | null): string {
  if (!ctx.parcial) return comDados(v) ? LINHA_APURADA : '';
  return linhaApuracao('parcial', v?.secoes ?? 0, ctx.camada.atualizado);
}

export interface Lugar {
  nome: string;
  /** Bandeira ao lado do nome (Brasil ou UF). */
  sigla?: Sigla;
  /** Município: a sigla da UF na linha de meta. */
  uf?: string;
  /** Município: o link para o card da cidade. */
  slug?: string;
  /** UF: a sigla (minúscula) cuja página, /uf/{uf}, tem o card do estado. */
  ufCard?: Sigla;
  /** Bloco de contexto ao lado de um detalhe que já mostra as fotos: sem foto e sem crédito, para não repetir os dois rostos. */
  semFoto?: boolean;
}

/**
 * Placar (folha) de um lugar. `compacto` é o detalhe (município ou UF): percentuais menores e o link para o card. `chave` marca
 * os números para a ilha virar só os algarismos que mudaram (painel que vira) quando o mesmo lugar é atualizado.
 */
export function placarHtml(ctx: Contexto, lugar: Lugar, v: Valor | null, delta: number | null, compacto = false): string {
  const { candidatos } = ctx.camada;
  const ok = comDados(v);
  const meta = [lugar.uf, 'presidente', turnoDaCamada(ctx.id)].filter(Boolean).join(' · ');
  const fotos = candidatos.map((c, i) => (lugar.semFoto ? '' : fotoHtml(ctx, c, i === 0 ? 0 : 1)));
  const comFoto = fotos.some(Boolean);
  const colunas = candidatos
    .map((c, i) => {
      const coluna = i === 0 ? 0 : 1;
      const lado = coluna === 0 ? 'esq' : 'dir';
      const pct = ok ? (coluna === 0 ? v.a : v.b) : null;
      const numero =
        pct === null ? '' : `<p class="pct"><span data-flap-chave="${lado}">${semSinal(pct)}</span><span class="sinal">%</span></p>`;
      return `<div class="col ${lado}" style="--cor:${corDe(c, coluna)}">${fotos[i]}<p class="quem"><span class="placa-n">${c.n}</span><span class="nome">${esc(c.nome)}</span></p><p class="partido">${esc(c.partido)}</p>${numero}</div>`;
    })
    .join('');
  const outros =
    ok && v.outros > 0
      ? `<p class="outros-linha">${OUTROS_CANDIDATOS} <span class="tinta">${percentual(v.outros)}</span>${v.liderOutro !== null ? ` · <span class="tinta">${maisVotado(v.liderOutro)}</span>` : ''}</p>`
      : '';
  const lider = ok && ctx.parcial && v.liderOutro === null ? quemLidera(v) : null;
  const falado = ok
    ? `<p class="sr-only">${[
        ...candidatos.map((c, i) => `${c.n}, ${esc(c.nome)}: ${percentual(i === 0 ? v.a : v.b)}`),
        ...(lider === null ? [] : [`${candidatos[lider].n} ${rotuloPosicao(false)}`]),
      ].join('; ')}</p>`
    : '';
  const card = lugar.slug
    ? { href: `/c/${lugar.slug}`, rotulo: verCidade(lugar.nome) }
    : lugar.ufCard
      ? { href: `/uf/${lugar.ufCard}`, rotulo: verEstado(lugar.nome) }
      : null;
  // O rodapé próprio é o que a gaveta do celular prende embaixo quando o resto do detalhe rola (Apuracao.astro).
  const link = card
    ? `<div class="ir-fixo"><a class="ir" href="${esc(card.href)}" aria-label="${esc(card.rotulo)}">${VER_CARD}<svg class="tri" viewBox="0 0 10 12" aria-hidden="true"><path d="${TRIANGULO.dir}"/></svg></a></div>`
    : '';
  return `<div class="folha-lugar${compacto ? ' compacto' : ''}${ok ? '' : ' sem-dado'}">
<header class="topo${lugar.sigla ? ' com-bandeira' : ''}">${lugar.sigla ? bandeiraHtml(lugar.sigla, 40) : ''}<h2 class="lugar">${nomeDestino(lugar.nome, 340, compacto ? 40 : 56, 22)}</h2><p class="meta">${esc(meta)}</p></header>
${ok ? setaHtml(ctx, delta) : ''}${barraHtml(ctx, v)}<div class="cols${comFoto ? ' com-foto' : ''}" aria-hidden="${ok}">${colunas}</div>${falado}
${ok ? outros : `<p class="aguardando">${semNumero(ctx)}</p>`}<p class="linha">${esc(semQuebraNoSeparador(linhaDaCamada(ctx, v)))}</p>${comFoto ?`<p class="credito">${CREDITO_FOTO}</p>` : ''}${link}</div>`;
}

/**
 * Linha de leitura do mapa (hover no desktop): nome e os dois percentuais, num painel fixo, nunca em tooltip. Sem a UF: um
 * município só aparece com a UF em foco, que a migalha ao lado já diz, e a linha divide a largura com ela.
 */
export function leituraHtml(ctx: Contexto, nome: string, v: Valor | null): string {
  const numeros = comDados(v)
    ? ctx.camada.candidatos
        .map((c, i) => `<span class="l-c" style="--cor:${corDe(c, i === 0 ? 0 : 1)}"><span class="placa-n">${c.n}</span>${percentual(i === 0 ? v.a : v.b)}</span>`)
        .join('')
    : `<span class="l-aguardando">${semNumero(ctx)}</span>`;
  return `<span class="l-nome">${esc(nome)}</span>${numeros}`;
}

const pontosCurtos = (delta: number): string => pontos(Math.abs(delta)).split(' ')[0];

/** Casas dos percentuais de um destaque: a "mais dividida" é ordenada pela margem, e a 1ª casa já a esconde (50,0 e 50,0). */
const casasDoDestaque = (chave: keyof Destaques): number => (chave === 'dividida' ? 2 : 1);

function numerosDestaque(ctx: Contexto, d: Destaque, chave: keyof Destaques): string {
  const v = d.valor;
  if (!comDados(v)) return '';
  if (chave === 'virada' && d.variacao !== null) {
    const coluna = d.variacao > 0 ? 0 : 1;
    const lado = coluna === 0 ? 'esq' : 'dir';
    return `<span class="dq-seta ${lado}" style="--cor:${corDe(ctx.camada.candidatos[coluna], coluna)}">${triangulo(lado)}${pontosCurtos(d.variacao)}</span>`;
  }
  return ctx.camada.candidatos
    .map((c, i) => `<span class="dq-pct" style="--cor:${corDe(c, i === 0 ? 0 : 1)}">${semSinal(i === 0 ? v.a : v.b, casasDoDestaque(chave))}</span>`)
    .join('');
}

function rotuloDestaque(ctx: Contexto, d: Destaque, posicao: number | null, chave: keyof Destaques): string {
  const partes = [`${posicao ? `${posicao}º, ` : ''}${d.lugar.nome} (${d.lugar.uf})`];
  if (comDados(d.valor)) {
    const v = d.valor;
    partes.push(ctx.camada.candidatos.map((c, i) => `${c.n}, ${percentual(i === 0 ? v.a : v.b, casasDoDestaque(chave))}`).join('; '));
    if (d.variacao !== null && ctx.idReferencia && Math.abs(d.variacao) >= 0.05) {
      const coluna = d.variacao > 0 ? 0 : 1;
      partes.push(variacaoDesdeCamada(String(ctx.camada.candidatos[coluna].n), Math.abs(d.variacao), ctx.idReferencia));
    }
  } else partes.push(semNumero(ctx));
  return partes.join('; ');
}

const LIMITE_DESTAQUE = 5;
const CHAVES_DESTAQUE = ['dividida', 'unanime', 'virada', 'capitais'] as const;

function itemDestaque(ctx: Contexto, item: Destaque, chave: keyof Destaques, posicao: number | null): string {
  const v = item.valor;
  const [a, b] = ctx.camada.candidatos;
  const barra = comDados(v)
    ? `<span class="barra fina" aria-hidden="true"><i style="--p:${v.a};--cor:${corDe(a, 0)}"></i>${v.outros > 0 ? `<i class="outros" style="--p:${v.outros}"></i>` : ''}<i style="--p:${v.b};--cor:${corDe(b, 1)}"></i></span>`
    : `<span class="dq-aguardando" aria-hidden="true">${semNumero(ctx)}</span>`;
  const nome = `<span class="dq-caixa">${nomeDestino(item.lugar.nome, chave === 'capitais' ? 200 : 220, 22, 13, 1, 'var(--caixa)')}</span><span class="dq-uf">${item.lugar.uf}</span>`;
  const numeros = `<span class="dq-num">${numerosDestaque(ctx, item, chave)}</span>`;
  const visivel =
    posicao === null
      ? `<span class="dq-linha">${nome}</span><span class="dq-linha">${barra}${numeros}</span>`
      : `<span class="dq-linha"><span class="dq-pos">${posicao}</span>${nome}${numeros}</span>${barra}`;
  // O nome acessível sai do texto para leitor de tela; o desenho fica escondido dele (sem aria-label que divirja do visível).
  return `<li><button type="button" class="dq-item" data-ibge="${item.ibge}" data-uf="${item.lugar.uf}"><span class="sr-only">${esc(rotuloDestaque(ctx, item, posicao, chave))}</span><span class="dq-desenho" aria-hidden="true">${visivel}</span></button></li>`;
}

/**
 * Os quatro destaques (os antigos rankings) no foco. Cada linha é um botão que leva o mapa ao município: o card da cidade
 * fica a um toque, no detalhe. Sem camada ou sem índice, linhas de espera do tamanho das reais (o painel não pula).
 */
export function destaquesHtml(ctx: Contexto | null, d: Destaques | null, escopo: string): string {
  return CHAVES_DESTAQUE.map((chave) => {
    let linhas: string;
    if (!ctx || !d) linhas = '<li class="dq-espera" aria-hidden="true"></li>'.repeat(LIMITE_DESTAQUE);
    else if (d[chave].length) linhas = d[chave].map((item, i) => itemDestaque(ctx, item, chave, chave === 'capitais' ? null : i + 1)).join('');
    else {
      const vazio = chave === 'virada' && ctx.idReferencia ? esc(semVirada(turnoDaCamada(ctx.idReferencia))) : semNumero(ctx);
      linhas = `<li class="dq-vazio">${vazio}</li>`;
    }
    return `<section class="dq ${chave}" aria-labelledby="dq-${chave}"><h3 class="dq-titulo" id="dq-${chave}">${ROTULO_RANKING[chave]}<span class="dq-escopo"> · ${esc(escopo)}</span></h3><ol class="dq-lista">${linhas}</ol></section>`;
  }).join('');
}

/** "Ver em tabela": a alternativa acessível ao mapa. UF leva o mapa e a tabela para os municípios dela; município abre o card. */
export function tabelaHtml(
  ctx: Contexto,
  linhas: LinhaTabela[],
  escopo: string,
  municipal: boolean,
  slugDe: (chave: string) => string | undefined,
): string {
  const [a, b] = ctx.camada.candidatos;
  const comOutros = linhas.some((l) => (l.valor?.outros ?? 0) > 0);
  const cabeca = [
    `<th scope="col">${municipal ? 'município' : 'UF'}</th>`,
    `<th scope="col" class="num" style="--cor:${corDe(a, 0)}"><span class="placa-n">${a.n}</span> ${esc(a.nome)}</th>`,
    comOutros ? `<th scope="col" class="num">${OUTROS_CANDIDATOS}</th>` : '',
    `<th scope="col" class="num" style="--cor:${corDe(b, 1)}"><span class="placa-n">${b.n}</span> ${esc(b.nome)}</th>`,
    ctx.idReferencia ? `<th scope="col" class="num">desde ${anoDe(ctx.idReferencia)}</th>` : '',
    '<th scope="col" class="num">seções</th>',
  ].join('');
  const corpo = linhas
    .map((l) => {
      const v = l.valor;
      const ok = comDados(v);
      const slug = slugDe(l.chave);
      const nome = municipal
        ? slug
          ? `<a href="/c/${esc(slug)}">${esc(l.nome)}</a>`
          : esc(l.nome)
        : `<button type="button" data-uf="${l.chave}">${esc(l.nome)}</button>`;
      const celula = (x: number | undefined, cor?: string): string =>
        `<td class="num"${cor ? ` style="--cor:${cor}"` : ''}>${ok && x !== undefined ? percentual(x) : '–'}</td>`;
      let delta = '<td class="num">–</td>';
      if (ctx.idReferencia && l.variacao !== null) {
        const coluna = l.variacao > 0 ? 0 : 1;
        const cand = ctx.camada.candidatos[coluna];
        delta =
          Math.abs(l.variacao) < 0.05
            ? '<td class="num">0,0</td>'
            : `<td class="num" style="--cor:${corDe(cand, coluna)}"><span class="placa-n">${cand.n}</span> ${pontosCurtos(l.variacao)}</td>`;
      }
      return `<tr><th scope="row">${nome}</th>${celula(v?.a, corDe(a, 0))}${comOutros ? celula(v?.outros) : ''}${celula(v?.b, corDe(b, 1))}${ctx.idReferencia ? delta : ''}<td class="num">${v ? percentual(v.secoes, 0) : '–'}</td></tr>`;
    })
    .join('');
  return `<table class="tb"><caption class="sr-only">${esc(`${turnoDaCamada(ctx.id)}, ${escopo}`)}</caption><thead><tr>${cabeca}</tr></thead><tbody>${corpo}</tbody></table>`;
}

/**
 * Legenda do mapa com os degraus de lib/cores-mapa.ts: uma régua por candidato (A antes de B), do degrau mais fraco à cor
 * cheia, com os limiares embaixo. No COMPARAR o primeiro degrau é o cinza de "estável". Depois, sem dado e, no 1º turno,
 * a cor neutra de quando um terceiro teve mais votos.
 */
export function legendaHtml(ctx: Contexto, modo: ModoCor): string {
  const limiares = [0, ...LIMIARES[modo]];
  const reguas = ctx.camada.candidatos
    .map((c, i) => {
      const lado = c.cor;
      const chips = lado ? (modo === 'resultado' ? DEGRAUS.resultado[lado] : [ESTAVEL, ...DEGRAUS.variacao[lado]]) : [];
      const tinta = chips.length ? chips.map((cor) => `<i style="background:${cor}"></i>`).join('') : '<i class="neutro"></i>';
      return `<p class="lg-cand" style="--cor:${corDe(c, i === 0 ? 0 : 1)}"><span class="placa-n">${c.n}</span><span class="lg-nome">${esc(c.nome)}</span></p><p class="lg-chips" aria-hidden="true">${tinta}</p>`;
    })
    .join('');
  const marcas = limiares.map((l, i) => `<span>${l}${i === limiares.length - 1 ? '+' : ''}</span>`).join('');
  const referencia = ctx.idReferencia ? turnoDaCamada(ctx.idReferencia) : '';
  const outro = ctx.id.endsWith('t1') && modo === 'resultado' ? `<span class="lg-extra"><i class="neutro"></i>${OUTRO_MAIS_VOTADO}</span>` : '';
  return `<p class="lg-titulo">${esc(legendaMapa(modo, ctx.parcial, referencia))}</p>
<div class="lg-grade">${reguas}<p class="lg-marcas"><span class="sr-only">${esc(UNIDADE_LEGENDA[modo])}: ${limiares.join(', ')}</span><span class="lg-numeros" aria-hidden="true">${marcas}</span></p><p class="lg-unidade" aria-hidden="true">${UNIDADE_LEGENDA[modo]}</p></div>
<p class="lg-extras"><span class="lg-extra"><i class="sem-dado"></i>${SEM_DADO}</span>${outro}</p>`;
}
