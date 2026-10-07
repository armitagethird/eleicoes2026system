// O fluxo do botão COMPARTILHAR, o mesmo para o card da cidade, o do estado e o do palpite (Compartilhar.ts, palpite-card.ts):
// SVG do card -> PNG no navegador -> navigator.share({ files, text, url }). Sem suporte a compartilhar arquivos, baixa o PNG e copia
// o texto. A fonte (e a bandeira em data URI) só são carregadas no toque, aqui.
import { carregarFonteCard, paraDataUri, svgParaPng } from '../lib/card-png.ts';
import { CARD_GERANDO, CARD_PNG_BAIXADO_E_COPIADO, CARD_TOQUE_DE_NOVO, cardPngBaixado } from '../lib/copy.ts';
import { avisarFalha } from './avisar-falha.ts';
import { renderCard, type CardData } from './Card.ts';

/** O que o envio precisa: o PNG pronto e os textos do post. */
export interface CardPronto {
  arquivo: File;
  /** Texto do navigator.share: o link vai à parte, no campo `url`. */
  texto: string;
  /** Texto para colar quando só dá para baixar o PNG: leva o link dentro. */
  textoComLink: string;
  url: string;
}

// O PNG pronto fica guardado: se o navegador recusar o share por o gesto ter expirado (rede lenta), o segundo toque o envia na hora.
let pronto: { chave: string; arquivo: File } | undefined;

/** O PNG do card com fonte e bandeira embutidas (o SVG usado como imagem não carrega recursos externos). `chave` diz quando o card é o mesmo. */
export async function arquivoDoCard(card: CardData, nome: string, chave: string): Promise<File> {
  if (pronto?.chave === chave) return pronto.arquivo;
  const [fonteDataUri, bandeiraHref] = await Promise.all([carregarFonteCard(), card.bandeiraHref ? paraDataUri(card.bandeiraHref) : undefined]);
  const png = await svgParaPng(renderCard({ ...card, fonteDataUri, bandeiraHref }));
  const arquivo = new File([png], nome, { type: 'image/png' });
  pronto = { chave, arquivo };
  return arquivo;
}

function baixar(arquivo: File): void {
  const url = URL.createObjectURL(arquivo);
  Object.assign(document.createElement('a'), { href: url, download: arquivo.name }).click();
  // Revogar na hora cancela o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Copia para a área de transferência; false se o navegador recusa (sem permissão, sem gesto). */
export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prepara e compartilha o card. Durante o preparo o botão fica aria-disabled, não disabled: um botão desabilitado perde o foco, e
 * quem usa teclado ou leitor de tela fica sem lugar (o toque repetido é ignorado aqui). Devolve true quando o card saiu
 * (compartilhado, ou baixado e copiado); false se deu erro, a pessoa fechou a folha de compartilhar ou já havia um envio em curso.
 */
export async function compartilharPng(botao: HTMLElement, estado: HTMLElement, preparar: () => Promise<CardPronto>): Promise<boolean> {
  if (botao.getAttribute('aria-busy') === 'true') return false;
  botao.setAttribute('aria-disabled', 'true');
  botao.setAttribute('aria-busy', 'true');
  estado.textContent = CARD_GERANDO;
  try {
    const { arquivo, texto, textoComLink, url } = await preparar();
    const envio: ShareData = { files: [arquivo], text: texto, url };
    if (navigator.canShare?.(envio)) {
      estado.textContent = '';
      await navigator.share(envio);
    } else {
      baixar(arquivo);
      estado.textContent = (await copiar(textoComLink)) ? CARD_PNG_BAIXADO_E_COPIADO : cardPngBaixado(textoComLink);
    }
    return true;
  } catch (erro) {
    const nome = erro instanceof DOMException ? erro.name : '';
    if (nome === 'AbortError') estado.textContent = '';
    else if (nome === 'NotAllowedError') estado.textContent = CARD_TOQUE_DE_NOVO;
    else avisarFalha(estado, erro);
    return false;
  } finally {
    botao.removeAttribute('aria-disabled');
    botao.removeAttribute('aria-busy');
  }
}
