// SVG do card -> PNG no navegador, para o botão Compartilhar. O SVG usado como imagem não carrega recursos externos:
// a fonte (e a bandeira) têm de ir dentro dele como data URI. Só carregar estes dados quando o usuário tocar em Compartilhar.

export async function paraDataUri(url: string): Promise<string> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Não foi possível baixar ${url}: HTTP ${resposta.status}`);
  const blob = await resposta.blob();
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as string);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

let fonteDoCard: Promise<string> | undefined;

/** Subset da Archivo 900 (public/fonts/archivo/card.woff2) em data URI base64. Memoizado; uma falha não fica guardada. */
export function carregarFonteCard(): Promise<string> {
  fonteDoCard ??= paraDataUri('/fonts/archivo/card.woff2').catch((erro: unknown) => {
    fonteDoCard = undefined;
    throw erro;
  });
  return fonteDoCard;
}

/** Rasteriza o SVG (já com fonte e bandeira embutidas) num PNG de 1200x675 vezes `escala`. */
export async function svgParaPng(svg: string, escala = 1): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    const canvas = document.createElement('canvas');
    canvas.width = imagem.naturalWidth * escala;
    canvas.height = imagem.naturalHeight * escala;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Canvas 2D indisponível neste navegador.');
    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('O canvas não gerou o PNG.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
