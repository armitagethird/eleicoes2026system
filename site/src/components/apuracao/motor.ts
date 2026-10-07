// Motor do mapa municipal de /apuracao: canvas 2D, sem biblioteca de mapa. A página monta, passa a camada e ouve.
//
// Geometria (public/geo, formato em lib/geo-mapa.ts): ufs.json pinta primeiro; municipios.json (o Brasil inteiro,
// simplificado) chega depois da primeira pintura; uf/{uf}.json (detalhe e nomes) quando a UF entra em foco ou quando o
// zoom passa do que a malha nacional aguenta. Cada polígono vira um Path2D uma vez; trocar de camada só troca o tom.
//
// Interação: no Brasil a unidade é a UF (tocar entra nela); numa UF em foco, o município; tocar fora volta ao Brasil.
// Os callbacks só disparam por ação do usuário no mapa: os métodos (focarUf, selecionar) não chamam de volta.
// O acerto do toque vem de um canvas de escolha (cor única por polígono), lido num pixel; nunca ponto-em-polígono.
import type { Camada, Valor } from '../../lib/camada-mapa.ts';
import { NOME_UF, type UF } from '../../lib/contratos.ts';
import { BRASIL, MAPA_TECLAS, rotuloMotor, turnoDaCamada } from '../../lib/copy.ts';
import { PALETA, TOM_SEM_DADO, tonalizador, type ModoCor } from '../../lib/cores-mapa.ts';
import {
  arcosDeBorda,
  CODIGO_DA_UF,
  lerMalha,
  tracarArcos,
  tracarFeicao,
  type Malha,
  type MalhaJson,
} from '../../lib/geo-mapa.ts';
import { enquadrar, limitar, suave, voo, zoomEm, type Caixa, type Camera } from './motor-camera.ts';
import { ligarGestos } from './motor-gestos.ts';

export type { ModoCor };
export type Selecao = { tipo: 'uf'; uf: UF } | { tipo: 'municipio'; ibge: number; uf: UF };

export interface OpcoesMapa {
  /** Pasta da geometria. Padrão '/geo'. */
  geoBase?: string;
  /** Clique, toque ou Enter num polígono (null = tocou fora). */
  aoSelecionar?: (sel: Selecao | null) => void;
  /** Mouse passando, ou o ponteiro do teclado andando. */
  aoPassar?: (sel: Selecao | null) => void;
  /** Drill-down feito no mapa (null = Brasil). */
  aoMudarFoco?: (uf: UF | null) => void;
  /** Adição opcional: falha ao baixar ou ler a geometria. Sem ela, vai para reportError (console e evento 'error'). */
  aoErro?: (erro: Error) => void;
}

export interface MotorMapa {
  definirCamada(camada: Camada, referencia?: Camada | null): void;
  definirModo(modo: ModoCor): void;
  /** Vai para a UF (ou o Brasil) e a enquadra inteira. */
  focarUf(uf: UF | null): Promise<void>;
  /** Marca a seleção; entra na UF dela se for outra e traz o município para a tela. Não chama aoSelecionar. */
  selecionar(sel: Selecao | null): Promise<void>;
  destruir(): void;
}

/** Duração, em ms, do último quadro e da última recoloração (lida pela bancada /design/apuracao-motor). */
export const medidas = { quadro: 0, recolorir: 0 };

const DURACAO_VOO = 380;
const DURACAO_ENTRADA = 240;
const DPR_MAXIMO = 2;
/** Em movimento, o quadro sai em no máximo 1 px por px CSS e no máximo nestes pixels (a GPU rasteriza por pixel). */
const PIXELS_EM_MOVIMENTO = 400_000;
/** Zoom máximo: 60 m por px de tela (o menor município, ~2 km, fica com ~33 px). */
const K_MAXIMO = 1 / 60;
/** Abaixo de 600 m por px a malha nacional (grade de 400 m) já mostra degrau: carrega o detalhe das UFs à vista. */
const K_DETALHE = 1 / 600;
/** Inércia do arrasto: constante de tempo do decaimento (ms) e velocidade mínima (px/ms). */
const TAU_INERCIA = 325;
const VELOCIDADE_MINIMA = 0.15;

/**
 * As feições de uma UF numa malha. O quadro pinta por (UF, tom), não por polígono: algumas centenas de fill em vez de
 * 5.571, o que mantém o arrasto fluido com a CPU lenta. Os anéis vêm orientados do build (externo horário, buraco
 * anti-horário), então juntar vizinhos num caminho só e pintar com 'nonzero' não vaza enclave (Ladário em Corumbá).
 */
interface Grupo {
  /** Caixa da UF nesta malha, em metros. */
  caixa: Caixa;
  indices: number[];
  /** A UF inteira num caminho: contexto neutro e escolha no nível de UF. */
  todos: Path2D;
  /** Montado na hora de pintar em cor (null depois de recolorir): UF fora da tela ou neutra não paga a remontagem. */
  porTom: Map<number, Path2D> | null;
  /** Divisas municipais (só nas malhas de municípios). */
  divisas: Path2D | null;
}

interface Desenho {
  malha: Malha;
  caminhos: Path2D[];
  /** Caixa de cada feição em metros, quatro números por feição. */
  caixas: Float64Array;
  tons: Uint8Array;
  grupos: Map<UF, Grupo>;
  /** Divisas entre UFs, costa e fronteira. */
  bordas: Path2D;
  indice: Map<number, number>;
  /** ufs.json: o valor vem de camada.ufs, não de camada.municipios. */
  deUfs: boolean;
}

// Cor de escolha: o índice embaralhado por um multiplicador ímpar (bijeção em 24 bits). A borda de dois polígonos,
// suavizada pelo antisserrilhado, vira uma cor que quase nunca decodifica para um índice válido.
const EMBARALHA = 0x9e3779;
const DESEMBARALHA = (() => {
  let inverso = EMBARALHA;
  for (let i = 0; i < 4; i++) inverso = Math.imul(inverso, 2 - Math.imul(EMBARALHA, inverso));
  return inverso & 0xffffff;
})();
const corDeEscolha = (id: number): string => `#${(Math.imul(id, EMBARALHA) & 0xffffff).toString(16).padStart(6, '0')}`;
const idDaCor = (r: number, g: number, b: number): number => Math.imul((r << 16) | (g << 8) | b, DESEMBARALHA) & 0xffffff;

const mesma = (a: Selecao | null, b: Selecao | null): boolean =>
  a === b || (!!a && !!b && a.tipo === b.tipo && (a.tipo === 'uf' ? a.uf === b.uf : a.ibge === (b as typeof a).ibge));

let contador = 0;

export function montarMapa(el: HTMLElement, o: OpcoesMapa = {}): MotorMapa {
  const geoBase = o.geoBase ?? '/geo';
  const abortar = new AbortController();
  const movimentoReduzido = matchMedia('(prefers-reduced-motion: reduce)');
  const falhar = (erro: unknown) => {
    if (abortar.signal.aborted) return;
    const e = erro instanceof Error ? erro : new Error(String(erro));
    if (o.aoErro) o.aoErro(e);
    else reportError(e);
  };

  // ---------- DOM ----------
  const canvas = document.createElement('canvas');
  const instrucoes = document.createElement('p');
  const anuncio = document.createElement('p');
  instrucoes.id = `mapa-teclas-${++contador}`;
  instrucoes.className = anuncio.className = 'sr-only';
  instrucoes.textContent = MAPA_TECLAS;
  anuncio.setAttribute('aria-live', 'polite');
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-describedby', instrucoes.id);
  Object.assign(canvas.style, {
    display: 'block',
    width: '100%',
    height: '100%',
    touchAction: 'pan-y',
    userSelect: 'none',
    webkitTapHighlightColor: 'transparent',
    outlineOffset: '-3px',
  });
  el.append(canvas, instrucoes, anuncio);
  const tela = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
  // Em movimento o quadro sai num rascunho de até PIXELS_EM_MOVIMENTO e é ampliado na tela: a rasterização na GPU cresce
  // com os pixels, e na densidade da tela o voo e o arrasto perdiam quadro. Parado, redesenha na densidade da tela.
  const rascunho = document.createElement('canvas');
  const rctx = rascunho.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
  let ctx = tela;
  let escala = 1;
  let escalaRascunho = 1;
  const escolha = document.createElement('canvas');
  const ectx = escolha.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

  // Tokens do CSS da página: a paleta do mapa usa var(--surface-2) e var(--ink-2), e o traço usa --bg e --ink.
  const estilo = getComputedStyle(el);
  const token = (nome: string) => estilo.getPropertyValue(nome).trim() || '#808080';
  const cores = PALETA.map((c) => (c.startsWith('var(') ? token(c.slice(4, -1)) : c));
  const FUNDO = token('--bg');
  const TINTA = token('--ink');
  const CONTEXTO = token('--surface-1');
  // RGB de cada cor, lido de um pixel (vale qualquer sintaxe de cor do CSS): o contexto mistura o tom com o neutro.
  const amostra = document.createElement('canvas').getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const rgb = (cor: string): number[] => {
    amostra.fillStyle = cor;
    amostra.fillRect(0, 0, 1, 1);
    return [...amostra.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const rgbCores = cores.map(rgb);
  const rgbContexto = rgb(CONTEXTO);
  const misturar = (t: number, f: number): string =>
    `rgb(${rgbCores[t].map((c, i) => Math.round(c + (rgbContexto[i] - c) * f)).join(',')})`;

  // ---------- estado ----------
  let largura = 0;
  let altura = 0;
  let dpr = 1;
  let cam: Camera = { x: 0, y: 0, k: 1e-4 };
  let kMinimo = 1e-4;
  let brasil: Caixa = [0, 0, 1, 1];
  let ajustado = true;
  let ufs: Desenho | null = null;
  let nacional: Desenho | null = null;
  const detalhes = new Map<UF, Desenho>();
  const pedidos = new Set<UF>();
  const contornos = new Map<UF, Path2D>();
  let camada: Camada | null = null;
  let referencia: Camada | null = null;
  let modo: ModoCor = 'resultado';
  let tom: ReturnType<typeof tonalizador> | null = null;
  let foco: UF | null = null;
  /** A UF que o desenho destaca, com `realce` de 0 (Brasil colorido) a 1 (resto neutro); segue o foco com animação. */
  let destaque: UF | null = null;
  let realce = 0;
  let realceAlvo = 0;
  let entrada = 1;
  let selecao: Selecao | null = null;
  let passando: Selecao | null = null;
  let ponteiro: Selecao | null = null;
  let gesto = false;
  let escolhaSuja = true;
  let registro: Selecao[] = [];
  let pedido = 0;
  let animacao: { passo: (agora: number) => boolean; fim: () => void } | null = null;

  // ---------- geometria ----------
  async function baixarJson(caminho: string): Promise<MalhaJson> {
    const resposta = await fetch(`${geoBase}/${caminho}`, { signal: abortar.signal });
    if (!resposta.ok) throw new Error(`Geometria ${geoBase}/${caminho}: HTTP ${resposta.status}`);
    return (await resposta.json()) as MalhaJson;
  }
  const baixarMalha = async (caminho: string): Promise<Malha> => lerMalha(await baixarJson(caminho));

  /**
   * Montar a malha de uma UF (decodificar e criar os Path2D) leva dezenas de ms com a CPU lenta: espera a câmera parar,
   * uma por quadro, para o voo e o arrasto não perderem quadro. O download começa na hora.
   */
  const fila: Array<() => void> = [];
  let parado = 0;
  function quandoParado(tarefa: () => void): void {
    fila.push(tarefa);
    pedir();
  }

  function criarDesenho(malha: Malha, deUfs: boolean): Desenho {
    const n = malha.feicoes.length;
    const caminhos = malha.feicoes.map((f) => {
      const p = new Path2D();
      tracarFeicao(malha, f, p);
      return p;
    });
    const caixas = new Float64Array(4 * n);
    malha.feicoes.forEach((f, i) => f.caixa.forEach((v, j) => (caixas[4 * i + j] = v * malha.metros)));
    const bordas = new Path2D();
    tracarArcos(malha, arcosDeBorda(malha), bordas);
    const grupos = new Map<UF, Grupo>();
    const arcosPorUf = new Map<UF, Set<number>>();
    malha.feicoes.forEach((f, i) => {
      let g = grupos.get(f.uf);
      if (!g) {
        g = { caixa: [Infinity, Infinity, -Infinity, -Infinity], indices: [], todos: new Path2D(), porTom: null, divisas: null };
        grupos.set(f.uf, g);
        arcosPorUf.set(f.uf, new Set());
      }
      g.indices.push(i);
      g.todos.addPath(caminhos[i]);
      g.caixa = [
        Math.min(g.caixa[0], caixas[4 * i]),
        Math.min(g.caixa[1], caixas[4 * i + 1]),
        Math.max(g.caixa[2], caixas[4 * i + 2]),
        Math.max(g.caixa[3], caixas[4 * i + 3]),
      ];
      const arcos = arcosPorUf.get(f.uf) as Set<number>;
      for (const anel of f.aneis) for (const ref of anel) arcos.add(ref < 0 ? ~ref : ref);
    });
    if (!deUfs) {
      for (const [uf, arcos] of arcosPorUf) {
        const p = new Path2D();
        tracarArcos(malha, arcos, p);
        (grupos.get(uf) as Grupo).divisas = p;
      }
    }
    const d: Desenho = {
      malha,
      caminhos,
      caixas,
      tons: new Uint8Array(n),
      grupos,
      bordas,
      indice: new Map(malha.feicoes.map((f, i) => [f.codigo, i])),
      deUfs,
    };
    tingir(d);
    // Malha nova chega em tarefa ociosa (quandoParado ou carga): monta os lotes já, não no primeiro quadro de um voo.
    for (const g of grupos.values()) porTom(d, g);
    return d;
  }

  function garantirDetalhe(uf: UF): void {
    if (detalhes.has(uf) || pedidos.has(uf)) return;
    pedidos.add(uf);
    baixarJson(`uf/${uf.toLowerCase()}.json`)
      .then((json) =>
        quandoParado(() => {
          detalhes.set(uf, criarDesenho(lerMalha(json), false));
          contornos.delete(uf);
          sujar();
        }),
      )
      .catch((erro: unknown) => {
        pedidos.delete(uf);
        falhar(erro);
      });
  }

  /** Detalhe das UFs à vista quando o zoom passa do que a malha nacional aguenta. */
  function detalharVisiveis(): void {
    if (!ufs || cam.k < K_DETALHE) return;
    const j = janela();
    for (const [uf, g] of ufs.grupos) if (cruzaCaixa(g.caixa, j)) garantirDetalhe(uf);
  }

  // ---------- cor ----------
  function tingir(d: Desenho): void {
    const ref = modo === 'variacao' ? referencia : null;
    d.malha.feicoes.forEach((f, i) => {
      let v: Valor | undefined;
      let antes: Valor | undefined;
      if (camada && d.deUfs) {
        v = camada.ufs.get(f.uf);
        antes = ref?.ufs.get(f.uf);
      } else if (camada) {
        v = camada.municipios.get(f.codigo);
        antes = ref?.municipios.get(f.codigo);
      }
      d.tons[i] = tom ? tom(v, antes) : TOM_SEM_DADO;
    });
    for (const g of d.grupos.values()) g.porTom = null;
  }

  function porTom(d: Desenho, g: Grupo): Map<number, Path2D> {
    if (g.porTom) return g.porTom;
    const mapa = new Map<number, Path2D>();
    for (const i of g.indices) {
      let p = mapa.get(d.tons[i]);
      if (!p) mapa.set(d.tons[i], (p = new Path2D()));
      p.addPath(d.caminhos[i]);
    }
    return (g.porTom = mapa);
  }

  function recolorir(): void {
    const t0 = performance.now();
    tom = camada ? tonalizador(modo, camada.candidatos, referencia?.candidatos) : null;
    for (const d of desenhos()) tingir(d);
    medidas.recolorir = performance.now() - t0;
    atualizarRotulo();
    pedir();
  }

  const desenhos = (): Desenho[] => [ufs, nacional, ...detalhes.values()].filter((d): d is Desenho => d !== null);

  // ---------- câmera ----------
  const janela = (): Caixa => [
    cam.x - largura / 2 / cam.k,
    cam.y - altura / 2 / cam.k,
    cam.x + largura / 2 / cam.k,
    cam.y + altura / 2 / cam.k,
  ];
  const cruzaCaixa = (c: Caixa, j: Caixa): boolean => c[0] <= j[2] && c[2] >= j[0] && c[1] <= j[3] && c[3] >= j[1];
  const cruza = (d: Desenho, i: number, j: Caixa): boolean =>
    d.caixas[4 * i] <= j[2] && d.caixas[4 * i + 2] >= j[0] && d.caixas[4 * i + 1] <= j[3] && d.caixas[4 * i + 3] >= j[1];
  const margem = () => Math.max(12, Math.round(Math.min(largura, altura) * 0.04));
  const caixaUf = (uf: UF): Caixa => {
    const i = ufs?.indice.get(CODIGO_DA_UF[uf]);
    if (!ufs || i === undefined) return brasil;
    return [ufs.caixas[4 * i], ufs.caixas[4 * i + 1], ufs.caixas[4 * i + 2], ufs.caixas[4 * i + 3]];
  };
  const enquadramento = (uf: UF | null): Camera => enquadrar(uf ? caixaUf(uf) : brasil, largura, altura, margem());
  const limitado = (c: Camera): Camera => limitar(c, brasil, kMinimo, Math.max(K_MAXIMO, kMinimo), largura, altura);

  function definirCamera(c: Camera): void {
    cam = c;
    escolhaSuja = true;
    // Ampliado, o mapa fica com todos os gestos; no tamanho inteiro, deslizar na vertical rola a página.
    const toque = cam.k > kMinimo * 1.02 ? 'none' : 'pan-y';
    if (canvas.style.touchAction !== toque) canvas.style.touchAction = toque;
    pedir();
  }

  /** Interrompida no meio (um gesto, outro voo), a animação deixa o realce no destino: nunca meio apagado. */
  function pararAnimacao(): void {
    const a = animacao;
    if (!a) return;
    animacao = null;
    realce = realceAlvo;
    if (realce === 0) destaque = null;
    a.fim();
  }

  function animar(passo: (agora: number) => boolean): Promise<void> {
    if (animacao) pararAnimacao();
    return new Promise((resolve) => {
      animacao = { passo, fim: resolve };
      pedir();
    });
  }

  /** Voa até a câmera e leva o realce junto; com movimento reduzido, chega na hora. */
  function voar(destino: Camera, realceFinal = realceAlvo): Promise<void> {
    const alvo = limitado(destino);
    pararAnimacao();
    realceAlvo = realceFinal;
    if (movimentoReduzido.matches || !largura) {
      realce = realceAlvo;
      if (realce === 0) destaque = null;
      definirCamera(alvo);
      detalharVisiveis();
      return Promise.resolve();
    }
    const caminho = voo(cam, alvo, largura);
    const realceInicial = realce;
    const inicio = performance.now();
    return animar((agora) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_VOO);
      const e = suave(t);
      realce = realceInicial + (realceFinal - realceInicial) * e;
      definirCamera(t < 1 ? caminho(e) : alvo);
      if (t < 1) return true;
      if (realce === 0) destaque = null;
      detalharVisiveis();
      return false;
    });
  }

  function focar(uf: UF | null): Promise<void> {
    foco = uf;
    if (uf) {
      destaque = uf;
      garantirDetalhe(uf);
    }
    ajustado = true;
    ponteiro = null;
    atualizarRotulo();
    return voar(enquadramento(uf), uf ? 1 : 0);
  }

  /** Município fora da tela (ou maior que ela): a câmera vai até ele, sem aproximar mais do que já está. */
  function mostrar(uf: UF, ibge: number): Promise<void> {
    const d = detalhes.get(uf) ?? nacional;
    const i = d?.indice.get(ibge);
    if (!d || i === undefined) return Promise.resolve();
    const c: Caixa = [d.caixas[4 * i], d.caixas[4 * i + 1], d.caixas[4 * i + 2], d.caixas[4 * i + 3]];
    const j = janela();
    if (c[0] >= j[0] && c[2] <= j[2] && c[1] >= j[1] && c[3] <= j[3]) return Promise.resolve();
    const alvo = enquadrar(c, largura, altura, margem());
    return voar({ x: alvo.x, y: alvo.y, k: Math.min(cam.k, alvo.k) });
  }

  // ---------- desenho ----------
  function pedir(): void {
    if (!pedido) pedido = requestAnimationFrame(quadro);
  }

  function quadro(agora: number): void {
    pedido = 0;
    if (animacao && !animacao.passo(agora)) {
      const a = animacao;
      animacao = null;
      a.fim();
    }
    desenhar();
    parado = animacao || gesto ? 0 : parado + 1;
    if (animacao) pedir();
    // Só depois de um quadro inteiro parado: o quadro em que o voo pousa sai antes da tarefa pesada, sem tranco.
    else if (fila.length && !abortar.signal.aborted) {
      if (parado > 1) (fila.shift() as () => void)();
      if (fila.length || parado <= 1) pedir();
    }
  }

  /** Transforma da grade da malha para pixels do canvas; devolve px do canvas por unidade da grade. */
  function transformar(c: CanvasRenderingContext2D, m: number, densidade: number): number {
    const s = densidade * cam.k * m;
    c.setTransform(s, 0, 0, s, densidade * (largura / 2 - cam.x * cam.k), densidade * (altura / 2 - cam.y * cam.k));
    return s;
  }

  /** Malha mais fina que existe para a UF: detalhe, nacional ou só o contorno da UF. */
  const malhaDa = (uf: UF): Desenho | null => detalhes.get(uf) ?? nacional ?? ufs;

  /**
   * Pinta as UFs de `d` aceitas por `aceita`, cada (UF, tom) num fill, com a cor do tom misturada ao neutro do contexto
   * na fração `neutro` (1 = a UF inteira neutra, num fill só). Misturar a cor é o mesmo que pintar o neutro por cima com
   * opacidade, num passe só em vez de dois: o drill-down esmaece o resto do Brasil sem dobrar o custo do quadro.
   * Vizinhos de tons diferentes deixam, na borda comum, um fio do fundo vazando pelo antisserrilhado (escurece onde os
   * municípios são pequenos). Parado, um traço de 1 px do canvas na cor do próprio tom fecha o fio. Em movimento o traço
   * sai: é o que mais pesa na rasterização (a GPU refaz o contorno de todos os vértices a cada quadro) e o fio não se vê
   * com o mapa andando.
   */
  function pintar(d: Desenho, aceita: (uf: UF) => boolean, j: Caixa, neutro = 0): void {
    const costura = !animacao && !gesto;
    ctx.lineWidth = 1 / transformar(ctx, d.malha.metros, escala);
    ctx.lineJoin = 'bevel';
    for (const [uf, g] of d.grupos) {
      if (!aceita(uf) || !cruzaCaixa(g.caixa, j)) continue;
      for (const [t, p] of neutro >= 1 ? [[-1, g.todos] as const] : porTom(d, g)) {
        ctx.fillStyle = ctx.strokeStyle = t < 0 ? CONTEXTO : neutro > 0 ? misturar(t, neutro) : cores[t];
        ctx.fill(p);
        if (costura) ctx.stroke(p);
      }
    }
  }

  /** Pinta o Brasil (menos `fora`): cada UF na malha mais fina que houver. */
  function pintarBrasil(j: Caixa, fora: UF | null, neutro: number): void {
    if (!nacional) return;
    pintar(nacional, (uf) => uf !== fora && !detalhes.has(uf), j, neutro);
    for (const [uf, d] of detalhes) if (uf !== fora) pintar(d, () => true, j, neutro);
  }

  function tracar(d: Desenho, caminho: Path2D, cor: string, px: number): void {
    const s = transformar(ctx, d.malha.metros, escala);
    ctx.strokeStyle = cor;
    ctx.lineWidth = (px * escala) / s;
    ctx.stroke(caminho);
  }

  /** Contorno de uma UF na malha mais fina carregada (no detalhe, as bordas do arquivo são o contorno da UF). */
  function contornoUf(uf: UF): { d: Desenho; caminho: Path2D } | null {
    const detalhe = detalhes.get(uf);
    if (detalhe) return { d: detalhe, caminho: detalhe.bordas };
    if (!nacional) {
      const i = ufs?.indice.get(CODIGO_DA_UF[uf]);
      return ufs && i !== undefined ? { d: ufs, caminho: ufs.caminhos[i] } : null;
    }
    let caminho = contornos.get(uf);
    if (!caminho) {
      const usos = new Map<number, number>();
      for (const f of nacional.malha.feicoes) {
        if (f.uf !== uf) continue;
        for (const anel of f.aneis) for (const ref of anel) usos.set(ref < 0 ? ~ref : ref, (usos.get(ref < 0 ? ~ref : ref) ?? 0) + 1);
      }
      caminho = new Path2D();
      tracarArcos(nacional.malha, [...usos].filter(([, n]) => n === 1).map(([a]) => a), caminho);
      contornos.set(uf, caminho);
    }
    return { d: nacional, caminho };
  }

  function contornoDe(sel: Selecao): { d: Desenho; caminho: Path2D } | null {
    if (sel.tipo === 'uf') return contornoUf(sel.uf);
    const d = detalhes.get(sel.uf) ?? nacional;
    const i = d?.indice.get(sel.ibge);
    return d && i !== undefined ? { d, caminho: d.caminhos[i] } : null;
  }

  function realcar(sel: Selecao | null, px: number, halo: number): void {
    const c = sel && contornoDe(sel);
    if (!c) return;
    ctx.lineJoin = 'round';
    if (halo) tracar(c.d, c.caminho, FUNDO, px + 2 * halo);
    tracar(c.d, c.caminho, TINTA, px);
  }

  function desenhar(): void {
    const t0 = performance.now();
    const movendo = !!animacao || gesto;
    ctx = movendo && escalaRascunho < dpr ? rctx : tela;
    escala = ctx === tela ? dpr : escalaRascunho;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!ufs || !largura) return;
    const j = janela();
    const relativo = cam.k / kMinimo;

    // Preenchimento: o Brasil colorido; com uma UF em destaque, o resto vai para o neutro (realce) e a UF vem por cima.
    // Até a malha municipal chegar, as UFs inteiras; quando ela chega, entra por cima em DURACAO_ENTRADA.
    if (!nacional || entrada < 1) pintar(ufs, (uf) => uf !== destaque, j, realce);
    ctx.globalAlpha = entrada;
    pintarBrasil(j, destaque, realce);
    ctx.globalAlpha = 1;
    if (destaque) pintar(malhaDa(destaque) as Desenho, (uf) => uf === destaque, j);

    // Divisas municipais: somem no Brasil inteiro, aparecem com o zoom; na UF em destaque, sempre. Só com o mapa parado:
    // contornar milhares de vértices a cada quadro é o que mais pesa na GPU durante voo e arrasto. Chanfro nas juntas: a
    // 1–2 px não se distingue do arredondado e custa bem menos.
    ctx.lineJoin = 'bevel';
    const divisa = Math.min(1, Math.max(0, (relativo - 1.6) * 0.18));
    for (const [uf, g] of animacao || gesto ? [] : ufs.grupos) {
      const espessura = uf === destaque ? Math.max(divisa, 0.6 * realce) : divisa * (1 - realce);
      const d = detalhes.get(uf) ?? nacional;
      const caminho = d?.grupos.get(uf)?.divisas;
      if (espessura > 0.05 && d && caminho && cruzaCaixa(g.caixa, j)) tracar(d, caminho, FUNDO, espessura);
    }

    // Divisas entre UFs por cima dos municípios (com o detalhe de quem já tem).
    const bordaUf = 1.25 + Math.min(0.75, (relativo - 1) * 0.1);
    tracar(nacional ?? ufs, (nacional ?? ufs).bordas, FUNDO, bordaUf);
    for (const d of detalhes.values()) tracar(d, d.bordas, FUNDO, bordaUf);

    if (!destaque) rotularUfs();
    realcar(passando, 1.5, 0);
    if (!mesma(ponteiro, passando)) realcar(ponteiro, 2, 1);
    realcar(selecao, 2.5, 1.5);
    if (ctx === rctx) {
      tela.setTransform(1, 0, 0, 1, 0, 0);
      tela.clearRect(0, 0, canvas.width, canvas.height);
      tela.drawImage(rascunho, 0, 0, canvas.width, canvas.height);
    }
    medidas.quadro = performance.now() - t0;
  }

  /** Siglas das UFs onde cabem: o raio do maior círculo inscrito (polylabel, do build) diz se a sigla cabe dentro. */
  function rotularUfs(): void {
    if (!ufs) return;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.font = '900 11px Archivo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = FUNDO;
    ctx.fillStyle = TINTA;
    const m = ufs.malha.metros;
    for (const f of ufs.malha.feicoes) {
      if (!f.rotulo) continue;
      const [x, y, r] = f.rotulo;
      const raio = r * m * cam.k;
      if (2 * raio < ctx.measureText(f.uf).width + 8 || raio < 9) continue;
      const sx = (x * m - cam.x) * cam.k + largura / 2;
      const sy = (y * m - cam.y) * cam.k + altura / 2;
      ctx.strokeText(f.uf, sx, sy);
      ctx.fillText(f.uf, sx, sy);
    }
  }

  // ---------- escolha (o que está sob o dedo) ----------
  function desenharEscolha(): void {
    escolha.width = Math.max(1, Math.round(largura));
    escolha.height = Math.max(1, Math.round(altura));
    registro = [];
    escolhaSuja = false;
    if (!ufs) return;
    const ids = new Map<string | number, number>();
    const idDe = (sel: Selecao): number => {
      const chave = sel.tipo === 'uf' ? sel.uf : sel.ibge;
      let id = ids.get(chave);
      if (id === undefined) {
        registro.push(sel);
        id = registro.length;
        ids.set(chave, id);
      }
      return id;
    };
    const j = janela();
    // No Brasil, a UF inteira num fill só; na UF em foco, um fill por município (só os da UF, só os à vista).
    const passar = (d: Desenho, aceita: (uf: UF) => boolean) => {
      transformar(ectx, d.malha.metros, 1);
      for (const [uf, g] of d.grupos) {
        if (!aceita(uf) || !cruzaCaixa(g.caixa, j)) continue;
        if (uf !== foco || d.deUfs) {
          ectx.fillStyle = corDeEscolha(idDe({ tipo: 'uf', uf }));
          ectx.fill(g.todos);
          continue;
        }
        for (const i of g.indices) {
          if (!cruza(d, i, j)) continue;
          ectx.fillStyle = corDeEscolha(idDe({ tipo: 'municipio', ibge: d.malha.feicoes[i].codigo, uf }));
          ectx.fill(d.caminhos[i]);
        }
      }
    };
    passar(nacional ?? ufs, (uf) => !detalhes.has(uf));
    for (const d of detalhes.values()) passar(d, () => true);
  }

  function escolher(sx: number, sy: number): Selecao | null {
    if (escolhaSuja) desenharEscolha();
    const x = Math.floor(sx);
    const y = Math.floor(sy);
    if (x < 0 || y < 0 || x >= escolha.width || y >= escolha.height) return null;
    const px = ectx.getImageData(x - 1, y - 1, 3, 3).data;
    if (px[4 * 4 + 3] === 0) return null;
    // Centro primeiro; se ele caiu na borda suavizada de dois polígonos, o vizinho mais próximo inteiro.
    for (const k of [4, 1, 3, 5, 7, 0, 2, 6, 8]) {
      if (px[4 * k + 3] !== 255) continue;
      const id = idDaCor(px[4 * k], px[4 * k + 1], px[4 * k + 2]);
      if (id >= 1 && id <= registro.length) return registro[id - 1];
    }
    return null;
  }

  // ---------- interação ----------
  function acionar(sel: Selecao | null): void {
    selecao = sel;
    pedir();
    o.aoSelecionar?.(sel);
    const novoFoco = sel ? sel.uf : null;
    // Tocar fora volta ao Brasil; tocar numa UF entra nela; tocar num município da UF em foco não move a câmera.
    if (novoFoco !== foco) {
      void focar(novoFoco);
      o.aoMudarFoco?.(novoFoco);
    }
  }

  function passarPor(sel: Selecao | null): void {
    if (mesma(sel, passando)) return;
    passando = sel;
    canvas.style.cursor = sel ? 'pointer' : cam.k > kMinimo * 1.02 ? 'grab' : '';
    o.aoPassar?.(sel);
    pedir();
  }

  const desligarGestos = ligarGestos(canvas, {
    arrastar(dx, dy) {
      ajustado = false;
      definirCamera(limitado({ x: cam.x - dx / cam.k, y: cam.y - dy / cam.k, k: cam.k }));
    },
    zoom(fator, sx, sy) {
      const novo = limitado(zoomEm(cam, fator, sx, sy, largura, altura));
      if (Math.abs(novo.k - cam.k) < cam.k * 1e-6 && Math.abs(novo.x - cam.x) * cam.k < 0.01 && Math.abs(novo.y - cam.y) * cam.k < 0.01) {
        return false;
      }
      pararAnimacao();
      ajustado = false;
      definirCamera(novo);
      return true;
    },
    tocar(sx, sy) {
      if (!ufs) return;
      acionar(escolher(sx, sy));
    },
    passar(sx, sy) {
      if (gesto || animacao || !ufs) return;
      passarPor(escolher(sx, sy));
    },
    sair() {
      passarPor(null);
    },
    comecar() {
      pararAnimacao();
      gesto = true;
      passarPor(null);
    },
    terminar(vx, vy) {
      gesto = false;
      pedir();
      const v = Math.hypot(vx, vy);
      const assentar = () => {
        // Afastou até o Brasil inteiro com uma UF em foco: volta ao Brasil.
        if (foco && cam.k <= kMinimo * 1.05) {
          void focar(null);
          o.aoMudarFoco?.(null);
          return;
        }
        detalharVisiveis();
      };
      if (movimentoReduzido.matches || v < VELOCIDADE_MINIMA) {
        assentar();
        return;
      }
      let anterior = performance.now();
      const inicio = anterior;
      void animar((agora) => {
        const fator = Math.exp(-(agora - inicio) / TAU_INERCIA);
        const dt = agora - anterior;
        anterior = agora;
        definirCamera(limitado({ x: cam.x - (vx * fator * dt) / cam.k, y: cam.y - (vy * fator * dt) / cam.k, k: cam.k }));
        return v * fator > 0.02;
      }).then(assentar);
    },
  });

  // ---------- teclado ----------
  function candidatos(): Array<{ sel: Selecao; x: number; y: number }> {
    if (!ufs) return [];
    if (!foco) {
      const m = ufs.malha.metros;
      return ufs.malha.feicoes.map((f, i) => ({
        sel: { tipo: 'uf', uf: f.uf },
        x: f.rotulo ? f.rotulo[0] * m : ((ufs as Desenho).caixas[4 * i] + (ufs as Desenho).caixas[4 * i + 2]) / 2,
        y: f.rotulo ? f.rotulo[1] * m : ((ufs as Desenho).caixas[4 * i + 1] + (ufs as Desenho).caixas[4 * i + 3]) / 2,
      }));
    }
    const d = detalhes.get(foco) ?? nacional;
    if (!d) return [];
    const m = d.malha.metros;
    const lista: Array<{ sel: Selecao; x: number; y: number }> = [];
    d.malha.feicoes.forEach((f, i) => {
      if (f.uf !== foco) return;
      lista.push({
        sel: { tipo: 'municipio', ibge: f.codigo, uf: f.uf },
        x: f.rotulo ? f.rotulo[0] * m : (d.caixas[4 * i] + d.caixas[4 * i + 2]) / 2,
        y: f.rotulo ? f.rotulo[1] * m : (d.caixas[4 * i + 1] + d.caixas[4 * i + 3]) / 2,
      });
    });
    return lista;
  }

  function nomeDe(sel: Selecao): string {
    if (sel.tipo === 'uf') return NOME_UF[sel.uf];
    const d = detalhes.get(sel.uf);
    const i = d?.indice.get(sel.ibge);
    const nome = d && i !== undefined ? d.malha.feicoes[i].nome : null;
    return nome ? `${nome} (${sel.uf})` : NOME_UF[sel.uf];
  }

  /** Anda o ponteiro do teclado para o vizinho mais próximo na direção (dx, dy), num cone de ~60°. */
  function moverPonteiro(dx: number, dy: number): void {
    const lista = candidatos();
    if (!lista.length) return;
    const atual = lista.find((c) => mesma(c.sel, ponteiro)) ?? lista.find((c) => mesma(c.sel, selecao));
    let proximo = atual;
    if (!atual) {
      proximo = lista.reduce((a, b) => (Math.hypot(b.x - cam.x, b.y - cam.y) < Math.hypot(a.x - cam.x, a.y - cam.y) ? b : a));
    } else if (ponteiro) {
      let melhor = Infinity;
      for (const c of lista) {
        const ao = (c.x - atual.x) * dx + (c.y - atual.y) * dy;
        const lado = Math.abs((c.x - atual.x) * dy - (c.y - atual.y) * dx);
        if (ao <= 0 || lado > ao * 1.8) continue;
        const custo = ao + 2.5 * lado;
        if (custo < melhor) {
          melhor = custo;
          proximo = c;
        }
      }
    }
    if (!proximo) return;
    ponteiro = proximo.sel;
    anuncio.textContent = nomeDe(proximo.sel);
    o.aoPassar?.(proximo.sel);
    // Fora da tela: a câmera vai até ele.
    const [x0, y0, x1, y1] = janela();
    const folga = 40 / cam.k;
    if (proximo.x < x0 + folga || proximo.x > x1 - folga || proximo.y < y0 + folga || proximo.y > y1 - folga) {
      void voar({ x: proximo.x, y: proximo.y, k: cam.k });
    }
    pedir();
  }

  function tecla(e: KeyboardEvent): void {
    const setas: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (setas[e.key]) moverPonteiro(...setas[e.key]);
    else if ((e.key === 'Enter' || e.key === ' ') && ponteiro) acionar(ponteiro);
    else if (e.key === 'Escape' && foco) {
      void focar(null);
      o.aoMudarFoco?.(null);
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      ajustado = false;
      void voar({ ...cam, k: cam.k * (e.key === '-' ? 1 / 1.6 : 1.6) });
    } else return;
    e.preventDefault();
  }

  const largarPonteiro = () => {
    if (!ponteiro) return;
    ponteiro = null;
    o.aoPassar?.(null);
    pedir();
  };
  canvas.addEventListener('keydown', tecla);
  canvas.addEventListener('blur', largarPonteiro);

  function atualizarRotulo(): void {
    canvas.setAttribute('aria-label', rotuloMotor(camada ? turnoDaCamada(camada.id) : null, foco ? NOME_UF[foco] : BRASIL));
  }
  atualizarRotulo();

  // ---------- tamanho ----------
  function medir(): void {
    const caixa = canvas.getBoundingClientRect();
    if (!caixa.width || !caixa.height) return;
    largura = caixa.width;
    altura = caixa.height;
    dpr = Math.min(devicePixelRatio || 1, DPR_MAXIMO);
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    escalaRascunho = Math.min(1, dpr, Math.sqrt(PIXELS_EM_MOVIMENTO / (largura * altura)));
    rascunho.width = Math.round(largura * escalaRascunho);
    rascunho.height = Math.round(altura * escalaRascunho);
    if (!ufs) return;
    kMinimo = enquadramento(null).k;
    definirCamera(ajustado ? enquadramento(foco) : limitado(cam));
    // Redimensionar apaga o canvas: desenha já, no mesmo quadro, sem piscar.
    desenhar();
  }
  const observador = new ResizeObserver(medir);
  observador.observe(canvas);

  function sujar(): void {
    escolhaSuja = true;
    pedir();
  }

  // ---------- carga ----------
  const pronto = baixarMalha('ufs.json')
    .then((malha) => {
      ufs = criarDesenho(malha, true);
      const c = ufs.caixas;
      brasil = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < c.length; i += 4) {
        brasil = [Math.min(brasil[0], c[i]), Math.min(brasil[1], c[i + 1]), Math.max(brasil[2], c[i + 2]), Math.max(brasil[3], c[i + 3])];
      }
      medir();
      if (foco) {
        destaque = foco;
        realce = 1;
      }
      definirCamera(enquadramento(foco));
      // A malha municipal só depois da primeira pintura das UFs.
      requestAnimationFrame(() => requestAnimationFrame(carregarNacional));
    })
    .catch(falhar);

  function carregarNacional(): void {
    if (abortar.signal.aborted) return;
    void document.fonts?.load('900 11px Archivo', 'AC').then(pedir, () => {});
    baixarMalha('municipios.json')
      .then((malha) => {
        nacional = criarDesenho(malha, false);
        contornos.clear();
        if (movimentoReduzido.matches) {
          sujar();
          return;
        }
        entrada = 0;
        const inicio = performance.now();
        // A entrada não é animação de câmera: não cancela voo em andamento, só pede quadros até terminar.
        const passo = (agora: number) => {
          if (abortar.signal.aborted) return;
          entrada = Math.min(1, (agora - inicio) / DURACAO_ENTRADA);
          sujar();
          if (entrada < 1) requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      })
      .catch(falhar);
  }

  return {
    definirCamada(nova, ref = null) {
      camada = nova;
      referencia = ref;
      recolorir();
    },
    definirModo(novo) {
      if (novo === modo) return;
      modo = novo;
      recolorir();
    },
    // Enquadra sempre, mesmo a UF que já está em foco: é o "mostrar a UF inteira" da página.
    async focarUf(uf) {
      await pronto;
      await focar(uf);
    },
    async selecionar(sel) {
      selecao = sel;
      pedir();
      await pronto;
      if (!sel) return;
      // A câmera só anda se a UF muda ou se o município está fora da tela: fechar um detalhe não desfaz o zoom.
      if (sel.uf !== foco) await focar(sel.uf);
      if (sel.tipo === 'municipio') await mostrar(sel.uf, sel.ibge);
    },
    destruir() {
      abortar.abort();
      pararAnimacao();
      if (pedido) cancelAnimationFrame(pedido);
      observador.disconnect();
      desligarGestos();
      canvas.removeEventListener('keydown', tecla);
      canvas.removeEventListener('blur', largarPonteiro);
      canvas.remove();
      instrucoes.remove();
      anuncio.remove();
    },
  };
}

