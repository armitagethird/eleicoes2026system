// Ilha do mapa (Mapa.astro), JS puro: o painel de detalhe acompanha foco e hover; as setas do teclado andam entre as
// placas (roving tabindex, vizinhos calculados no build em data-nav) e Enter segue o link; a entrada escalonada espera o
// muro aparecer na tela. Sem rede: o modo ao vivo é da Fase 3.
const SETAS: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
const ESTADO = ['ganhou', 'vazio'] as const;

function iniciar(mapa: HTMLElement): void {
  const placas = [...mapa.querySelectorAll<HTMLAnchorElement>('a[data-lugar]')];
  const porLugar = new Map(placas.map((p) => [p.dataset.lugar, p]));
  const painel = mapa.querySelector<HTMLElement>('[data-mapa-painel]');
  const placaDe = (alvo: EventTarget | null) => (alvo instanceof Element ? alvo.closest<HTMLAnchorElement>('a[data-lugar]') : null);

  function mostrar(placa: HTMLAnchorElement): void {
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
    if (!placa || direcao === undefined) return;
    e.preventDefault();
    porLugar.get(placa.dataset.nav?.split(' ')[direcao])?.focus();
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
