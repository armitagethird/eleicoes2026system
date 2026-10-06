// Ilha da busca (CampoBusca.astro): combobox ARIA 1.2 sobre /busca.json e o botão "usar minha localização".
// O índice só é baixado no primeiro foco do campo ou no primeiro toque no botão. Enter ou clique levam a /c/{slug}.
import { buscar, type EntradaIndice, type ResultadoBusca } from '../lib/busca.ts';
import { ajustarDestino } from '../lib/destino.ts';
import { maisProxima } from '../lib/geo.ts';

const LIMITE = 8;
// Linha de destino: o nome encosta na largura da coluna pelo eixo wdth, entre estes tamanhos (px).
const NOME_MAX = 32;
const NOME_MIN = 18;

const TEXTO = {
  carregando: 'Carregando as cidades…',
  vazio: 'Nenhuma cidade com esse nome',
  erro: 'Não deu para carregar as cidades. Tente de novo.',
  localizando: 'Procurando a cidade mais perto de você…',
  negada: 'Sem acesso à sua localização. Digite o nome da cidade.',
  semLocal: 'Não deu para achar a sua localização. Digite o nome da cidade.',
};
const quantas = (n: number): string => `${n} ${n === 1 ? 'cidade' : 'cidades'}. Use as setas para escolher.`;
const abrindo = (r: ResultadoBusca): string => `Abrindo ${r.nome} (${r.uf})…`;
const ir = (slug: string): void => location.assign(`/c/${slug}`);
// No celular o teclado cobre a metade de baixo da tela: o campo vai para o topo e a gaveta ganha o espaço que sobra.
const TELA_ESTREITA = matchMedia('(max-width: 1023px)');

let indice: Promise<EntradaIndice[]> | null = null;

/** Baixa o índice uma vez; se falhar, a próxima chamada tenta de novo. */
function carregarIndice(): Promise<EntradaIndice[]> {
  indice ??= fetch('/busca.json')
    .then((resposta) => {
      if (!resposta.ok) throw new Error(`/busca.json respondeu ${resposta.status}`);
      return resposta.json() as Promise<EntradaIndice[]>;
    })
    .catch((erro: unknown) => {
      indice = null;
      throw erro;
    });
  return indice;
}

function opcao(r: ResultadoBusca, id: string): HTMLLIElement {
  const li = document.createElement('li');
  li.id = id;
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', 'false');
  li.setAttribute('aria-label', `${r.nome} (${r.uf})`);
  li.dataset.slug = r.slug;
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = r.nome;
  const uf = document.createElement('span');
  uf.className = 'uf';
  uf.textContent = r.uf;
  li.append(nome, uf);
  return li;
}

function iniciar(raiz: HTMLElement): void {
  const campo = raiz.querySelector<HTMLInputElement>('[data-busca-campo]');
  const gaveta = raiz.querySelector<HTMLElement>('[data-busca-gaveta]');
  const lista = raiz.querySelector<HTMLUListElement>('[data-busca-lista]');
  const aviso = raiz.querySelector<HTMLElement>('[data-busca-aviso]');
  const status = raiz.querySelector<HTMLElement>('[data-busca-status]');
  const geo = raiz.querySelector<HTMLButtonElement>('[data-busca-geo]');
  const geoAviso = raiz.querySelector<HTMLElement>('[data-busca-geo-aviso]');
  if (!campo || !gaveta || !lista || !aviso || !status || !geo || !geoAviso) return;

  let carregado: EntradaIndice[] | null = null;
  let resultados: ResultadoBusca[] = [];
  let ativo = -1;

  const abrir = (aberta: boolean): void => {
    gaveta.hidden = !aberta;
    raiz.toggleAttribute('data-aberto', aberta);
    campo.setAttribute('aria-expanded', String(aberta && resultados.length > 0));
  };

  const marcar = (i: number): void => {
    ativo = i;
    Array.from(lista.children).forEach((op, j) => op.setAttribute('aria-selected', String(j === i)));
    if (i < 0) {
      campo.removeAttribute('aria-activedescendant');
      return;
    }
    const op = lista.children[i];
    campo.setAttribute('aria-activedescendant', op.id);
    op.scrollIntoView({ block: 'nearest' });
  };

  const avisar = (texto: string | null): void => {
    aviso.hidden = texto === null;
    aviso.textContent = texto ?? '';
  };

  // Uma leitura de layout por desenho: a largura da coluna do nome, igual em todas as linhas.
  const ajustarNomes = (): void => {
    const nomes = lista.querySelectorAll<HTMLElement>('.nome');
    const largura = nomes[0]?.clientWidth ?? 0;
    for (const nome of nomes) {
      const [linha] = ajustarDestino((nome.textContent ?? '').toLocaleUpperCase('pt-BR'), {
        largura,
        tamMax: NOME_MAX,
        tamMin: NOME_MIN,
        maxLinhas: 1,
      }).linhas;
      nome.style.cssText = `font-size:${linha.tamanho}px;font-stretch:${linha.wdth}%`;
    }
  };

  const desenhar = (): void => {
    resultados = [];
    marcar(-1);
    lista.replaceChildren();
    if (campo.value.trim() === '') {
      avisar(null);
      abrir(false);
      status.textContent = '';
      return;
    }
    if (!carregado) {
      avisar(TEXTO.carregando);
      abrir(true);
      return;
    }
    resultados = buscar(carregado, campo.value, LIMITE);
    avisar(resultados.length ? null : TEXTO.vazio);
    abrir(true);
    lista.replaceChildren(...resultados.map((r, i) => opcao(r, `${lista.id}-op-${i}`)));
    ajustarNomes();
    status.textContent = resultados.length ? quantas(resultados.length) : TEXTO.vazio;
  };

  const falhouIndice = (): void => {
    if (campo.value.trim() === '') return;
    avisar(TEXTO.erro);
    abrir(true);
  };

  const garantirIndice = (): Promise<EntradaIndice[]> =>
    carregarIndice().then((i) => {
      carregado = i;
      return i;
    });

  // Um pedido por vez; se falhar, a próxima tecla (ou o próximo foco) tenta de novo.
  let pedido: Promise<void> | null = null;
  const carregar = (): void => {
    pedido ??= garantirIndice().then(
      () => {
        if (document.activeElement === campo) desenhar();
      },
      () => {
        pedido = null;
        falhouIndice();
      },
    );
  };

  campo.addEventListener('focus', () => {
    if (TELA_ESTREITA.matches) raiz.scrollIntoView({ block: 'start' });
    carregar();
    desenhar();
  });
  campo.addEventListener('input', () => {
    desenhar();
    if (!carregado) carregar();
  });
  campo.addEventListener('blur', () => abrir(false));

  campo.addEventListener('keydown', (e) => {
    const total = resultados.length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!total) return;
        e.preventDefault();
        if (gaveta.hidden) abrir(true);
        const passo = e.key === 'ArrowDown' ? 1 : -1;
        marcar(ativo < 0 && passo < 0 ? total - 1 : (ativo + passo + total) % total);
        return;
      }
      case 'Enter': {
        const escolhido = resultados[Math.max(ativo, 0)];
        if (!escolhido) return;
        e.preventDefault();
        ir(escolhido.slug);
        return;
      }
      case 'Escape':
        if (!gaveta.hidden) {
          e.preventDefault();
          abrir(false);
          marcar(-1);
        } else if (campo.value) {
          e.preventDefault();
          campo.value = '';
          desenhar();
        }
    }
  });

  // mousedown sem ação padrão: o foco fica no campo, a gaveta não fecha antes do clique chegar.
  gaveta.addEventListener('mousedown', (e) => e.preventDefault());
  lista.addEventListener('click', (e) => {
    const slug = (e.target as Element).closest<HTMLElement>('[role="option"]')?.dataset.slug;
    if (slug) ir(slug);
  });

  const falharGeo = (texto: string): void => {
    geo.disabled = false;
    geoAviso.textContent = texto;
  };

  geo.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      falharGeo(TEXTO.semLocal);
      return;
    }
    geo.disabled = true;
    geoAviso.textContent = TEXTO.localizando;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        garantirIndice().then(
          (i) => {
            const cidade = maisProxima(i, coords.latitude, coords.longitude);
            if (!cidade) return falharGeo(TEXTO.semLocal);
            geoAviso.textContent = abrindo(cidade);
            ir(cidade.slug);
          },
          () => falharGeo(TEXTO.erro),
        ),
      (erro) => falharGeo(erro.code === erro.PERMISSION_DENIED ? TEXTO.negada : TEXTO.semLocal),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });

  // Voltando pelo histórico (bfcache), o botão não pode ficar travado em "abrindo…".
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    geo.disabled = false;
    geoAviso.textContent = '';
  });
}

for (const raiz of document.querySelectorAll<HTMLElement>('[data-busca]')) iniciar(raiz);
