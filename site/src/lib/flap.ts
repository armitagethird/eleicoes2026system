/**
 * Placa que vira (split-flap), design/DIRECTION.md, gesto 4. Cada caractere vira uma célula de duas metades; ao trocar
 * o texto, só as células que mudaram viram, da direita para a esquerda: a metade de cima do caractere antigo cai e a de
 * baixo do novo desce por cima dela (transform: scaleY, 2D). A placa nunca passa por valores intermediários: o que se vê
 * é sempre o caractere antigo ou o novo. Com prefers-reduced-motion, o texto só é trocado.
 *
 * Uso: montarFlap(el) uma vez (lê el.textContent) e atualizarFlap(el, texto) a cada valor novo.
 * A cor de fundo das folhas que caem vem de --flap-fundo (padrão --bg); o visual da célula ([data-flap-c]) é do consumidor.
 */

const MEIA_VIRADA_MS = 120; // duas metades = 240 ms por caractere
const ESCALONAMENTO_MS = 60;
const CIMA = 'inset(0 0 50% 0)';
// A metade de baixo sobe 1 px sobre a de cima: duas bordas antialiased em exatos 50% deixariam um fio do fundo atravessando o número.
const BAIXO = 'inset(calc(50% - 1px) 0 0 0)';

/** Índices, no texto novo, das células que mudam, da direita para a esquerda. Alinha pela direita: números crescem à esquerda. */
export function celulasQueMudam(anterior: string, novo: string): number[] {
  const deslocamento = novo.length - anterior.length;
  const mudam: number[] = [];
  for (let i = novo.length - 1; i >= 0; i--) if (novo[i] !== anterior[i - deslocamento]) mudam.push(i);
  return mudam;
}

function metade(texto: string, recorte: string, estilo: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = texto;
  span.style.cssText = `clip-path:${recorte};${estilo}`;
  return span;
}

const SOBREPOSTA = 'position:absolute;inset:0';
const FOLHA = `${SOBREPOSTA};background:var(--flap-fundo,var(--bg));transform-origin:50% 50%`;

function celula(caractere: string): HTMLSpanElement {
  const c = document.createElement('span');
  c.dataset.flapC = caractere;
  c.style.cssText = 'position:relative;display:inline-block;text-align:center;white-space:pre';
  const baixo = metade(caractere, BAIXO, SOBREPOSTA);
  baixo.setAttribute('aria-hidden', 'true');
  c.append(metade(caractere, CIMA, 'display:block'), baixo);
  return c;
}

/** Interrompe uma virada em andamento e deixa a célula parada no caractere atual. */
function assentar(c: HTMLElement): [HTMLElement, HTMLElement] {
  const [cima, baixo, ...folhas] = Array.from(c.children) as HTMLElement[];
  for (const folha of folhas) {
    for (const animacao of folha.getAnimations()) animacao.cancel();
    folha.remove();
  }
  cima.textContent = baixo.textContent = c.dataset.flapC ?? '';
  return [cima, baixo];
}

function virar(c: HTMLElement, novo: string, atraso: number | null): void {
  const [cima, baixo] = assentar(c);
  const antigo = c.dataset.flapC ?? '';
  c.dataset.flapC = novo;
  cima.textContent = novo;
  if (atraso === null) {
    baixo.textContent = novo;
    return;
  }
  const cai = metade(antigo, CIMA, FOLHA);
  const desce = metade(novo, BAIXO, FOLHA);
  cai.setAttribute('aria-hidden', 'true');
  desce.setAttribute('aria-hidden', 'true');
  c.append(cai, desce);
  cai.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], {
    duration: MEIA_VIRADA_MS,
    delay: atraso,
    easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)',
    fill: 'both',
  });
  desce.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
    duration: MEIA_VIRADA_MS,
    delay: atraso + MEIA_VIRADA_MS,
    easing: 'cubic-bezier(0.2, 0.7, 0.1, 1)',
    fill: 'both',
  }).onfinish = () => assentar(c);
}

/** Transforma o texto atual do elemento em células. Chamar uma vez, antes de atualizarFlap. */
export function montarFlap(el: HTMLElement): void {
  el.replaceChildren(...(el.textContent ?? '').split('').map(celula));
}

/** Troca o texto virando só as células que mudaram. Células novas entram (ou saem) pela esquerda. */
export function atualizarFlap(el: HTMLElement, texto: string): void {
  const anterior = Array.from(el.children, (c) => (c as HTMLElement).dataset.flapC ?? '').join('');
  if (anterior === texto) return;
  for (let i = anterior.length; i < texto.length; i++) el.prepend(celula(''));
  for (let i = texto.length; i < anterior.length; i++) el.firstElementChild?.remove();
  const celulas = Array.from(el.children) as HTMLElement[];
  const animar = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  celulasQueMudam(anterior, texto).forEach((i, ordem) => virar(celulas[i], texto[i], animar ? ordem * ESCALONAMENTO_MS : null));
}
