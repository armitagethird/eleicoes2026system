// Ilha de /historico: o filtro (Brasil, estado, cidade), a seleção de eleições (2018, 2022, 2026; vai e vem pelo hash da URL,
// "#2018,2026") e o 2º turno de 2026 ao vivo no gráfico. O HTML do build já traz o Brasil completo desenhado pelas mesmas
// funções (figura.ts, lib/grafico-linha.ts): a primeira pintura não espera JS nem rede. Aqui só entram o que depende de rede:
// /historico/{br,uf}.json (séries, uma por escopo, baixadas no primeiro uso; a do Brasil já vem no HTML), o ao vivo de /data
// (br.json, uf/{uf}.json ou c/{slug}.json, a cada 20 s, parado com a aba oculta) e /busca.json (no 1º foco do campo).
import { buscar, type EntradaIndice, type ResultadoBusca } from '../../lib/busca.ts';
import { NOME_UF, type UF } from '../../lib/contratos.ts';
import {
  BRASIL,
  ELEICOES_DICA,
  ELEICOES_TRAVADA,
  ERRO_HISTORICO,
  FILTRO_CARREGANDO,
  FILTRO_CIDADE_VAZIA,
  TENTAR_DE_NOVO,
  eleicoesMostradas,
  filtroQuantas,
  historicoDe,
  semConexao,
} from '../../lib/copy.ts';
import { renderTabela } from '../../lib/grafico-linha.ts';
import {
  ANOS,
  alternarAno,
  anoTravado,
  comAoVivo,
  hashDaSelecao,
  lerAoVivo,
  lerHash,
  lerSerieJson,
  pontosDaSelecao,
  pontosDe,
  type Ano,
  type AoVivo,
  type SerieJson,
} from '../../lib/serie-historica.ts';
import { parseStatus, type Modo } from '../../lib/status.ts';
import { figuraHtml, linhaHistorico, mudouDeNumero, rotuloVazio } from './figura.ts';

const INTERVALO = 20_000;
const STATUS_A_CADA = 60_000;
const LIMITE = 8;
// No celular o teclado cobre a metade de baixo da tela: o campo da cidade sobe para o topo.
const TELA_ESTREITA = matchMedia('(max-width: 1023px)');

type Escopo = { tipo: 'br' } | { tipo: 'uf'; uf: UF } | { tipo: 'cidade'; slug: string; nome: string; uf: UF };

const mesmo = (a: Escopo, b: Escopo): boolean =>
  a.tipo === b.tipo && (a.tipo === 'br' || (a.tipo === 'uf' && b.tipo === 'uf' && a.uf === b.uf) || (a.tipo === 'cidade' && b.tipo === 'cidade' && a.slug === b.slug));

// A cidade mora no arquivo da UF dela; o ao vivo de cada escopo é o JSON que o worker já publica para ele.
const arquivoSerie = (e: Escopo): string => (e.tipo === 'br' ? '/historico/br.json' : `/historico/${e.uf.toLowerCase()}.json`);
const arquivoVivo = (e: Escopo): string =>
  e.tipo === 'br' ? '/data/br.json' : e.tipo === 'uf' ? `/data/uf/${e.uf.toLowerCase()}.json` : `/data/c/${e.slug}.json`;

async function pedirJson(url: string, init?: RequestInit): Promise<unknown> {
  const resposta = await fetch(url, init);
  if (!resposta.ok) throw new Error(`${url} respondeu ${resposta.status}`);
  return resposta.json();
}

const series = new Map<string, Promise<SerieJson>>();

/** Uma série, um pedido só por sessão; se falhar, o próximo pedido tenta de novo. */
function carregarSerie(url: string): Promise<SerieJson> {
  let pedido = series.get(url);
  if (!pedido) {
    pedido = pedirJson(url).then((bruto) => {
      const serie = lerSerieJson(bruto);
      if (!serie) throw new Error(`${url} não tem o formato de série`);
      return serie;
    });
    pedido.catch(() => series.delete(url));
    series.set(url, pedido);
  }
  return pedido;
}

let indice: Promise<EntradaIndice[]> | null = null;

function carregarIndice(): Promise<EntradaIndice[]> {
  indice ??= pedirJson('/busca.json').then((bruto) => bruto as EntradaIndice[]);
  indice.catch(() => (indice = null));
  return indice;
}

const pegar = <T extends HTMLElement>(raiz: ParentNode, seletor: string): T => {
  const achado = raiz.querySelector<T>(seletor);
  if (!achado) throw new Error(`/historico: falta ${seletor} no HTML`);
  return achado;
};

const molde = document.createElement('template');

/** Troca o HTML só se mudou (comparando já reanalisado pelo navegador): um ciclo ao vivo sem novidade não repinta nada. */
function trocar(el: HTMLElement, html: string): void {
  molde.innerHTML = html;
  if (el.innerHTML !== molde.innerHTML) el.innerHTML = html;
}

function iniciar(raiz: HTMLElement): void {
  const el = {
    grafico: pegar(raiz, '[data-hist-grafico]'),
    lugar: pegar(raiz, '[data-hist-lugar]'),
    quadro: pegar(raiz, '[data-hist-quadro]'),
    linha: pegar(raiz, '[data-hist-linha]'),
    aviso: pegar(raiz, '[data-hist-aviso]'),
    nota2018: pegar(raiz, '[data-hist-nota-2018]'),
    tabela: pegar(raiz, '[data-hist-tabela]'),
    anuncio: pegar(raiz, '[data-hist-anuncio]'),
    serieDoBuild: pegar(raiz, '[data-hist-serie]'),
    dica: pegar(raiz, '[data-hist-dica]'),
    todas: pegar<HTMLButtonElement>(raiz, '[data-hist-todas]'),
    brasil: pegar<HTMLButtonElement>(raiz, '[data-hist-brasil]'),
    uf: pegar<HTMLSelectElement>(raiz, '[data-hist-uf]'),
    cidade: pegar<HTMLElement>(raiz, '[data-hist-cidade]'),
    campo: pegar<HTMLInputElement>(raiz, '[data-hist-campo]'),
    gaveta: pegar(raiz, '[data-hist-gaveta]'),
    lista: pegar<HTMLUListElement>(raiz, '[data-hist-lista]'),
    cidadeAviso: pegar(raiz, '[data-hist-cidade-aviso]'),
    cidadeStatus: pegar(raiz, '[data-hist-cidade-status]'),
  };

  const botoesAno = Array.from(raiz.querySelectorAll<HTMLButtonElement>('[data-hist-ano]'));

  // Sem JS os controles ficam desabilitados no HTML (não prometem o que não fazem); aqui passam a valer.
  for (const controle of [el.brasil, el.uf, el.campo, el.todas, ...botoesAno]) controle.disabled = false;

  // A série do Brasil vem no HTML: voltar a "Brasil" ou ligar e desligar eleições não espera rede.
  const doBuild = lerSerieJson(JSON.parse(el.serieDoBuild.textContent ?? 'null'));
  if (doBuild) series.set(arquivoSerie({ tipo: 'br' }), Promise.resolve(doBuild));

  // No /design o modo vem de ?modo= (pre, live ou final), para ver o gráfico nos três sem trocar o status.json.
  const design = raiz.hasAttribute('data-design');
  let modo: Modo = design ? parseStatus({ modo: new URL(location.href).searchParams.get('modo') }).modo : (raiz.dataset.modo as Modo);
  const inicio = raiz.dataset.inicio || null;

  let escopo: Escopo = { tipo: 'br' };
  // As eleições à vista: o hash da URL manda (link compartilhado); sem hash, todas.
  let anos: Ano[] = lerHash(location.hash);
  let serie: SerieJson | null = null;
  let vivo: AoVivo | null = null;
  let falhou = false;
  let etag: string | null = null;
  let timer: number | undefined;
  // Cada mudança de escopo ou de modo abre uma geração; resposta de uma geração velha é descartada.
  let geracao = 0;

  const lugar = (): string => (escopo.tipo === 'br' ? BRASIL : escopo.tipo === 'uf' ? NOME_UF[escopo.uf] : `${escopo.nome} (${escopo.uf})`);

  const avisar = (html: string | null): void => {
    el.aviso.hidden = html === null;
    el.aviso.innerHTML = html ?? '';
  };

  const marcarControles = (): void => {
    el.brasil.setAttribute('aria-pressed', String(escopo.tipo === 'br'));
    el.uf.value = escopo.tipo === 'uf' ? escopo.uf : '';
    el.uf.toggleAttribute('data-ativo', escopo.tipo === 'uf');
    el.cidade.toggleAttribute('data-ativo', escopo.tipo === 'cidade');
    if (escopo.tipo !== 'cidade' && document.activeElement !== el.campo) el.campo.value = '';
  };

  // A única eleição ligada fica travada (aria-disabled, não disabled: continua no foco e o leitor de tela diz por que não desliga).
  const marcarAnos = (): void => {
    for (const botao of botoesAno) {
      const ano = Number(botao.dataset.histAno) as Ano;
      const travado = anoTravado(anos, ano);
      botao.setAttribute('aria-pressed', String(anos.includes(ano)));
      for (const [nome, valor] of [['aria-disabled', 'true'], ['aria-describedby', el.dica.id]]) {
        if (travado) botao.setAttribute(nome, valor);
        else botao.removeAttribute(nome);
      }
    }
    el.todas.setAttribute('aria-pressed', String(anos.length === ANOS.length));
    el.dica.textContent = anos.length === 1 ? ELEICOES_TRAVADA : ELEICOES_DICA;
  };

  const querVivo = (): boolean => modo !== 'pre' && anos.includes(2026);

  const desenhar = (): void => {
    if (!serie) return;
    const pontos = pontosDe(serie, escopo.tipo === 'cidade' ? escopo.slug : undefined);
    if (!pontos) {
      avisar(`${ERRO_HISTORICO} <button type="button" data-hist-tentar>${TENTAR_DE_NOVO}</button>`);
      return;
    }
    const dados = {
      pontos: comAoVivo(pontos, vivo),
      anos,
      lugar: lugar(),
      vazio: rotuloVazio(modo, inicio),
      nomes: serie.cand.flatMap((c) => [c.a.nome, c.b.nome]),
    };
    trocar(el.quadro, figuraHtml(dados, 'hist'));
    trocar(el.tabela, renderTabela(dados));
    el.lugar.textContent = dados.lugar;
    // A linha fala do 2º turno de 2026 e a nota, do 17 de 2018: só aparecem com essas eleições à vista.
    el.linha.textContent = anos.includes(2026) ? linhaHistorico(modo, inicio, vivo) : '';
    el.nota2018.hidden = !mudouDeNumero(pontosDaSelecao(dados.pontos, anos));
    // Falha de rede no ao vivo: o que está na tela fica, com o aviso e a hora da última leitura.
    avisar(falhou && vivo ? semConexao(vivo.atualizado) : null);
  };

  const lerVivo = async (minha: number): Promise<void> => {
    clearTimeout(timer);
    try {
      // no-store: o navegador não guarda nem revalida por conta própria, então o 304 chega aqui e o ETag é o nosso.
      const resposta = await fetch(arquivoVivo(escopo), { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {} });
      if (minha !== geracao) return;
      if (resposta.status !== 304) {
        if (!resposta.ok) throw new Error(`${arquivoVivo(escopo)} respondeu ${resposta.status}`);
        const novo = lerAoVivo(await resposta.json(), modo);
        // Uma borda do CDN pode servir um arquivo mais velho depois de um novo: o gráfico nunca volta no tempo.
        if (!(novo && vivo && Date.parse(novo.atualizado) < Date.parse(vivo.atualizado))) vivo = novo;
        etag = resposta.headers.get('ETag');
      }
      falhou = false;
    } catch {
      if (minha !== geracao) return;
      falhou = true;
    }
    desenhar();
    if (modo === 'live' && !document.hidden && anos.includes(2026)) timer = window.setTimeout(() => void lerVivo(minha), INTERVALO);
  };

  const irPara = async (novo: Escopo): Promise<void> => {
    if (serie && mesmo(novo, escopo)) return;
    const minha = ++geracao;
    clearTimeout(timer);
    el.grafico.setAttribute('aria-busy', 'true');
    avisar(null);
    try {
      const nova = await carregarSerie(arquivoSerie(novo));
      if (minha !== geracao) return;
      escopo = novo;
      serie = nova;
      vivo = null;
      etag = null;
      falhou = false;
      marcarControles();
      desenhar();
      el.anuncio.textContent = historicoDe(lugar());
      if (querVivo()) void lerVivo(minha);
    } catch {
      if (minha !== geracao) return;
      marcarControles();
      avisar(`${ERRO_HISTORICO} <button type="button" data-hist-tentar>${TENTAR_DE_NOVO}</button>`);
    } finally {
      if (minha === geracao) {
        el.grafico.removeAttribute('aria-busy');
        raiz.removeAttribute('data-aguarda');
      }
    }
  };

  // Liga e desliga eleições. Sem a série carregada (1ª vez, ou erro), `irPara` carrega e desenha já com a seleção nova.
  const escolherAnos = async (novos: Ano[]): Promise<void> => {
    const tinha2026 = anos.includes(2026);
    anos = novos;
    marcarAnos();
    history.replaceState(null, '', `${location.pathname}${location.search}${hashDaSelecao(anos)}`);
    if (!serie) await irPara(escopo);
    else {
      desenhar();
      // O 2026 voltou à vista: o ao vivo (parado enquanto estava fora) é lido já, sem esperar o ciclo de 20 s.
      if (querVivo() && !tinha2026) void lerVivo(geracao);
    }
    el.anuncio.textContent = eleicoesMostradas(anos);
  };

  // ---- controles ----

  el.brasil.addEventListener('click', () => void irPara({ tipo: 'br' }));
  el.uf.addEventListener('change', () => void irPara(el.uf.value ? { tipo: 'uf', uf: el.uf.value as UF } : { tipo: 'br' }));
  raiz.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('[data-hist-tentar]')) return;
    const destino = escopo;
    serie = null;
    void irPara(destino);
  });

  for (const botao of botoesAno) {
    botao.addEventListener('click', () => {
      const ano = Number(botao.dataset.histAno) as Ano;
      if (anoTravado(anos, ano)) el.anuncio.textContent = `${ELEICOES_TRAVADA}.`;
      else void escolherAnos(alternarAno(anos, ano));
    });
  }
  el.todas.addEventListener('click', () => {
    if (anos.length < ANOS.length) void escolherAnos([...ANOS]);
  });
  // Voltar e avançar no histórico, ou um link com outro hash colado na mesma aba.
  addEventListener('hashchange', () => void escolherAnos(lerHash(location.hash)));

  // Combobox ARIA 1.2 da cidade, sobre o mesmo /busca.json da home (lib/busca.ts).
  let carregado: EntradaIndice[] | null = null;
  let resultados: ResultadoBusca[] = [];
  let ativo = -1;
  const idLista = el.lista.id;

  const abrir = (aberta: boolean): void => {
    el.gaveta.hidden = !aberta;
    el.campo.setAttribute('aria-expanded', String(aberta && resultados.length > 0));
  };

  const marcar = (i: number): void => {
    ativo = i;
    Array.from(el.lista.children).forEach((op, j) => op.setAttribute('aria-selected', String(j === i)));
    if (i < 0) {
      el.campo.removeAttribute('aria-activedescendant');
      return;
    }
    const op = el.lista.children[i];
    el.campo.setAttribute('aria-activedescendant', op.id);
    op.scrollIntoView({ block: 'nearest' });
  };

  const avisarCidade = (texto: string | null): void => {
    el.cidadeAviso.hidden = texto === null;
    el.cidadeAviso.textContent = texto ?? '';
  };

  const opcao = (r: ResultadoBusca, i: number): HTMLLIElement => {
    const li = document.createElement('li');
    li.id = `${idLista}-op-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.setAttribute('aria-label', `${r.nome} (${r.uf})`);
    const nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = r.nome;
    const sigla = document.createElement('span');
    sigla.className = 'uf';
    sigla.textContent = r.uf;
    li.append(nome, sigla);
    return li;
  };

  const desenharLista = (): void => {
    resultados = [];
    marcar(-1);
    el.lista.replaceChildren();
    if (el.campo.value.trim() === '') {
      avisarCidade(null);
      abrir(false);
      el.cidadeStatus.textContent = '';
      return;
    }
    if (!carregado) {
      avisarCidade(FILTRO_CARREGANDO);
      abrir(true);
      return;
    }
    resultados = buscar(carregado, el.campo.value, LIMITE);
    avisarCidade(resultados.length ? null : FILTRO_CIDADE_VAZIA);
    abrir(true);
    el.lista.replaceChildren(...resultados.map(opcao));
    el.cidadeStatus.textContent = resultados.length ? filtroQuantas(resultados.length) : FILTRO_CIDADE_VAZIA;
  };

  let pedidoIndice: Promise<void> | null = null;
  const garantirIndice = (): void => {
    pedidoIndice ??= carregarIndice().then(
      (i) => {
        carregado = i;
        if (document.activeElement === el.campo) desenharLista();
      },
      () => {
        pedidoIndice = null;
        avisarCidade(ERRO_HISTORICO);
      },
    );
  };

  const escolher = (r: ResultadoBusca): void => {
    el.campo.value = r.nome;
    abrir(false);
    marcar(-1);
    void irPara({ tipo: 'cidade', slug: r.slug, nome: r.nome, uf: r.uf as UF });
  };

  el.campo.addEventListener('focus', () => {
    if (TELA_ESTREITA.matches) el.cidade.scrollIntoView({ block: 'start' });
    garantirIndice();
    desenharLista();
  });
  el.campo.addEventListener('input', () => {
    desenharLista();
    garantirIndice();
  });
  el.campo.addEventListener('blur', () => abrir(false));
  el.campo.addEventListener('keydown', (e) => {
    const total = resultados.length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!total) return;
        e.preventDefault();
        if (el.gaveta.hidden) abrir(true);
        const passo = e.key === 'ArrowDown' ? 1 : -1;
        marcar(ativo < 0 && passo < 0 ? total - 1 : (ativo + passo + total) % total);
        return;
      }
      case 'Enter': {
        const escolhido = resultados[Math.max(ativo, 0)];
        if (!escolhido) return;
        e.preventDefault();
        escolher(escolhido);
        return;
      }
      case 'Escape':
        if (!el.gaveta.hidden) {
          e.preventDefault();
          abrir(false);
          marcar(-1);
        } else if (el.campo.value) {
          e.preventDefault();
          el.campo.value = '';
          desenharLista();
        }
    }
  });
  // mousedown sem ação padrão: o foco fica no campo, a gaveta não fecha antes do clique chegar.
  el.gaveta.addEventListener('mousedown', (e) => e.preventDefault());
  el.lista.addEventListener('click', (e) => {
    const i = Array.from(el.lista.children).indexOf((e.target as Element).closest('[role="option"]') as Element);
    if (resultados[i]) escolher(resultados[i]);
  });

  // ---- tempo: pausa com a aba oculta; o modo do site muda de pre para live no dia 25 ----

  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden && modo === 'live' && serie && anos.includes(2026)) void lerVivo(geracao);
  });

  // Link com hash (#2018,2026): a seleção já vem aplicada. Sem hash, o HTML do build (todas as eleições) já é o desenho certo.
  marcarAnos();
  if (anos.length < ANOS.length) void irPara(escopo);
  else raiz.removeAttribute('data-aguarda');

  if (!design) {
    const conferirStatus = (): void => {
      if (document.hidden || modo === 'final') return;
      pedirJson('/data/status.json', { cache: 'no-store' }).then(
        (bruto) => {
          const novo = parseStatus(bruto).modo;
          if (novo === modo) return;
          modo = novo;
          serie = null;
          void irPara(escopo);
        },
        () => undefined,
      );
    };
    conferirStatus();
    window.setInterval(conferirStatus, STATUS_A_CADA);
  } else if (modo !== 'pre') void irPara(escopo);
}

const raiz = document.querySelector<HTMLElement>('[data-historico]');
if (raiz) iniciar(raiz);
