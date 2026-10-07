// Ilha do mapa (Mapa.astro), JS puro: o painel de detalhe acompanha foco e hover; as setas do teclado andam entre as
// placas (roving tabindex, vizinhos calculados no build em data-nav) e Enter segue o link; a entrada escalonada espera o
// muro aparecer na tela. Rede só no dia 25: quando a página vira live ou final (evento aovivo:modo, de AoVivoCarga.astro),
// baixa mapa-ao-vivo.ts, que troca o 1º turno pelo 2º turno ao vivo.
import { EVENTO_MODO } from '../lib/ao-vivo-pre.ts';
import type { Modo } from '../lib/status.ts';

const SETAS: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
const ESTADO = ['ganhou', 'vazio'] as const;

function iniciar(mapa: HTMLElement): void {
  const placas = [...mapa.querySelectorAll<HTMLAnchorElement>('a[data-lugar]')];
  const porLugar = new Map(placas.map((p) => [p.dataset.lugar, p]));
  const painel = mapa.querySelector<HTMLElement>('[data-mapa-painel]');
  const placaDe = (alvo: EventTarget | null) => (alvo instanceof Element ? alvo.closest<HTMLAnchorElement>('a[data-lugar]') : null);
  // A placa que o painel mostra: ele abre no Brasil e, ao vivo, se refaz a cada atualização.
  let atual = porLugar.get('BR') ?? placas[0];

  function mostrar(placa: HTMLAnchorElement): void {
    atual = placa;
    if (!painel) return;
    painel.style.cssText = placa.style.cssText;
    for (const chave of ESTADO) {
      const valor = placa.dataset[chave];
      if (valor === undefined) delete painel.dataset[chave];
      else painel.dataset[chave] = valor;
    }
    for (const campo of painel.querySelectorAll<HTMLElement>('[data-mapa-p]')) {
      campo.textContent = placa.dataset[campo.dataset.mapaP as string] ?? '';
    }
    // O link do painel é só para o ponteiro (fora do Tab): a placa focada já é o mesmo link. O nome acessível acompanha a placa.
    const link = painel.querySelector('a');
    link?.setAttribute('href', placa.getAttribute('href') ?? '/');
    link?.setAttribute('aria-label', placa.getAttribute('aria-label') ?? '');
    // A mesma bandeira (já carregada) da placa: nada de recorte nem de outro tamanho, só uma cópia na mesma caixa.
    const bandeira = placa.querySelector('[data-mapa-bandeira]')?.firstElementChild;
    if (bandeira) painel.querySelector('[data-mapa-bandeira]')?.replaceChildren(bandeira.cloneNode(true));
  }

  placas.forEach((p, i) => (p.tabIndex = i === 0 ? 0 : -1));

  mapa.addEventListener('pointerover', (e) => {
    const placa = placaDe(e.target);
    if (placa) mostrar(placa);
  });

  mapa.addEventListener('focusin', (e) => {
    const placa = placaDe(e.target);
    if (!placa) return;
    for (const p of placas) p.tabIndex = p === placa ? 0 : -1;
    mostrar(placa);
  });

  mapa.addEventListener('keydown', (e) => {
    const placa = placaDe(e.target);
    const direcao = SETAS[e.key];
    // Alt+← (voltar do navegador) e Ctrl/Cmd+setas não são do muro.
    if (!placa || direcao === undefined || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    porLugar.get(placa.dataset.nav?.split(' ')[direcao])?.focus();
  });

  // Uma promessa só: o módulo desce uma vez e cada evento seguinte (live, depois final) só diz o modo novo.
  let aoVivo: Promise<(modo: 'live' | 'final') => void> | undefined;
  document.addEventListener(EVENTO_MODO, (e) => {
    const { modo } = (e as CustomEvent<{ modo: Modo }>).detail;
    if (modo === 'pre') return;
    aoVivo ??= import('./mapa-ao-vivo.ts').then((m) => m.ligar(mapa, () => mostrar(atual)));
    void aoVivo.then((mudarModo) => mudarModo(modo));
  });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // A entrada já roda no carregamento; se o muro está fora da tela, ela é guardada para quando ele aparecer.
  const observador = new IntersectionObserver(
    ([registro]) => {
      if (registro.isIntersecting) {
        delete mapa.dataset.espera;
        observador.disconnect();
      } else {
        mapa.dataset.espera = '';
      }
    },
    { threshold: 0.15 },
  );
  observador.observe(mapa);
}

document.querySelectorAll<HTMLElement>('[data-mapa]').forEach(iniciar);
