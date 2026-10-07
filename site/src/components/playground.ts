// Ilha do playground (/design): troca o acento do selo (renderCard aceita `acento`; é só a cor do selo: a faixa verde e amarela,
// o vermelho e o azul dos candidatos não mudam) e baixa o PNG de cada variante pelo mesmo caminho do botão Compartilhar
// (card-png.ts, com a fonte e a bandeira embutidas), para conferir a paridade com o inline.
import { carregarFonteCard, paraDataUri, svgParaPng } from '../lib/card-png.ts';
import { renderCard, type Acento, type CardData } from './Card.ts';

interface Variante {
  id: string;
  rotulo: string;
  card: CardData;
}

const dados = document.getElementById('playground-dados');
if (!dados?.textContent) throw new Error('Playground sem dados: faltou o <script id="playground-dados"> da página.');
const variantes = new Map((JSON.parse(dados.textContent) as Variante[]).map((v) => [v.id, v]));

let acento: Acento = 'ouro';

/** O acento vira data-acento no <html> (tokens.css) e o card é redesenhado (só o selo muda): o SVG leva a cor escrita, não var(). */
function aplicarAcento(valor: Acento): void {
  acento = valor;
  document.documentElement.dataset.acento = valor;
  for (const espaco of document.querySelectorAll<HTMLElement>('[data-card]')) {
    const variante = variantes.get(espaco.dataset.card ?? '');
    if (variante) espaco.innerHTML = renderCard({ ...variante.card, acento });
  }
}

function salvar(png: Blob, nome: string): void {
  const url = URL.createObjectURL(png);
  Object.assign(document.createElement('a'), { href: url, download: nome }).click();
  // Revogar na hora cancela o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function baixar(botao: HTMLButtonElement): Promise<void> {
  const variante = variantes.get(botao.dataset.baixar ?? '');
  const estado = botao.closest('[data-variante]')?.querySelector<HTMLElement>('[data-estado]');
  if (!variante || !estado) throw new Error(`Botão "Baixar PNG" sem variante: ${botao.dataset.baixar}`);

  const rotuloDoBotao = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Gerando…';
  estado.textContent = '';
  try {
    const { card } = variante;
    const [fonteDataUri, bandeiraHref] = await Promise.all([
      carregarFonteCard(),
      card.bandeiraHref ? paraDataUri(card.bandeiraHref) : undefined,
    ]);
    const png = await svgParaPng(renderCard({ ...card, acento, fonteDataUri, bandeiraHref }));
    salvar(png, `card-${variante.id}${acento === 'ouro' ? '' : `-${acento}`}.png`);
    estado.textContent = `PNG 1200×675 · ${Math.round(png.size / 1024)} KB`;
  } catch (erro) {
    estado.textContent = `Não foi possível gerar o PNG de "${variante.rotulo}": ${erro instanceof Error ? erro.message : String(erro)}`;
  } finally {
    botao.disabled = false;
    botao.textContent = rotuloDoBotao;
  }
}

document.addEventListener('click', (evento) => {
  const botao = (evento.target as Element).closest<HTMLButtonElement>('[data-baixar]');
  if (botao) void baixar(botao);
});

const seletor = document.querySelector<HTMLElement>('[data-acentos]');
seletor?.addEventListener('change', (evento) => aplicarAcento((evento.target as HTMLInputElement).value as Acento));
// Ao recarregar, o navegador devolve o rádio escolhido antes: o card tem de acompanhá-lo.
const escolhido = seletor?.querySelector<HTMLInputElement>('input:checked');
if (escolhido && escolhido.value !== acento) aplicarAcento(escolhido.value as Acento);
