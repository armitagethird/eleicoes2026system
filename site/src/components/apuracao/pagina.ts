// Ilha da /apuracao: liga o motor do mapa (motor.ts), os controles e os painéis. Estado único: aba (eleição), modo de cor,
// foco (Brasil ou UF), município selecionado e as camadas carregadas. Cada mudança redesenha os painéis a partir do estado
// (painel.ts, o mesmo HTML do build). O ao vivo é lido a cada 20 s só enquanto a aba dele está aberta.
import {
  REFERENCIA,
  abas,
  destaques,
  estadoCamada,
  linhasTabela,
  valorDe,
  variacao,
  type IdCamada,
  type Lugar,
  type Selecao,
} from '../../lib/apuracao-dados.ts';
import type { Camada } from '../../lib/camada-mapa.ts';
import { NOME_UF, type UF } from '../../lib/contratos.ts';
import {
  AGUARDANDO_SECOES,
  BRASIL,
  ERRO_CAMADA,
  LINHA_APURADA,
  TENTAR_DE_NOVO,
  linhaApuracao,
  rotuloAba,
  semConexao,
  turnoDaCamada,
} from '../../lib/copy.ts';
import { atualizarFlap, montarFlap } from '../../lib/flap.ts';
import { parseStatus, type Modo } from '../../lib/status.ts';
import { ligarControles } from './controles.ts';
import { carregarHistorica, carregarIndice, lerStatus, vigiarAoVivo, type AoVivo } from './dados.ts';
import { montarMapa } from './motor.ts';
import { destaquesHtml, esc, leituraHtml, legendaHtml, placarHtml, tabelaHtml, type Contexto } from './painel.ts';

const STATUS_A_CADA = 60_000;
// Celular e tablet: o mapa não é sticky e a gaveta do detalhe cobre a metade de baixo da tela; ao abrir um município, o
// mapa sobe para o topo e fica inteiro acima da gaveta.
const MAPA_ROLA = matchMedia('(max-width: 1023px)');
const SEM_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)');

interface Estado {
  modoSite: Modo;
  aba: IdCamada;
  cor: 'resultado' | 'variacao';
  foco: UF | null;
  municipio: { ibge: number; uf: UF } | null;
  camada: Camada | null;
  referencia: Camada | null;
  falhou: boolean;
  indice: Map<number, Lugar> | null;
  /** A geometria não carregou: o mapa fica vazio e a tabela continua valendo. */
  semMapa: boolean;
}

const sigla = (uf: UF) => uf.toLowerCase() as Lowercase<UF>;

const pegar = <T extends HTMLElement>(raiz: ParentNode, seletor: string): T => {
  const achado = raiz.querySelector<T>(seletor);
  if (!achado) throw new Error(`/apuracao: falta ${seletor} no HTML`);
  return achado;
};

const molde = document.createElement('template');

/**
 * Troca o HTML de um painel. Igual ao que já está (o HTML do build, ou um ciclo do ao vivo sem novidade): não mexe, para não
 * repintar nem refazer layout à toa. Mesmo lugar da mesma camada com número novo: os números marcados com data-flap-chave
 * viram como placas, só nos algarismos que mudaram (gesto 4). Fora isso, entra direto.
 */
// Tempo para a última placa terminar de virar (algarismos escalonados de 60 ms, 240 ms cada) antes de voltar a texto.
const FIM_DA_VIRADA = 1500;

/** O número de um elemento que vira: o texto, ou as células do flap (cada célula tem duas metades com o mesmo caractere). */
const numeroDe = (n: HTMLElement): string =>
  n.querySelector('[data-flap-c]') ? Array.from(n.children, (c) => (c as HTMLElement).dataset.flapC ?? '').join('') : (n.textContent ?? '');

function trocar(el: HTMLElement, html: string, chave: string): void {
  molde.innerHTML = html;
  if (el.innerHTML === molde.innerHTML) {
    el.dataset.chave = chave;
    return;
  }
  const antes = el.dataset.chave === chave ? new Map(Array.from(el.querySelectorAll<HTMLElement>('[data-flap-chave]'), (n) => [n.dataset.flapChave, numeroDe(n)])) : null;
  // O botão do card seria recriado com o resto: sem isto, uma atualização do ao vivo tiraria o foco de quem está nele.
  const noCard = document.activeElement?.matches('a.ir') && el.contains(document.activeElement);
  el.innerHTML = html;
  el.dataset.chave = chave;
  if (noCard) el.querySelector<HTMLElement>('a.ir')?.focus({ preventScroll: true });
  if (!antes) return;
  for (const n of el.querySelectorAll<HTMLElement>('[data-flap-chave]')) {
    const anterior = antes.get(n.dataset.flapChave);
    const novo = n.textContent ?? '';
    if (anterior === undefined || anterior === novo) continue;
    n.textContent = anterior;
    montarFlap(n);
    atualizarFlap(n, novo);
    // Parado, o número volta a ser texto: as duas metades de cada célula deixariam uma costura no meio do algarismo grande.
    setTimeout(() => {
      if (n.isConnected) n.textContent = novo;
    }, FIM_DA_VIRADA);
  }
}

function iniciar(raiz: HTMLElement): void {
  const els = {
    turno: pegar(raiz, '[data-ap-turno]'),
    linha: pegar(raiz, '[data-ap-linha]'),
    quando: pegar(raiz, '[data-ap-quando]'),
    aviso: pegar(raiz, '[data-ap-aviso]'),
    mapa: pegar(raiz, '[data-ap-mapa]'),
    leitura: pegar(raiz, '[data-ap-leitura]'),
    legenda: pegar(raiz, '[data-ap-legenda]'),
    placar: pegar(raiz, '[data-ap-placar]'),
    detalhe: pegar(raiz, '[data-ap-detalhe-corpo]'),
    destaques: pegar(raiz, '[data-ap-destaques]'),
    tabela: pegar<HTMLDetailsElement>(raiz, '[data-ap-tabela]'),
    tabelaCorpo: pegar(raiz, '[data-ap-tabela-corpo]'),
    anuncio: pegar(raiz, '[data-ap-anuncio]'),
  };

  // No /design o modo vem de ?modo= (pre, live ou final), para ver a página nos três sem trocar o status.json.
  const design = raiz.hasAttribute('data-design');
  const modoInicial = design ? parseStatus({ modo: new URL(location.href).searchParams.get('modo') }).modo : (raiz.dataset.modo as Modo);

  const estado: Estado = {
    modoSite: modoInicial,
    aba: abas(modoInicial).padrao,
    cor: 'resultado',
    foco: null,
    municipio: null,
    camada: null,
    referencia: null,
    falhou: false,
    indice: null,
    semMapa: false,
  };
  let aoVivo: AoVivo | null = null;

  const anunciar = (texto: string): void => {
    els.anuncio.textContent = texto;
  };

  const parcial = (): boolean => estado.aba === 'ao-vivo' && estado.modoSite === 'live';

  const contexto = (): Contexto | null =>
    estado.camada && {
      id: estado.aba,
      camada: estado.camada,
      idReferencia: estado.referencia ? REFERENCIA[estado.aba] : null,
      parcial: parcial(),
    };

  const comIndice = (indice: Map<number, Lugar>): Map<number, Lugar> => {
    if (!estado.indice) {
      estado.indice = indice;
      desenhar();
    }
    return indice;
  };

  // Sem o índice, os destaques ficam em espera e o município sai pelo código IBGE; a próxima interação tenta de novo.
  const garantirIndice = (): Promise<Map<number, Lugar> | null> => carregarIndice().then(comIndice, () => null);

  // ---- desenho ----

  const desenharEstado = (): void => {
    els.turno.textContent = rotuloAba(estado.aba, estado.modoSite === 'live');
    els.turno.toggleAttribute('data-ao-vivo', parcial());
    els.quando.hidden = estado.modoSite !== 'pre';
    const situacao = estadoCamada(estado.camada, estado.falhou);
    const br = estado.camada?.br;
    if (estado.aba !== 'ao-vivo') els.linha.textContent = estado.camada ? LINHA_APURADA : '';
    else if (situacao === 'aguardando') els.linha.textContent = AGUARDANDO_SECOES;
    else if (estado.camada) els.linha.textContent = linhaApuracao(parcial() ? 'parcial' : 'final', br?.secoes ?? 0, estado.camada.atualizado);
    els.aviso.hidden = situacao !== 'erro' && situacao !== 'sem-conexao' && !estado.semMapa;
    if (situacao === 'erro') {
      els.aviso.innerHTML = `${esc(ERRO_CAMADA)} <button type="button" data-ap-tentar>${TENTAR_DE_NOVO}</button>`;
    } else if (situacao === 'sem-conexao') els.aviso.textContent = semConexao(estado.camada?.atualizado);
    else if (estado.semMapa) els.aviso.textContent = ERRO_CAMADA;
  };

  const desenhar = (): void => {
    desenharEstado();
    const { referencia: ref, foco, municipio, indice } = estado;
    const escopo = foco ? NOME_UF[foco] : 'Brasil';
    const lugar = municipio && indice?.get(municipio.ibge);
    const nomeMunicipio = municipio && (lugar?.nome ?? `IBGE ${municipio.ibge}`);
    controles.migalha(foco, nomeMunicipio);
    // O detalhe abre com a UF em foco (placar dela e VER O CARD) e troca para o município quando há um. Com a UF no detalhe,
    // o placar do foco só repetiria o mesmo bloco: fica escondido; com um município, ele volta como contexto.
    controles.detalheAberto(foco !== null, nomeMunicipio ?? escopo);
    els.placar.hidden = foco !== null && municipio === null;

    const ctx = contexto();
    if (!ctx) {
      // Camada a caminho: tudo em espera, nunca o número de outra eleição embaixo do nome desta.
      trocar(els.placar, '', 'espera');
      trocar(els.detalhe, '', 'espera');
      trocar(els.destaques, destaquesHtml(null, null, escopo), 'espera');
      trocar(els.legenda, '', 'espera');
      trocar(els.tabelaCorpo, '', 'espera');
      return;
    }
    const { camada } = ctx;
    const doFoco: Selecao | null = foco ? { tipo: 'uf', uf: foco } : null;
    const valorFoco = valorDe(camada, doFoco);
    trocar(
      els.placar,
      placarHtml(ctx, { nome: escopo, sigla: foco ? sigla(foco) : 'br' }, valorFoco, variacao(valorFoco, valorDe(ref, doFoco))),
      `${estado.aba}|${foco ?? 'BR'}`,
    );

    if (foco && !municipio) {
      trocar(
        els.detalhe,
        placarHtml(ctx, { nome: escopo, sigla: sigla(foco), ufCard: sigla(foco) }, valorFoco, variacao(valorFoco, valorDe(ref, doFoco)), true),
        `${estado.aba}|${foco}`,
      );
    } else if (municipio && nomeMunicipio) {
      const sel: Selecao = { tipo: 'municipio', ...municipio };
      const v = valorDe(camada, sel);
      trocar(
        els.detalhe,
        placarHtml(ctx, { nome: nomeMunicipio, uf: municipio.uf, slug: lugar?.slug }, v, variacao(v, valorDe(ref, sel)), true),
        `${estado.aba}|${municipio.ibge}`,
      );
    }

    trocar(els.destaques, destaquesHtml(ctx, indice ? destaques(camada, ref, indice, foco) : null, escopo), 'destaques');
    if (els.tabela.open && (indice || !foco)) {
      const linhas = linhasTabela(camada, ref, indice ?? new Map(), foco, (uf) => NOME_UF[uf]);
      trocar(els.tabelaCorpo, tabelaHtml(ctx, linhas, escopo, foco !== null, (chave) => indice?.get(Number(chave))?.slug), 'tabela');
    }
    trocar(els.legenda, legendaHtml(ctx, estado.cor), 'legenda');
  };

  // ---- camadas ----

  const aplicarCamada = (): void => {
    if (estado.camada) motor.definirCamada(estado.camada, estado.referencia);
    desenhar();
    // Os destaques precisam dos nomes: o índice vem depois do mapa, sem disputar a primeira pintura.
    if (!estado.indice) setTimeout(() => void garantirIndice(), 0);
  };

  const carregarReferencia = (id: IdCamada): void => {
    const ref = REFERENCIA[id];
    if (!ref || ref === 'ao-vivo') return;
    carregarHistorica(ref).then(
      (camada) => {
        if (estado.aba !== id) return;
        estado.referencia = camada;
        aplicarCamada();
      },
      // Sem a referência o mapa segue no resultado; a comparação fica sem número (nunca um número errado).
      () => undefined,
    );
  };

  /** `emEspera`: põe os painéis em espera até a camada chegar. Na abertura não: o HTML do build já é o da aba padrão. */
  const trocarAba = (id: IdCamada, emEspera = true): void => {
    aoVivo?.parar();
    aoVivo = null;
    Object.assign(estado, { aba: id, camada: null, referencia: null, falhou: false });
    if (emEspera) desenhar();
    if (id === 'ao-vivo') {
      aoVivo = vigiarAoVivo(
        (camada, falhou) => {
          if (estado.aba !== 'ao-vivo') return;
          const nova = camada !== estado.camada;
          Object.assign(estado, { camada, falhou });
          if (nova) aplicarCamada();
          else desenhar();
        },
        () => estado.modoSite === 'live',
      );
    } else {
      carregarHistorica(id).then(
        (camada) => {
          if (estado.aba !== id) return;
          estado.camada = camada;
          aplicarCamada();
        },
        () => {
          if (estado.aba !== id) return;
          estado.falhou = true;
          desenhar();
        },
      );
    }
    carregarReferencia(id);
    if (emEspera) anunciar(turnoDaCamada(id));
  };

  // ---- seleção ----
  // Dois caminhos para o mesmo estado: o que vem do mapa (o motor já moveu a câmera; aqui só se atualiza a página) e o
  // que vem da página (migalha, busca, destaques, tabela), que também pede ao motor para ir até lá.

  const definirSelecao = (foco: UF | null, municipio: Estado['municipio']): void => {
    const mudouFoco = foco !== estado.foco;
    const abriuDetalhe = foco !== null && estado.foco === null;
    estado.foco = foco;
    estado.municipio = municipio;
    if (foco || municipio) {
      void garantirIndice().then((indice) => {
        if (municipio && indice) anunciar(indice.get(municipio.ibge)?.nome ?? '');
      });
    }
    desenhar();
    if (mudouFoco && !municipio) anunciar(foco ? NOME_UF[foco] : BRASIL);
    if (abriuDetalhe && MAPA_ROLA.matches) els.mapa.scrollIntoView({ block: 'start', behavior: SEM_MOVIMENTO.matches ? 'auto' : 'smooth' });
  };

  const irPara = (uf: UF | null): void => {
    definirSelecao(uf, null);
    void (uf ? motor.selecionar({ tipo: 'uf', uf }) : motor.selecionar(null).then(() => motor.focarUf(null)));
  };

  const escolherMunicipio = (ibge: number, uf: UF): void => {
    definirSelecao(uf, { ibge, uf });
    void motor.selecionar({ tipo: 'municipio', ibge, uf });
  };

  const motor = montarMapa(els.mapa, {
    aoSelecionar: (sel) => {
      if (!sel) definirSelecao(estado.foco, null);
      else definirSelecao(sel.uf, sel.tipo === 'municipio' ? { ibge: sel.ibge, uf: sel.uf } : null);
    },
    aoMudarFoco: (uf) => {
      if (uf !== estado.foco) definirSelecao(uf, null);
    },
    aoPassar: (sel) => {
      const ctx = contexto();
      if (!sel || !ctx) {
        els.leitura.innerHTML = '';
        return;
      }
      if (sel.tipo === 'uf') {
        els.leitura.innerHTML = leituraHtml(ctx, NOME_UF[sel.uf], null, valorDe(ctx.camada, sel));
        return;
      }
      if (!estado.indice) void garantirIndice();
      const nome = estado.indice?.get(sel.ibge)?.nome ?? '';
      els.leitura.innerHTML = leituraHtml(ctx, nome, sel.uf, valorDe(ctx.camada, sel));
    },
    aoErro: () => {
      estado.semMapa = true;
      desenharEstado();
    },
  });

  const controles = ligarControles(raiz, {
    aoTrocarAba: trocarAba,
    aoTrocarModo: (modo) => {
      estado.cor = modo;
      motor.definirModo(modo);
      desenhar();
    },
    aoEscolherMunicipio: (lugar) => escolherMunicipio(lugar.ibge, lugar.uf),
    aoIrPara: irPara,
    aoFecharDetalhe: () => {
      // O X desfaz o último passo: o município volta ao detalhe da UF e a UF volta ao Brasil.
      if (!estado.municipio) return irPara(null);
      definirSelecao(estado.foco, null);
      void motor.selecionar(estado.foco ? { tipo: 'uf', uf: estado.foco } : null);
    },
    indice: () => carregarIndice().then(comIndice),
  });

  raiz.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-ap-tentar]')) trocarAba(estado.aba);
  });
  els.tabela.addEventListener('toggle', () => {
    if (els.tabela.open && estado.foco) void garantirIndice();
    desenhar();
  });

  // ---- modo do site (pre → live → final) ----

  const aplicarModo = (modo: Modo): void => {
    const antes = estado.modoSite;
    if (modo === antes) return;
    estado.modoSite = modo;
    const { ids, padrao } = abas(modo);
    // Quem estava na aba padrão segue o padrão novo (no começo da apuração, o ao vivo); quem escolheu outra fica nela.
    const proxima = estado.aba === abas(antes).padrao || !ids.includes(estado.aba) ? padrao : estado.aba;
    controles.abas(ids, (id) => rotuloAba(id, modo === 'live'), proxima);
    if (proxima !== estado.aba) trocarAba(proxima);
    else {
      // Apuração encerrada: uma última leitura do ao vivo, que já não segue o ritmo dos 20 s.
      if (modo === 'final') aoVivo?.agora();
      desenhar();
    }
  };

  controles.abas(abas(estado.modoSite).ids, (id) => rotuloAba(id, estado.modoSite === 'live'), estado.aba);
  trocarAba(estado.aba, design);

  if (!design) {
    const conferirStatus = (): void => {
      if (document.hidden || estado.modoSite === 'final') return;
      // Falhou a leitura do status: segue no modo atual e confere de novo no próximo minuto.
      lerStatus().then((s) => aplicarModo(s.modo), () => undefined);
    };
    conferirStatus();
    window.setInterval(conferirStatus, STATUS_A_CADA);
  }
}

const raiz = document.querySelector<HTMLElement>('[data-apuracao]');
if (raiz) iniciar(raiz);
