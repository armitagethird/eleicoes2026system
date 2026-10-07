// Ilha do Palpite (components/Palpite.astro). O palpite é LOCAL: fica em localStorage, nunca vai a servidor, nunca vira agregado
// (enquete é proibida no período eleitoral). Aqui só se LÊ de /data/*: status.json e, em final, o JSON da cidade.
//
// CONTRATO COM A ILHA AO VIVO (AoVivo): ela diz o modo no document, na primeira leitura de status.json e a cada mudança:
//   document.dispatchEvent(new CustomEvent('aovivo:modo', { detail: { modo } }))   // modo: 'pre' | 'live' | 'final'
// Se o evento não vier em 1,5 s, esta ilha lê /data/status.json sozinha. Modo desconhecido vale como 'pre'.
//   pre:   slider, confirmar e o card do palpite; live: o bloco some; final: só quem tem palpite salvo vê o erro e o card.
// O card (Card.ts, destino, fonte) fica em palpite-card.ts e só carrega ao confirmar (ou, em final, para quem já tem palpite).
import {
  PALPITE_CONFIRMAR,
  PALPITE_NAO_SALVO,
  PALPITE_SALVO,
  PALPITE_SEM_RESULTADO,
  PALPITE_VER_CARD,
  erroDoPalpite,
  palpiteFalado,
} from '../lib/copy.ts';
import type { Cidade } from '../lib/contratos.ts';
import { percentual } from '../lib/format.ts';
import { PALPITE_INICIAL, complemento, erroEmPontos, gravarPalpite, lerPalpite, limitarPalpite } from '../lib/palpite.ts';
import { parseStatus, type Modo } from '../lib/status.ts';
import { avisarFalha } from './avisar-falha.ts';
import type { CardData } from './Card.ts';

/** Quanto esperar o evento do carregador ao vivo antes de ler o status.json por conta própria. */
const ESPERA_DO_EVENTO_MS = 1500;

const semSinal = (pct: number): string => percentual(pct).replace('%', '');

/** Percentual do 13 na apuração final da cidade; null se o JSON não estiver pronto (menos de 100% das seções) ou faltar o campo. */
async function resultadoDoTreze(slug: string): Promise<number | null> {
  try {
    const resposta = await fetch(`/data/c/${slug}.json`, { cache: 'no-cache' });
    if (!resposta.ok) return null;
    const cidade = (await resposta.json()) as Partial<Cidade>;
    const pct = cidade.presidente?.cand?.find((c) => c.n === 13)?.pct;
    return (cidade.secoes_pct ?? 0) >= 100 && typeof pct === 'number' ? pct : null;
  } catch {
    return null;
  }
}

function iniciar(raiz: HTMLElement): void {
  const q = <T extends HTMLElement>(nome: string): T | null => raiz.querySelector<T>(`[data-palpite-${nome}]`);
  const slug = raiz.dataset.palpite;
  const slider = q<HTMLInputElement>('slider');
  const confirmar = q<HTMLButtonElement>('confirmar');
  const status = q('status');
  const resultado = q('resultado');
  const figura = q('figura');
  const compartilhar = q<HTMLButtonElement>('compartilhar');
  const estado = q('estado');
  const erro = q('erro');
  const barra = q('barra="palpite"');
  const barraApurada = q('barra="apurado"');
  const bruto = q('dados')?.textContent;
  if (!slug || !slider || !confirmar || !status || !resultado || !figura || !compartilhar || !estado || !erro || !barra || !barraApurada || !bruto) return;

  const { card } = JSON.parse(bruto) as { card: CardData };
  const [c13, c22] = [...card.cand].sort((a, b) => a.n - b.n);
  const pcts = [...raiz.querySelectorAll<HTMLElement>('[data-palpite-pct]')];
  const apurados = [...raiz.querySelectorAll<HTMLElement>('[data-palpite-res]')];

  let salvo = lerPalpite(slug);
  let valor = salvo ?? PALPITE_INICIAL;
  let erroFinal: number | undefined;

  const desenhar = (): void => {
    barra.style.setProperty('--v', String(valor));
    slider.value = String(valor);
    slider.setAttribute('aria-valuetext', palpiteFalado(c13.nome, c22.nome, valor));
    for (const p of pcts) p.textContent = semSinal(p.dataset.palpitePct === '13' ? valor : complemento(valor));
    confirmar.textContent = salvo === valor ? PALPITE_VER_CARD : PALPITE_CONFIRMAR;
  };

  const mostrarCard = async (): Promise<void> => {
    const { desenharCard } = await import('./palpite-card.ts');
    desenharCard(figura, { card, pct13: valor, erro: erroFinal });
    resultado.hidden = false;
  };

  slider.addEventListener('input', () => {
    valor = limitarPalpite(slider.valueAsNumber);
    resultado.hidden = true;
    confirmar.hidden = false;
    status.textContent = '';
    desenhar();
  });

  // aria-disabled, não disabled: um botão desabilitado perde o foco, e na falha o teclado ficaria sem lugar.
  confirmar.addEventListener('click', async () => {
    if (confirmar.getAttribute('aria-busy') === 'true') return;
    confirmar.setAttribute('aria-disabled', 'true');
    confirmar.setAttribute('aria-busy', 'true');
    try {
      const gravou = valor === salvo || gravarPalpite(slug, valor);
      if (gravou) salvo = valor;
      status.textContent = gravou ? PALPITE_SALVO : PALPITE_NAO_SALVO;
      await mostrarCard();
      confirmar.hidden = true;
      compartilhar.focus();
    } catch (falha) {
      avisarFalha(status, falha);
    } finally {
      confirmar.removeAttribute('aria-disabled');
      confirmar.removeAttribute('aria-busy');
    }
  });

  compartilhar.addEventListener('click', () => {
    import('./palpite-card.ts')
      .then(({ compartilhar: enviar }) => enviar({ card, slug, pct13: valor, erro: erroFinal }, compartilhar, estado))
      .catch((falha: unknown) => avisarFalha(estado, falha));
  });

  // Em final, quem tem palpite salvo vê o erro e o card; quem não tem não vê nada (palpite depois do resultado não é palpite).
  const mostrarFinal = async (): Promise<void> => {
    if (salvo === null) {
      raiz.hidden = true;
      return;
    }
    valor = salvo;
    desenhar();
    raiz.dataset.palpiteModo = 'final';
    raiz.hidden = false;
    const pct13 = await resultadoDoTreze(slug);
    if (pct13 === null) {
      estado.textContent = PALPITE_SEM_RESULTADO;
    } else {
      erroFinal = erroEmPontos(valor, pct13);
      erro.textContent = erroDoPalpite(erroFinal);
      barraApurada.style.setProperty('--v', String(pct13));
      for (const r of apurados) r.textContent = semSinal(r.dataset.palpiteRes === '13' ? pct13 : complemento(pct13));
    }
    try {
      await mostrarCard();
    } catch (falha) {
      avisarFalha(estado, falha);
    }
  };

  let modoAtual: Modo = 'pre';
  const aplicarModo = (modo: Modo): void => {
    if (modo === modoAtual) return;
    modoAtual = modo;
    if (modo === 'final') void mostrarFinal();
    else {
      raiz.dataset.palpiteModo = modo;
      raiz.hidden = modo !== 'pre';
    }
  };

  let recebeuEvento = false;
  document.addEventListener('aovivo:modo', (evento) => {
    recebeuEvento = true;
    aplicarModo(parseStatus({ modo: (evento as CustomEvent<{ modo?: unknown }>).detail?.modo }).modo);
  });
  // O carregador ao vivo já lê o status.json em toda página de cidade: só se o evento não vier (página sem o carregador, rede
  // lenta) esta ilha o lê por conta própria, em vez de pedir o mesmo arquivo duas vezes.
  setTimeout(() => {
    if (recebeuEvento) return;
    fetch('/data/status.json', { cache: 'no-cache' })
      .then((resposta) => resposta.json())
      .then((bruto: unknown) => {
        if (!recebeuEvento) aplicarModo(parseStatus(bruto).modo);
      })
      // Sem status.json o bloco fica no modo da página (pre), que não afirma nenhum resultado.
      .catch(() => undefined);
  }, ESPERA_DO_EVENTO_MS);

  desenhar();
  if (salvo !== null) status.textContent = PALPITE_SALVO;
}

for (const raiz of document.querySelectorAll<HTMLElement>('[data-palpite]')) iniciar(raiz);
