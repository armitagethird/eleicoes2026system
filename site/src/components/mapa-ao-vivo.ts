// O muro de 28 ao vivo (Mapa.astro). A página sai do build em pre; quando ela vira live ou final, components/mapa.ts baixa este
// módulo, que lê br.json e os 27 uf/{uf}.json (lib/mapa-dados.ts, caminhoPlacar) a cada ~20 s (60 s no final) e troca o 1º turno
// pelo 2º turno ao vivo: data-fase, título, legenda e as 28 placas, escritas com o mesmo modelo do build (mapaApuracao, vista,
// atributosPlaca). Lugar sem dado fica "aguardando"; falha de rede mantém o último bom (mesclar); pausa com a aba oculta.
import { intervaloPolling, mesclar } from '../lib/ao-vivo.ts';
import { LUGARES, type Lugar } from '../lib/cartograma.ts';
import { MAPA_SIGLA } from '../lib/copy.ts';
import { atributosPlaca, caminhoPlacar, linhaMapa, mapaApuracao, vista, type PlacarMapa } from '../lib/mapa-dados.ts';

type Modo = 'live' | 'final';

const TIMEOUT_MS = 10_000;
/** Voltar à aba só busca na hora se a última busca já tem mais que isto; senão espera o resto. */
const MINIMO_ENTRE_BUSCAS_MS = 10_000;

/** textContent só se mudou: não mexe no DOM à toa. */
function texto(el: Element | null, valor: string): void {
  if (el && el.textContent !== valor) el.textContent = valor;
}

/** O texto e o JSON de um arquivo de /data; null em qualquer falha (rede, HTTP, JSON quebrado). O navegador revalida com ETag sozinho. */
async function ler(url: string): Promise<{ texto: string; json: unknown } | null> {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resposta.ok) return null;
    const corpo = await resposta.text();
    const json: unknown = JSON.parse(corpo);
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? { texto: corpo, json } : null;
  } catch {
    return null;
  }
}

/**
 * Liga o muro ao polling. Devolve a função que recebe o modo (a cada evento aovivo:modo, live ou final): a primeira troca a fase
 * na hora, antes de qualquer dado, e inicia a busca. `aoEscrever` roda depois de cada reescrita (o painel de detalhe se refaz).
 */
export function ligar(mapa: HTMLElement, aoEscrever: () => void): (modo: Modo) => void {
  const placas = new Map(Array.from(mapa.querySelectorAll<HTMLAnchorElement>('a[data-lugar]'), (p) => [p.dataset.lugar as Lugar, p]));
  const linha = mapa.querySelector('[data-mapa-linha]');
  const legendaSigla = mapa.querySelector('[data-mapa-sigla]');
  const placares: Partial<Record<Lugar, PlacarMapa>> = {};
  const brutos = new Map<Lugar, string>();
  let modo: Modo = 'live';
  let ligado = false;
  let falhas = 0;
  let ultimaBusca = 0;
  let emVoo = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function desenhar(): void {
    const dados = mapaApuracao(modo === 'live' ? 'parcial' : 'final', placares, placares.BR?.atualizado ?? null);
    mapa.dataset.fase = dados.fase;
    texto(linha, linhaMapa(dados));
    texto(legendaSigla, MAPA_SIGLA[dados.fase]);
    for (const placa of dados.placas) {
      const el = placas.get(placa.lugar);
      if (!el) continue;
      const v = vista(placa, dados.fase);
      for (const [nome, valor] of Object.entries(atributosPlaca(placa, v))) {
        if (valor === undefined) el.removeAttribute(nome);
        else el.setAttribute(nome, valor);
      }
      for (const declaracao of v.estilo.split(';')) {
        const [propriedade, valor] = declaracao.split(':');
        el.style.setProperty(propriedade, valor);
      }
      const sigla = el.querySelector<HTMLElement>('.sigla');
      if (sigla) {
        if (v.maisVotado) sigla.dataset.cor = v.maisVotado;
        else delete sigla.dataset.cor;
      }
      texto(el.querySelector('.seta-n'), v.setaNumero);
    }
    aoEscrever();
  }

  function agendar(espera: number): void {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(() => void ciclo(), espera);
  }

  async function ciclo(): Promise<void> {
    if (emVoo) return;
    emVoo = true;
    ultimaBusca = Date.now();
    const lidos = await Promise.all(LUGARES.map(async (lugar) => [lugar, await ler(caminhoPlacar(lugar))] as const));
    emVoo = false;

    let algumBom = false;
    let mudou = false;
    for (const [lugar, lido] of lidos) {
      if (!lido) continue;
      algumBom = true;
      if (brutos.get(lugar) === lido.texto) continue;
      brutos.set(lugar, lido.texto);
      placares[lugar] = mesclar(placares[lugar], lido.json);
      mudou = true;
    }
    falhas = algumBom ? 0 : falhas + 1;
    if (mudou) desenhar();
    agendar(intervaloPolling(modo, falhas) ?? 0);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else if (ligado) agendar(Math.max(0, MINIMO_ENTRE_BUSCAS_MS - (Date.now() - ultimaBusca)));
  });

  return (novo) => {
    if (ligado && novo === modo) return;
    modo = novo;
    desenhar();
    if (ligado) return;
    ligado = true;
    void ciclo();
  };
}
