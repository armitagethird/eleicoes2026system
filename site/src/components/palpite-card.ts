// A parte do Palpite que só carrega ao confirmar: o card em modo palpite (Card.ts, destino, fonte) e o compartilhar, o mesmo fluxo de
// Compartilhar.ts: SVG -> PNG (fonte e bandeira embutidas) -> navigator.share({ files, text, url }); sem suporte, baixa o PNG e copia o texto.
import { comPalpite } from '../lib/card-dados.ts';
import { carregarFonteCard, paraDataUri, svgParaPng } from '../lib/card-png.ts';
import { linkCidade } from '../lib/cidade.ts';
import { textoPalpite } from '../lib/copy.ts';
import { renderCard, type CardData } from './Card.ts';

export interface Palpite {
  card: CardData;
  slug: string;
  /** Palpite do 13, de 0 a 100. */
  pct13: number;
  /** Só em final: quantos pontos o palpite errou. */
  erro?: number;
}

/** O card em modo palpite. Com `erro` (só em final), a zona C diz "você errou por X pontos" em vez da diferença entre os dois. */
export function desenharCard(figura: HTMLElement, { card, pct13, erro }: Pick<Palpite, 'card' | 'pct13' | 'erro'>): void {
  figura.innerHTML = renderCard({ ...comPalpite(card, pct13), erroPalpite: erro });
}

// O PNG pronto fica guardado: se o navegador recusar o share por o gesto ter expirado (rede lenta), o segundo toque o envia na hora.
let pronto: { chave: string; arquivo: File } | undefined;

async function prepararPng({ card, slug, pct13, erro }: Palpite): Promise<File> {
  const chave = `${slug}:${pct13}:${erro ?? ''}`;
  if (pronto?.chave === chave) return pronto.arquivo;
  const [fonteDataUri, bandeiraHref] = await Promise.all([carregarFonteCard(), card.bandeiraHref ? paraDataUri(card.bandeiraHref) : undefined]);
  const png = await svgParaPng(renderCard({ ...comPalpite(card, pct13), erroPalpite: erro, fonteDataUri, bandeiraHref }));
  const arquivo = new File([png], `${slug}-palpite-2026.png`, { type: 'image/png' });
  pronto = { chave, arquivo };
  return arquivo;
}

function baixar(arquivo: File): void {
  const url = URL.createObjectURL(arquivo);
  Object.assign(document.createElement('a'), { href: url, download: arquivo.name }).click();
  // Revogar na hora cancela o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

const nomeDoErro = (erro: unknown): string => (erro instanceof DOMException ? erro.name : '');

/** Compartilha o card do palpite. Quem chama passa o botão (desabilitado durante o preparo) e o elemento de estado. */
export async function compartilhar(palpite: Palpite, botao: HTMLButtonElement, estado: HTMLElement): Promise<void> {
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  estado.textContent = 'Gerando o card…';
  try {
    const arquivo = await prepararPng(palpite);
    const { card, slug, pct13, erro } = palpite;
    const { cand } = comPalpite(card, pct13);
    const { completo, curto } = linkCidade(slug, '');
    const envio: ShareData = { files: [arquivo], text: textoPalpite({ local: card.local, cand, erro }), url: completo };

    if (!navigator.canShare?.(envio)) {
      baixar(arquivo);
      const comLink = textoPalpite({ local: card.local, cand, erro }, curto);
      estado.textContent = (await copiar(comLink)) ? 'PNG baixado e texto copiado. É só postar.' : `PNG baixado. Copie o texto: ${comLink}`;
    } else {
      estado.textContent = '';
      await navigator.share(envio);
    }
  } catch (erro) {
    const nome = nomeDoErro(erro);
    if (nome === 'AbortError') estado.textContent = '';
    else if (nome === 'NotAllowedError') estado.textContent = 'Card pronto. Toque de novo para compartilhar.';
    else estado.textContent = `Não foi possível gerar o card: ${erro instanceof Error ? erro.message : String(erro)}`;
  } finally {
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
  }
}
