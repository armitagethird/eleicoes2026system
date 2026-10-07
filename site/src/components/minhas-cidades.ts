// Ilha de Minhas cidades (MinhasCidades.astro): o botão adicionar/remover da página de cidade e a faixa da home.
// Os dois nascem escondidos no HTML do build; só aparecem aqui, se o localStorage funciona (e, na faixa, se há cidade guardada).
// Tudo que vem do localStorage já passou por lerCidades; o DOM é montado com textContent e createElement, nunca com innerHTML.
import { adicionarCidade, estaSalva, guardarCidades, lerCidades, removerCidade, type CidadeSalva } from '../lib/minhas-cidades.ts';

const armazenamento = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

function iniciarBotao(raiz: HTMLElement): void {
  const botao = raiz.querySelector<HTMLButtonElement>('[data-alternar]');
  const estado = raiz.querySelector<HTMLElement>('[data-status]');
  const { slug = '', nome = '', uf = '', msgGuardada, msgTroca, msgRemovida, msgErro } = raiz.dataset;
  if (!botao || !estado || !armazenamento()) return;

  const cidade = { slug, nome, uf } as CidadeSalva;
  const pintar = (lista: CidadeSalva[]): void => botao.setAttribute('aria-pressed', String(estaSalva(lista, slug)));
  pintar(lerCidades(armazenamento()));
  raiz.hidden = false;

  botao.addEventListener('click', () => {
    const lugar = armazenamento();
    const antes = lerCidades(lugar);
    const salva = estaSalva(antes, slug);
    const depois = salva ? removerCidade(antes, slug) : adicionarCidade(antes, cidade);
    if (!guardarCidades(lugar, depois)) {
      estado.textContent = msgErro ?? '';
      return;
    }
    pintar(depois);
    const saiu = salva ? undefined : antes.find((c) => !estaSalva(depois, c.slug));
    estado.textContent = (salva ? msgRemovida : saiu ? `${msgTroca} ${saiu.nome}.` : msgGuardada) ?? '';
  });
}

function destino({ slug, nome, uf }: CidadeSalva, bandeiras: Record<string, string>): HTMLLIElement {
  const bandeira = new Image(40, 28);
  bandeira.alt = '';
  bandeira.loading = 'lazy';
  bandeira.decoding = 'async';
  bandeira.src = bandeiras[uf] ?? '';
  const rotulo = document.createElement('span');
  rotulo.className = 'nome';
  rotulo.textContent = nome;
  const sigla = document.createElement('span');
  sigla.className = 'uf';
  sigla.textContent = uf;
  const link = document.createElement('a');
  link.href = `/c/${slug}`;
  link.append(bandeira, rotulo, sigla);
  const item = document.createElement('li');
  item.append(link);
  return item;
}

function desenharFaixa(raiz: HTMLElement): void {
  const lista = raiz.querySelector('[data-lista]');
  const bandeiras = JSON.parse(raiz.querySelector('[data-bandeiras]')?.textContent ?? '{}') as Record<string, string>;
  const cidades = lerCidades(armazenamento());
  lista?.replaceChildren(...cidades.map((cidade) => destino(cidade, bandeiras)));
  raiz.hidden = cidades.length === 0;
}

for (const raiz of document.querySelectorAll<HTMLElement>('[data-minhas-cidades-acao]')) iniciarBotao(raiz);

const faixas = document.querySelectorAll<HTMLElement>('[data-minhas-cidades-faixa]');
faixas.forEach(desenharFaixa);
// Voltar pelo histórico (bfcache) devolve a home como estava: sem isto a cidade que acabou de ser adicionada não aparece.
addEventListener('pageshow', (e) => e.persisted && faixas.forEach(desenharFaixa));
