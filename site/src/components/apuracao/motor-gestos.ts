// Ponteiro, toque e roda do mapa, traduzidos em intenções (arrastar, zoom em torno de um ponto, tocar, passar).
// Um dedo ou o mouse arrastam; dois dedos fazem pinça (zoom e arrasto juntos); ctrl+roda, ⌘+roda e a pinça do trackpad
// (que chega como ctrl+roda) dão zoom em torno do cursor. A roda sozinha é da página: o mapa é sticky no desktop, e
// com a roda zoomando quem rolasse a página de volta para cima com o cursor em cima do mapa acabaria aproximando o mapa.
// Tocar = soltar perto de onde apertou, rápido.

export interface AlvoGestos {
  /** Deslocamento em px de tela. */
  arrastar(dx: number, dy: number): void;
  /** Multiplica a escala mantendo o ponto (sx, sy) parado. Devolve false se já estava no limite. */
  zoom(fator: number, sx: number, sy: number): boolean;
  tocar(sx: number, sy: number): void;
  /** Mouse passando, sem botão. */
  passar(sx: number, sy: number): void;
  sair(): void;
  comecar(): void;
  /** Fim do gesto; (vx, vy) em px/ms do arrasto no instante de soltar, para a inércia. */
  terminar(vx: number, vy: number): void;
}

const LIMIAR_ARRASTO: Record<string, number> = { mouse: 3, pen: 6, touch: 8 };
const TOQUE_MAXIMO_MS = 500;
const JANELA_VELOCIDADE_MS = 90;
const FIM_RODA_MS = 160;

type Ponto = { x: number; y: number };

export function ligarGestos(el: HTMLElement, alvo: AlvoGestos): () => void {
  const ponteiros = new Map<number, Ponto>();
  let caixa = el.getBoundingClientRect();
  let aperto: (Ponto & { t: number; tipo: string }) | null = null;
  let arrastando = false;
  let pinca: { d: number; c: Ponto } | null = null;
  let rastro: Array<Ponto & { t: number }> = [];
  let rodando = false;
  let fimRoda = 0;

  const local = (e: MouseEvent): Ponto => ({ x: e.clientX - caixa.left, y: e.clientY - caixa.top });

  const medirPinca = () => {
    const [a, b] = [...ponteiros.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const comecar = () => {
    if (arrastando) return;
    arrastando = true;
    alvo.comecar();
  };

  function apertar(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    caixa = el.getBoundingClientRect();
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    ponteiros.set(e.pointerId, p);
    if (ponteiros.size === 1) {
      aperto = { ...p, t: e.timeStamp, tipo: e.pointerType };
      rastro = [{ ...p, t: e.timeStamp }];
      return;
    }
    // Segundo dedo: é pinça, nunca toque.
    aperto = null;
    comecar();
    pinca = medirPinca();
  }

  function mover(e: PointerEvent) {
    const p = local(e);
    const antes = ponteiros.get(e.pointerId);
    if (!antes) {
      if (e.pointerType === 'mouse' && !rodando) alvo.passar(p.x, p.y);
      return;
    }
    ponteiros.set(e.pointerId, p);
    if (ponteiros.size === 2 && pinca) {
      const agora = medirPinca();
      if (pinca.d > 0 && agora.d > 0) alvo.zoom(agora.d / pinca.d, agora.c.x, agora.c.y);
      alvo.arrastar(agora.c.x - pinca.c.x, agora.c.y - pinca.c.y);
      pinca = agora;
      return;
    }
    if (ponteiros.size !== 1) return;
    if (!arrastando) {
      if (!aperto || Math.hypot(p.x - aperto.x, p.y - aperto.y) < (LIMIAR_ARRASTO[aperto.tipo] ?? 6)) return;
      comecar();
      alvo.arrastar(p.x - aperto.x, p.y - aperto.y);
    } else {
      alvo.arrastar(p.x - antes.x, p.y - antes.y);
    }
    rastro.push({ ...p, t: e.timeStamp });
    while (rastro.length > 2 && e.timeStamp - rastro[0].t > JANELA_VELOCIDADE_MS) rastro.shift();
  }

  function soltar(e: PointerEvent) {
    if (!ponteiros.delete(e.pointerId)) return;
    if (ponteiros.size === 1) {
      // Da pinça para um dedo: o arrasto segue do ponto atual do dedo que ficou, sem salto.
      pinca = null;
      const [resto] = ponteiros.values();
      rastro = [{ ...resto, t: e.timeStamp }];
      return;
    }
    if (ponteiros.size > 1) {
      pinca = medirPinca();
      return;
    }
    if (arrastando) {
      arrastando = false;
      const primeiro = rastro[0];
      const ultimo = rastro[rastro.length - 1];
      const dt = ultimo.t - primeiro.t;
      const valeInercia = e.type === 'pointerup' && dt > 0 && e.timeStamp - ultimo.t < 50;
      alvo.terminar(valeInercia ? (ultimo.x - primeiro.x) / dt : 0, valeInercia ? (ultimo.y - primeiro.y) / dt : 0);
    } else if (e.type === 'pointerup' && aperto && e.timeStamp - aperto.t < TOQUE_MAXIMO_MS) {
      alvo.tocar(aperto.x, aperto.y);
    }
    aperto = null;
  }

  function rolar(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    caixa = el.getBoundingClientRect();
    const p = local(e);
    const unidade = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? caixa.height : 1;
    // ctrl+roda é a pinça do trackpad: passos menores e mais numerosos, então pesa mais por unidade.
    const fator = Math.exp(-e.deltaY * unidade * (e.ctrlKey ? 0.01 : 0.002));
    // No limite do zoom a roda volta a ser da página: o mapa não prende a rolagem.
    if (!alvo.zoom(fator, p.x, p.y)) return;
    e.preventDefault();
    if (!rodando) {
      rodando = true;
      alvo.comecar();
    }
    clearTimeout(fimRoda);
    fimRoda = window.setTimeout(() => {
      rodando = false;
      alvo.terminar(0, 0);
    }, FIM_RODA_MS);
  }

  const sair = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !ponteiros.size) alvo.sair();
  };

  el.addEventListener('pointerdown', apertar);
  el.addEventListener('pointermove', mover);
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
  el.addEventListener('pointerleave', sair);
  el.addEventListener('wheel', rolar, { passive: false });
  return () => {
    clearTimeout(fimRoda);
    el.removeEventListener('pointerdown', apertar);
    el.removeEventListener('pointermove', mover);
    el.removeEventListener('pointerup', soltar);
    el.removeEventListener('pointercancel', soltar);
    el.removeEventListener('pointerleave', sair);
    el.removeEventListener('wheel', rolar);
  };
}
