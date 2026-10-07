// Ilha do botão Compartilhar (carregada por CidadeAoVivo.astro), JS puro: SVG do card -> PNG no navegador -> navigator.share({ files, text, url }).
// Sem suporte a compartilhar arquivos, baixa o PNG e copia o texto. A fonte do card (e a bandeira em data URI) só é carregada
// no toque. Os dados são lidos de [data-cidade-dados] a cada toque: se a ilha ao vivo os trocar, o que se compartilha é o que está na tela.
import { carregarFonteCard, paraDataUri, svgParaPng } from '../lib/card-png.ts';
import { compartilhamento, compartilhamentoUf } from '../lib/cidade.ts';
import { renderCard, type CardData } from './Card.ts';

/** O card e onde ele mora: a cidade (`slug`, /c/{slug}) ou o estado (`uf`, /uf/{uf}). */
interface Dados {
  card: CardData;
  slug?: string;
  uf?: string;
}

// O PNG pronto fica guardado: se o navegador recusar o share por o gesto ter expirado (rede lenta), o segundo toque o envia na hora.
let pronto: { chave: string; arquivo: File } | undefined;

async function prepararPng({ card, slug, uf }: Dados, chave: string): Promise<File> {
  if (pronto?.chave === chave) return pronto.arquivo;
  const [fonteDataUri, bandeiraHref] = await Promise.all([carregarFonteCard(), card.bandeiraHref ? paraDataUri(card.bandeiraHref) : undefined]);
  const png = await svgParaPng(renderCard({ ...card, fonteDataUri, bandeiraHref }));
  const arquivo = new File([png], `${uf?.toLowerCase() ?? slug}-2turno-2026.png`, { type: 'image/png' });
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

async function compartilhar(raiz: HTMLElement): Promise<void> {
  const botao = raiz.querySelector<HTMLButtonElement>('[data-compartilhar]');
  const estado = raiz.querySelector<HTMLElement>('[data-compartilhar-estado]');
  const bruto = raiz.querySelector('[data-cidade-dados]')?.textContent;
  if (!botao || !estado || !bruto) return;

  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  estado.textContent = 'Gerando o card…';
  try {
    const dados = JSON.parse(bruto) as Dados;
    const arquivo = await prepararPng(dados, bruto);
    const { texto, textoComLink, url } = dados.uf ? compartilhamentoUf(dados.card, dados.uf) : compartilhamento(dados.card, dados.slug ?? '');
    const envio: ShareData = { files: [arquivo], text: texto, url };

    if (!navigator.canShare?.(envio)) {
      baixar(arquivo);
      estado.textContent = (await copiar(textoComLink)) ? 'PNG baixado e texto copiado. É só postar.' : `PNG baixado. Copie o texto: ${textoComLink}`;
    } else {
      estado.textContent = '';
      await navigator.share(envio);
    }
    raiz.querySelector('[data-pix]')?.removeAttribute('hidden');
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

async function copiarChave(botao: HTMLElement): Promise<void> {
  const rotulo = botao.textContent;
  botao.textContent = (await copiar(botao.dataset.pixCopiar ?? '')) ? 'Copiada' : 'Não copiou';
  setTimeout(() => (botao.textContent = rotulo), 2000);
}

/** Toque em COMPARTILHAR ou em COPIAR CHAVE. Quem escuta o clique é o carregador de CidadeAoVivo.astro, que importa este módulo sob demanda. */
export function aoClicar(alvo: Element): void {
  const raiz = alvo.closest<HTMLElement>('[data-cidade]');
  if (!raiz) return;
  if (alvo.closest('[data-compartilhar]')) void compartilhar(raiz);
  const chave = alvo.closest<HTMLElement>('[data-pix-copiar]');
  if (chave) void copiarChave(chave);
}
