// Ilha do botão Compartilhar (carregada por CidadeAoVivo.astro), JS puro. O fluxo (SVG -> PNG -> share, ou baixar e copiar) é de
// compartilhar-png.ts. Os dados são lidos de [data-cidade-dados] a cada toque: se a ilha ao vivo os trocar, o que se compartilha
// é o que está na tela.
import { compartilhamento, compartilhamentoUf } from '../lib/cidade.ts';
import type { CardData } from './Card.ts';
import { arquivoDoCard, compartilharPng, copiar } from './compartilhar-png.ts';

/** O card e onde ele mora: a cidade (`slug`, /c/{slug}) ou o estado (`uf`, /uf/{uf}). */
interface Dados {
  card: CardData;
  slug?: string;
  uf?: string;
}

async function compartilhar(raiz: HTMLElement): Promise<void> {
  const botao = raiz.querySelector<HTMLElement>('[data-compartilhar]');
  const estado = raiz.querySelector<HTMLElement>('[data-compartilhar-estado]');
  const bruto = raiz.querySelector('[data-cidade-dados]')?.textContent;
  if (!botao || !estado || !bruto) return;

  const saiu = await compartilharPng(botao, estado, async () => {
    const dados = JSON.parse(bruto) as Dados;
    const arquivo = await arquivoDoCard(dados.card, `${dados.uf?.toLowerCase() ?? dados.slug}-2turno-2026.png`, bruto);
    return { arquivo, ...(dados.uf ? compartilhamentoUf(dados.card, dados.uf) : compartilhamento(dados.card, dados.slug ?? '')) };
  });
  if (saiu) raiz.querySelector('[data-pix]')?.removeAttribute('hidden');
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
