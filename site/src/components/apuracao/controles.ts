// Controles da /apuracao: abas de eleição (tablist com setas), RESULTADO | COMPARAR (rádios nativos), busca de município
// (combobox ARIA 1.2 sobre lib/busca.ts), migalha de pão e a gaveta do detalhe no celular. Só DOM e eventos: o que cada
// escolha faz com o mapa e os dados é de pagina.ts.
import { buscar, type EntradaIndice } from '../../lib/busca.ts';
import type { IdCamada, Lugar } from '../../lib/apuracao-dados.ts';
import { NOME_UF, type UF } from '../../lib/contratos.ts';
import { esc, nomeDestino } from './painel.ts';

const LIMITE_BUSCA = 8;
const TEXTO = {
  carregando: 'Carregando os municípios…',
  vazio: 'Nenhum município com esse nome',
  erro: 'Não deu para carregar os municípios. Tente de novo.',
};
const quantos = (n: number): string => `${n} ${n === 1 ? 'município' : 'municípios'}. Use as setas para escolher.`;

export interface Acoes {
  aoTrocarAba(id: IdCamada): void;
  aoTrocarModo(modo: 'resultado' | 'variacao'): void;
  /** Busca, destaque ou tabela: leva o mapa ao município. */
  aoEscolherMunicipio(lugar: Lugar): void;
  /** Migalha ou tabela: Brasil (null) ou uma UF. */
  aoIrPara(uf: UF | null): void;
  /** Fechar a gaveta: tira o município da seleção. */
  aoFecharDetalhe(): void;
  /** O índice só é baixado quando alguém precisa dele (aqui, no 1º foco da busca). */
  indice(): Promise<Map<number, Lugar>>;
}

export interface Controles {
  abas(ids: readonly IdCamada[], rotulo: (id: IdCamada) => string, ativa: IdCamada): void;
  migalha(foco: UF | null, municipio: string | null): void;
  /** Abre ou fecha o detalhe (UF ou município). `nome` é o nome acessível da região. */
  detalheAberto(aberto: boolean, nome?: string): void;
}

const el = <T extends HTMLElement>(raiz: ParentNode, seletor: string): T => {
  const achado = raiz.querySelector<T>(seletor);
  if (!achado) throw new Error(`/apuracao: falta ${seletor} no HTML`);
  return achado;
};

function ligarAbas(lista: HTMLElement, painel: HTMLElement, acoes: Acoes): Controles['abas'] {
  const abas = (): HTMLButtonElement[] => Array.from(lista.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const marcar = (ativa: string): void => {
    for (const aba of abas()) {
      const sim = aba.dataset.id === ativa;
      aba.setAttribute('aria-selected', String(sim));
      aba.tabIndex = sim ? 0 : -1;
      if (sim) painel.setAttribute('aria-labelledby', aba.id);
    }
  };
  lista.addEventListener('click', (e) => {
    const aba = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (!aba?.dataset.id || aba.getAttribute('aria-selected') === 'true') return;
    marcar(aba.dataset.id);
    acoes.aoTrocarAba(aba.dataset.id as IdCamada);
  });
  // Setas, Home e End movem o foco e ativam a aba (ativação automática: cada aba é só uma troca de dados).
  lista.addEventListener('keydown', (e) => {
    const todas = abas();
    const i = todas.findIndex((a) => a === document.activeElement);
    if (i < 0) return;
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: todas.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const aba = todas[(destino + todas.length) % todas.length];
    aba.focus();
    aba.click();
  });
  return (ids, rotulo, ativa) => {
    lista.replaceChildren(
      ...ids.map((id) => {
        const aba = document.createElement('button');
        aba.type = 'button';
        aba.id = `aba-${id}`;
        aba.className = 'aba';
        aba.setAttribute('role', 'tab');
        aba.setAttribute('aria-controls', painel.id);
        aba.dataset.id = id;
        aba.textContent = rotulo(id);
        return aba;
      }),
    );
    marcar(ativa);
  };
}

function ligarBusca(raiz: HTMLElement, acoes: Acoes): void {
  const caixa = el<HTMLElement>(raiz, '[data-ap-busca]');
  const campo = el<HTMLInputElement>(caixa, '[data-ap-campo]');
  const lista = el<HTMLUListElement>(caixa, '[data-ap-sugestoes]');
  const aviso = el<HTMLElement>(caixa, '[data-ap-busca-aviso]');
  const status = el<HTMLElement>(caixa, '[data-ap-busca-status]');
  const abrir = el<HTMLButtonElement>(raiz, '[data-ap-abrir-busca]');
  const fechar = el<HTMLButtonElement>(caixa, '[data-ap-fechar-busca]');

  let entradas: EntradaIndice[] | null = null;
  let porSlug = new Map<string, Lugar>();
  let resultados: Lugar[] = [];
  let ativo = -1;

  const mostrarLista = (aberta: boolean): void => {
    lista.hidden = !aberta || resultados.length === 0;
    campo.setAttribute('aria-expanded', String(!lista.hidden));
  };

  const avisar = (texto: string | null): void => {
    aviso.hidden = texto === null;
    aviso.textContent = texto ?? '';
  };

  const marcar = (i: number): void => {
    ativo = i;
    Array.from(lista.children).forEach((op, j) => op.setAttribute('aria-selected', String(j === i)));
    if (i < 0) return campo.removeAttribute('aria-activedescendant');
    campo.setAttribute('aria-activedescendant', lista.children[i].id);
    lista.children[i].scrollIntoView({ block: 'nearest' });
  };

  const desenhar = (): void => {
    marcar(-1);
    const consulta = campo.value.trim();
    resultados = consulta && entradas ? buscar(entradas, consulta, LIMITE_BUSCA).flatMap((r) => porSlug.get(r.slug) ?? []) : [];
    lista.innerHTML = resultados
      .map(
        (l, i) =>
          `<li id="ap-op-${i}" role="option" aria-selected="false" aria-label="${esc(`${l.nome} (${l.uf})`)}" data-ibge="${l.ibge}"><span class="op-caixa">${nomeDestino(l.nome, 220, 26, 14, 1, 'var(--caixa)')}</span><span class="op-uf">${l.uf}</span></li>`,
      )
      .join('');
    if (!consulta) avisar(null);
    else if (!entradas) avisar(TEXTO.carregando);
    else avisar(resultados.length ? null : TEXTO.vazio);
    status.textContent = consulta && entradas ? (resultados.length ? quantos(resultados.length) : TEXTO.vazio) : '';
    mostrarLista(true);
  };

  const carregar = (): void => {
    if (entradas) return;
    acoes.indice().then(
      (indice) => {
        const lugares = [...indice.values()];
        porSlug = new Map(lugares.map((l) => [l.slug, l]));
        entradas = lugares.map((l): EntradaIndice => [l.slug, l.nome, l.uf, 0, 0, l.eleitores]);
        desenhar();
      },
      () => avisar(campo.value.trim() ? TEXTO.erro : null),
    );
  };

  // Celular: a busca abre por cima da página, com o campo no topo (o teclado cobre a metade de baixo).
  const alternar = (aberta: boolean): void => {
    raiz.toggleAttribute('data-busca-aberta', aberta);
    abrir.setAttribute('aria-expanded', String(aberta));
    if (aberta) {
      campo.focus();
      carregar();
    } else if (caixa.contains(document.activeElement) && getComputedStyle(abrir).display !== 'none') abrir.focus();
  };

  const escolher = (lugar: Lugar | undefined): void => {
    if (!lugar) return;
    campo.value = '';
    resultados = [];
    desenhar();
    alternar(false);
    acoes.aoEscolherMunicipio(lugar);
  };

  abrir.addEventListener('click', () => alternar(!raiz.hasAttribute('data-busca-aberta')));
  fechar.addEventListener('click', () => alternar(false));
  campo.addEventListener('focus', carregar);
  campo.addEventListener('input', desenhar);
  campo.addEventListener('blur', () => mostrarLista(false));
  campo.addEventListener('keydown', (e) => {
    const total = resultados.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && total) {
      e.preventDefault();
      mostrarLista(true);
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      marcar(ativo < 0 && passo < 0 ? total - 1 : (ativo + passo + total) % total);
    } else if (e.key === 'Enter' && total) {
      e.preventDefault();
      escolher(resultados[Math.max(ativo, 0)]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (!lista.hidden) mostrarLista(false);
      else if (campo.value) {
        campo.value = '';
        desenhar();
      } else alternar(false);
    }
  });
  // mousedown sem ação padrão: o foco fica no campo e a lista não fecha antes do clique chegar.
  lista.addEventListener('mousedown', (e) => e.preventDefault());
  lista.addEventListener('click', (e) => {
    const ibge = Number((e.target as Element).closest<HTMLElement>('[role="option"]')?.dataset.ibge);
    escolher(resultados.find((l) => l.ibge === ibge));
  });
}

function ligarMigalha(lista: HTMLElement, acoes: Acoes): Controles['migalha'] {
  lista.addEventListener('click', (e) => {
    const botao = (e.target as Element).closest<HTMLButtonElement>('button[data-ir]');
    if (botao) acoes.aoIrPara((botao.dataset.ir || null) as UF | null);
  });
  return (foco, municipio) => {
    const passos: Array<{ nome: string; ir: string }> = [{ nome: 'Brasil', ir: '' }];
    if (foco) passos.push({ nome: NOME_UF[foco], ir: foco });
    if (municipio) passos.push({ nome: municipio, ir: '' });
    const html = passos
      .map((p, i) =>
        i === passos.length - 1
          ? `<li><span class="atual" aria-current="location">${esc(p.nome)}</span></li>`
          : `<li><button type="button" data-ir="${p.ir}">${esc(p.nome)}</button></li>`,
      )
      .join('');
    if (html !== lista.innerHTML) lista.innerHTML = html;
  };
}

export function ligarControles(raiz: HTMLElement, acoes: Acoes): Controles {
  const painel = el<HTMLElement>(raiz, '[data-ap-painel]');
  const abas = ligarAbas(el(raiz, '[data-ap-abas]'), painel, acoes);
  const migalha = ligarMigalha(el(raiz, '[data-ap-migalha]'), acoes);
  ligarBusca(raiz, acoes);

  for (const radio of raiz.querySelectorAll<HTMLInputElement>('[data-ap-modo]')) {
    radio.addEventListener('change', () => radio.checked && acoes.aoTrocarModo(radio.value as 'resultado' | 'variacao'));
  }

  // Destaques e tabela são redesenhados a cada atualização: um ouvinte só, na raiz.
  raiz.addEventListener('click', (e) => {
    const alvo = e.target as Element;
    const item = alvo.closest<HTMLElement>('.dq-item');
    const uf = alvo.closest<HTMLElement>('.tb button[data-uf]');
    if (item) {
      void acoes.indice().then((indice) => {
        const lugar = indice.get(Number(item.dataset.ibge));
        if (lugar) acoes.aoEscolherMunicipio(lugar);
      });
    } else if (uf) acoes.aoIrPara(uf.dataset.uf as UF);
  });

  const detalhe = el<HTMLElement>(raiz, '[data-ap-detalhe]');
  el<HTMLButtonElement>(detalhe, '[data-ap-fechar-detalhe]').addEventListener('click', () => acoes.aoFecharDetalhe());
  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detalhe.hasAttribute('data-aberto') && !raiz.hasAttribute('data-busca-aberta')) acoes.aoFecharDetalhe();
  });

  return {
    abas,
    migalha,
    detalheAberto: (aberto, nome) => {
      if (nome) detalhe.setAttribute('aria-label', nome);
      if (aberto === detalhe.hasAttribute('data-aberto')) return;
      // O foco entra no detalhe ao abrir e, se estava nele, volta ao mapa ao fechar (lido antes: fechado, o detalhe o perde).
      const estavaNele = detalhe.contains(document.activeElement);
      detalhe.toggleAttribute('data-aberto', aberto);
      if (aberto) detalhe.focus();
      else if (estavaNele) raiz.querySelector<HTMLElement>('[data-ap-mapa] canvas')?.focus({ preventScroll: true });
    },
  };
}
