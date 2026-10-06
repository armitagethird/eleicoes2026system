// Ilha de /rankings: lê /data/status.json e, fora do modo pre, /data/rankings.json (quatro listas de slugs) e liga cada
// slug ao nome e à UF pelo índice de busca (/busca.json, o mesmo da home). No pre mostra o bloco da contagem regressiva e
// esconde as listas; depois troca. Repete a cada 20 s, pausa com a aba oculta e para no modo final. As funções puras ficam
// exportadas para teste; a ilha só liga onde há [data-rankings].
import type { EntradaIndice } from '../lib/busca.ts';
import type { Rankings } from '../lib/contratos.ts';
import { AGUARDANDO_SECOES, semConexao } from '../lib/copy.ts';
import { ajustarDestino } from '../lib/destino.ts';
import { parseStatus } from '../lib/status.ts';

export const CHAVES = ['dividida', 'unanime', 'virada', 'capitais'] as const satisfies ReadonlyArray<keyof Rankings>;

const INTERVALO = 20_000;
// Linha de destino compacta: o nome encosta na coluna pelo eixo wdth. A referência é a coluna do nome a 360 px de tela;
// em cqi o ajuste acompanha a coluna, e o teto em px segura o tamanho nas telas largas.
const LARGURA_REF = 232;
const NOME_MAX = 28;
const NOME_MAX_PRIMEIRO = 40;
const NOME_MIN = 14;

export interface ItemRanking {
  slug: string;
  nome: string;
  uf: string;
  posicao: number;
}

/** Lê rankings.json sem lançar: lista ausente ou que não é lista vira vazia, e o que não é slug é descartado. */
export function parseRankings(bruto: unknown): Rankings {
  const o = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const slugs = (chave: keyof Rankings): string[] => {
    const lista = o[chave];
    return Array.isArray(lista) ? lista.filter((s): s is string => typeof s === 'string' && s !== '') : [];
  };
  return { dividida: slugs('dividida'), unanime: slugs('unanime'), virada: slugs('virada'), capitais: slugs('capitais') };
}

export function indicePorSlug(indice: EntradaIndice[]): Map<string, { nome: string; uf: string }> {
  return new Map(indice.map(([slug, nome, uf]) => [slug, { nome, uf }]));
}

/** A posição é a do slug na lista; slug fora do índice some e não desloca quem vem depois. */
export function itensDoRanking(slugs: string[], nomes: Map<string, { nome: string; uf: string }>): ItemRanking[] {
  return slugs.flatMap((slug, i) => {
    const lugar = nomes.get(slug);
    return lugar ? [{ slug, ...lugar, posicao: i + 1 }] : [];
  });
}

/**
 * font-size e font-stretch do nome (DESTINO compacto): wdth de 62 a 125 primeiro, tamanho só se não couber.
 * Também serve a lista de cidades de uf/[uf].astro.
 */
export function estiloNome(nome: string, tamMax: number): string {
  const [linha] = ajustarDestino(nome.toLocaleUpperCase('pt-BR'), {
    largura: LARGURA_REF,
    tamMax,
    tamMin: NOME_MIN,
    maxLinhas: 1,
  }).linhas;
  const cqi = Math.round((linha.tamanho / LARGURA_REF) * 10_000) / 100;
  return `font-size:min(${tamMax}px,${cqi}cqi);font-stretch:${linha.wdth}%`;
}

const elemento = <K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

function linha(item: ItemRanking, comPosicao: boolean): HTMLLIElement {
  const primeiro = comPosicao && item.posicao === 1;
  const link = elemento('a', primeiro ? 'item primeiro' : 'item');
  link.href = `/c/${item.slug}`;
  link.setAttribute('aria-label', `${comPosicao ? `${item.posicao}º, ` : ''}${item.nome} (${item.uf})`);
  if (comPosicao) link.append(elemento('span', 'pos', String(item.posicao)));
  const caixa = elemento('span', 'caixa');
  const nome = elemento('span', 'nome', item.nome);
  nome.style.cssText = estiloNome(item.nome, primeiro ? NOME_MAX_PRIMEIRO : NOME_MAX);
  caixa.append(nome);
  link.append(caixa, elemento('span', 'uf', item.uf));
  const li = document.createElement('li');
  li.append(link);
  return li;
}

function iniciar(raiz: HTMLElement): void {
  const aviso = raiz.querySelector<HTMLElement>('[data-rk-aviso]');
  const pre = raiz.querySelector<HTMLElement>('[data-rk-pre]');
  const listas = new Map(CHAVES.map((chave) => [chave, raiz.querySelector<HTMLOListElement>(`[data-rk-lista="${chave}"]`)]));
  const secoes = raiz.querySelectorAll<HTMLElement>('[data-rk-secao]');
  if (!aviso || !pre || [...listas.values()].some((l) => !l)) return;

  let nomes: Promise<Map<string, { nome: string; uf: string }>> | null = null;
  let atualizado: string | null = null;
  let timer: number | undefined;
  let encerrado = false;
  let emCurso = false;

  const avisar = (erro: string | null): void => {
    aviso.hidden = erro === null;
    aviso.textContent = erro ?? '';
  };

  const mostrarListas = (visivel: boolean): void => secoes.forEach((s) => (s.hidden = !visivel));

  // Um pedido por vez; se falhar, o próximo ciclo tenta de novo.
  const carregarNomes = (): Promise<Map<string, { nome: string; uf: string }>> => {
    nomes ??= pedir('/busca.json').then(
      (indice) => indicePorSlug(indice as EntradaIndice[]),
      (erro: unknown) => {
        nomes = null;
        throw erro;
      },
    );
    return nomes;
  };

  const desenhar = (rankings: Rankings, porSlug: Map<string, { nome: string; uf: string }>): void => {
    for (const chave of CHAVES) {
      const itens = itensDoRanking(rankings[chave], porSlug);
      const vazio = elemento('li', 'vazio', AGUARDANDO_SECOES);
      listas.get(chave)?.replaceChildren(...(itens.length ? itens.map((i) => linha(i, chave !== 'capitais')) : [vazio]));
    }
  };

  // Devolve o modo lido, para o ciclo saber quando parar.
  const atualizar = async (): Promise<'pre' | 'live' | 'final'> => {
    const status = parseStatus(await pedir('/data/status.json'));
    if (status.modo === 'pre') {
      mostrarListas(false);
      pre.hidden = false;
      avisar(null);
      return status.modo;
    }
    const [rankings, porSlug] = await Promise.all([pedir('/data/rankings.json'), carregarNomes()]);
    desenhar(parseRankings(rankings), porSlug);
    atualizado = status.atualizado;
    mostrarListas(true);
    pre.hidden = true;
    avisar(null);
    return status.modo;
  };

  const ciclo = async (): Promise<void> => {
    if (emCurso) return;
    emCurso = true;
    try {
      encerrado = (await atualizar()) === 'final';
    } catch {
      // Falha de rede: o que já está na tela fica, com o aviso. Na 1ª carga não há o que manter.
      mostrarListas(Boolean(atualizado));
      avisar(semConexao(atualizado));
    } finally {
      emCurso = false;
    }
    if (!encerrado && !document.hidden) timer = window.setTimeout(ciclo, INTERVALO);
  };

  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden && !encerrado) void ciclo();
  });

  raiz.setAttribute('aria-busy', 'true');
  void ciclo().finally(() => raiz.removeAttribute('aria-busy'));
}

async function pedir(url: string): Promise<unknown> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`${url} respondeu ${resposta.status}`);
  return resposta.json();
}

if (typeof document !== 'undefined') document.querySelectorAll<HTMLElement>('[data-rankings]').forEach(iniciar);
