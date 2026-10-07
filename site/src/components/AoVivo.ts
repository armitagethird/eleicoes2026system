// Ilha ao vivo (brief, Fase 3), JS puro. O site é estático e sai do build no modo pre; é aqui, no cliente, que a página passa a
// live e final. O carregador (AoVivoCarga.astro) lê /data/status.json e só chama iniciar() fora do modo pre. Daí:
//   - revela o bloco ao vivo (casca oculta no HTML) e esconde o que é do modo pre ([data-so-pre] / [data-so-vivo]);
//   - busca o JSON da página a cada ~20 s com If-None-Match (home: br.json, cidade: c/{slug}.json, UF: uf/{uf}.json) e
//     atualiza só o que mudou: números (placa que vira, lib/flap.ts), barra, seções, "lidera", seta e a pílula do cabeçalho;
//   - na cidade e no estado, redesenha o card com renderCard (o mesmo SVG que o Compartilhar transforma em PNG), no modo final em final;
//   - pausa com a aba oculta e retoma ao voltar; nenhuma requisição fora de /data/*.
// A lógica (modo, mesclagem, diferenças, intervalos, vista do placar) é de lib/ao-vivo.ts; aqui só se liga ao DOM.
import {
  EVENTO_MODO,
  caminhoDados,
  decidirModo,
  diferencas,
  estadoAoVivo,
  intervaloPolling,
  mesclar,
  modoParaAnunciar,
  vistaPlacar,
  type PlacarVista,
} from '../lib/ao-vivo.ts';
import type { Cidade, Placar, UF } from '../lib/contratos.ts';
import { pilula } from '../lib/copy.ts';
import { atualizarFlap, montarFlap } from '../lib/flap.ts';
import { parseStatus, type Modo, type Status } from '../lib/status.ts';
import type { CardData } from './Card.ts';

/** O último JSON bom da página (br, uf ou cidade): tudo opcional, o front tolera campo ausente. */
type Dados = Partial<Placar> & Partial<Cidade>;
type Leitura = { tipo: 'novo'; json: unknown } | { tipo: 'igual' } | { tipo: 'erro' };

const STATUS = '/data/status.json';
const TIMEOUT_MS = 10_000;
/** Voltar à aba só busca na hora se o último fetch já tem mais que isto; senão espera o resto. */
const MINIMO_ENTRE_BUSCAS_MS = 10_000;
const SEM_NOVIDADE: Leitura = { tipo: 'igual' };
// Triângulos da seta de deslocamento (os mesmos de Placar.astro): ◀ para a coluna da esquerda, ▶ para a da direita.
const SETA_ESQUERDA = 'M0 6 10 0v12z';
const SETA_DIREITA = 'M10 6 0 0v12z';

const todos = <E extends HTMLElement>(raiz: ParentNode, seletor: string): E[] => Array.from(raiz.querySelectorAll<E>(seletor));

/** textContent só se mudou: não mexe no DOM (nem no leitor de tela) à toa. */
function texto(el: Element | null | undefined, valor: string): void {
  if (el && el.textContent !== valor) el.textContent = valor;
}

function escreverPlacar(placar: HTMLElement, v: PlacarVista): void {
  placar.classList.toggle('longo', v.longo);
  const colunas = todos(placar, '[data-placar-coluna]');
  const folhas = todos(placar, '[data-placar-folha]');

  v.lados.forEach((lado, i) => {
    const coluna = colunas[i];
    const folha = folhas[i];
    coluna.style.setProperty('--cor', lado.cor);
    texto(coluna.querySelector('[data-placar-n]'), String(lado.n));
    texto(coluna.querySelector('[data-placar-nome]'), lado.nome);
    texto(coluna.querySelector('[data-placar-partido]'), lado.partido);
    texto(coluna.querySelector('[data-placar-rotulo-sr]'), lado.rotulo ? `, ${lado.rotulo}` : '');

    const pct = coluna.querySelector<HTMLElement>('[data-placar-pct]');
    if (pct) {
      pct.hidden = lado.pct === null || v.aguardando;
      const flap = pct.querySelector<HTMLElement>('[data-flap]');
      if (flap && !pct.hidden) atualizarFlap(flap, lado.texto);
      texto(pct.querySelector('[data-placar-falado]'), pct.hidden ? '' : `${lado.texto}%`);
    }

    folha.hidden = v.aguardando || !((lado.pct ?? 0) > 0);
    folha.style.setProperty('--p', String(lado.pct ?? 0));
    folha.style.setProperty('--cor', lado.cor);
    const rotulo = folha.querySelector<HTMLElement>('[data-placar-rotulo]');
    if (rotulo) {
      rotulo.hidden = lado.rotulo === null;
      texto(rotulo, lado.rotulo ?? '');
    }
  });

  const seta = placar.querySelector<HTMLElement>('[data-placar-seta]');
  if (seta) {
    seta.hidden = v.seta === null;
    if (v.seta) {
      seta.classList.toggle('esq', v.seta.lado === 0);
      seta.classList.toggle('dir', v.seta.lado === 1);
      seta.style.setProperty('--cor', v.seta.cor);
      seta.querySelector('path')?.setAttribute('d', v.seta.lado === 0 ? SETA_ESQUERDA : SETA_DIREITA);
      texto(seta.querySelector('.pts'), v.seta.numero);
      texto(seta.querySelector('.resto'), v.seta.resto);
    }
  }

  const aguardando = placar.querySelector<HTMLElement>('[data-placar-aguardando]');
  if (aguardando) aguardando.hidden = !v.aguardando;
  const linha = placar.querySelector<HTMLElement>('[data-placar-linha]');
  if (linha) {
    linha.hidden = v.linha === null;
    texto(linha, v.linha ?? '');
  }
}

/** Lê um JSON de /data com If-None-Match. 304 = nada mudou; qualquer falha (rede, HTTP, JSON quebrado) conta como erro. */
function leitor(): (url: string) => Promise<Leitura> {
  const etags = new Map<string, string>();
  return async (url) => {
    const etag = etags.get(url);
    try {
      const resposta = await fetch(url, { headers: etag ? { 'If-None-Match': etag } : {}, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (resposta.status === 304) return SEM_NOVIDADE;
      if (!resposta.ok) return { tipo: 'erro' };
      const json: unknown = await resposta.json();
      const novo = resposta.headers.get('ETag');
      if (novo) etags.set(url, novo);
      return { tipo: 'novo', json };
    } catch {
      return { tipo: 'erro' };
    }
  };
}

/** O que a casca da cidade guarda em [data-cidade-dados] (CidadeAoVivo.astro): o card em espera e o slug; no estado, a UF no lugar do slug. */
interface BaseCidade {
  slug?: string;
  uf?: UF;
  card: CardData;
}

export async function iniciar(statusInicial: Status): Promise<void> {
  const encontrada = document.querySelector<HTMLElement>('[data-ao-vivo]');
  if (!encontrada) return;
  const raiz: HTMLElement = encontrada;
  const caminho = caminhoDados(raiz.dataset.aoVivo);
  if (!caminho) throw new Error(`data-ao-vivo inválido: "${raiz.dataset.aoVivo}". Esperado "br", "uf/{uf}" ou "c/{slug}".`);
  const url: string = caminho;

  const dadosCidade = raiz.querySelector<HTMLElement>('[data-cidade-dados]');
  // O HTML da cidade traz o card em espera: dele saem a identidade (nome, UF) e a bandeira, que o JSON ao vivo não repete.
  const base = dadosCidade?.textContent ? (JSON.parse(dadosCidade.textContent) as BaseCidade) : null;
  // O desenho do card (Card, destino, vocabulário) só desce onde há card; a home fica sem ele.
  const cartao = base ? await import('./AoVivoCard.ts') : null;
  const ler = leitor();
  const pilulaEl = document.querySelector<HTMLElement>('[data-pilula]');

  let modo: Modo = statusInicial.modo;
  let status = statusInicial;
  let dados: Dados = base ? { slug: base.slug, nome: base.card.local, uf: base.card.uf as Cidade['uf'] } : {};
  let ultimaBoa: string | null = null;
  let falhas = 0;
  let ultimaBusca = 0;
  let emVoo = false;
  let revelado = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  for (const flap of todos(raiz, '[data-flap]')) montarFlap(flap);

  function revelar(): void {
    if (revelado) return;
    revelado = true;
    for (const el of todos(raiz, '[data-so-pre]')) el.hidden = true;
    for (const el of todos(raiz, '[data-so-vivo]')) el.hidden = false;
    // O comparativo 2022 × 1º turno deixa de ser o destaque: o card ao vivo passa a ser.
    raiz.querySelector('[data-comparativo]')?.classList.remove('destaque');
    // Aquece o Compartilhar (card, destino, vocabulário) para o primeiro toque não esperar o download.
    if (base) setTimeout(() => void import('./Compartilhar.ts'), 1000);
  }

  /** Redesenha o card da cidade. false se o JSON ainda não traz os dois candidatos (a casca continua oculta). */
  function aplicarCidade(cidade: Dados, dadosDoCard: BaseCidade, destino: HTMLElement, desenho: NonNullable<typeof cartao>): boolean {
    const completo = desenho.montarCard(cidade, dadosDoCard, modo === 'final' ? 'final' : 'parcial');
    if (!completo) return false;
    const figura = raiz.querySelector('[data-card]');
    if (figura) figura.innerHTML = desenho.renderCard(completo);
    // O Compartilhar lê isto no toque: o que se compartilha é o que está na tela. "<" fora do JSON, como no HTML do build.
    destino.textContent = JSON.stringify({ ...dadosDoCard, card: completo }).replace(/</g, '\\u003c');
    const acoes = raiz.querySelector<HTMLElement>('[data-acoes]');
    if (acoes) acoes.hidden = completo.secoesPct < 1;
    return true;
  }

  function aplicarPlacares(): void {
    const fase = modo === 'final' ? 'final' : 'live';
    for (const placar of todos(raiz, '[data-placar-cargo]')) {
      const cargo = placar.dataset.placarCargo === 'governador' ? dados.governador : dados.presidente;
      placar.hidden = !cargo;
      if (cargo) escreverPlacar(placar, vistaPlacar(cargo, fase, dados.secoes_pct, dados.atualizado));
    }
  }

  function aplicar(): void {
    if (base && dadosCidade && cartao && !aplicarCidade(dados, base, dadosCidade, cartao)) return;
    revelar();
    // A cidade só tem o card; o estado tem o card e os placares (presidente e governador).
    if (!base?.slug) aplicarPlacares();
    if (pilulaEl) {
      texto(pilulaEl, pilula(modo, dados.secoes_pct, dados.atualizado ?? status.atualizado));
      if (pilulaEl.parentElement) pilulaEl.parentElement.dataset.modo = modo;
    }
  }

  function agendar(espera: number): void {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(() => void ciclo(false), espera);
  }

  async function ciclo(statusJaLido: boolean): Promise<void> {
    if (emVoo) return;
    emVoo = true;
    ultimaBusca = Date.now();
    const [lidoStatus, lidoPagina] = await Promise.all([statusJaLido ? SEM_NOVIDADE : ler(STATUS), ler(url)]);
    emVoo = false;

    const statusNovo = lidoStatus.tipo === 'novo' ? parseStatus(lidoStatus.json) : null;
    const novoModo = decidirModo(statusNovo, modo);
    if (novoModo === 'pre') {
      // O worker voltou a pre (ensaio, correção): a página recarrega e volta ao HTML do build.
      location.reload();
      return;
    }
    if (statusNovo) status = statusNovo;

    // O Palpite (e quem mais escutar) fica sabendo do modo novo; o carregador já anunciou o da primeira leitura.
    const aAnunciar = modoParaAnunciar(modo, novoModo);
    if (aAnunciar) document.dispatchEvent(new CustomEvent(EVENTO_MODO, { detail: { modo: aAnunciar } }));
    let mudou = aAnunciar !== null;
    modo = novoModo;
    if (lidoPagina.tipo === 'erro') {
      falhas += 1;
    } else {
      falhas = 0;
      if (lidoPagina.tipo === 'novo') {
        const fundido = mesclar(dados, lidoPagina.json);
        if (!revelado || diferencas(dados, fundido).length > 0) mudou = true;
        dados = fundido;
        ultimaBoa = dados.atualizado ?? ultimaBoa;
      }
    }
    if (mudou) aplicar();

    const { semConexao } = estadoAoVivo({ secoesPct: dados.secoes_pct, falhas, ultimaBoa });
    for (const aviso of todos(raiz, '[data-conexao]')) {
      aviso.hidden = semConexao === null;
      texto(aviso, semConexao ?? '');
    }
    agendar(intervaloPolling(modo, falhas) ?? 0);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else agendar(Math.max(0, MINIMO_ENTRE_BUSCAS_MS - (Date.now() - ultimaBusca)));
  });

  // O carregador acabou de ler o status.json: a primeira rodada só busca a página.
  void ciclo(true);
}
