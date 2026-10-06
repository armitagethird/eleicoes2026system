// Prints de aprovação do /design (CHECKPOINT da Fase 1), salvos em design/prints/:
//   design-350.png e design-1200.png: a página inteira com viewport de 350 e de 1200 px;
//   cards/*.png: o PNG que o botão "Baixar PNG" exporta de verdade (fonte e bandeira embutidas), um por variante.
// Precisa do dev server no ar (npm run dev). Rodar: npm run prints. PRINTS_URL troca o endereço (padrão do Astro).
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';
import sharp from 'sharp';

const SAIDA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'prints');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGINA = `${process.env.PRINTS_URL ?? 'http://localhost:4321'}/design`;
// Acima disto o Chrome corta o print da página inteira.
const ALTURA_MAXIMA = 16384;

async function abrir(browser: Browser, largura: number): Promise<Page> {
  const contexto = await browser.newContext({ viewport: { width: largura, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const pagina = await contexto.newPage();
  try {
    await pagina.goto(PAGINA, { waitUntil: 'networkidle' });
  } catch (erro) {
    throw new Error(`Não consegui abrir ${PAGINA}: ${erro instanceof Error ? erro.message : String(erro)}. Suba o dev server (npm run dev) ou ajuste PRINTS_URL.`);
  }
  // A barra do Astro dev ficaria por cima do print.
  await pagina.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
  await pagina.evaluate(() => document.fonts.ready);
  return pagina;
}

async function paginaInteira(pagina: Page, largura: number): Promise<void> {
  const altura = await pagina.evaluate(() => document.documentElement.scrollHeight);
  if (altura > ALTURA_MAXIMA) throw new Error(`A página tem ${altura} px de altura a ${largura} px de largura: passa de ${ALTURA_MAXIMA} px e o print sairia cortado.`);
  const arquivo = join(SAIDA, `design-${largura}.png`);
  await pagina.screenshot({ path: arquivo, fullPage: true });
  console.log(`${arquivo} (${largura}x${altura})`);
}

/** Clica em cada "Baixar PNG" e guarda o arquivo baixado: é o export real, não uma simulação dele. */
async function baixarCards(pagina: Page): Promise<void> {
  const pasta = join(SAIDA, 'cards');
  await rm(pasta, { recursive: true, force: true });
  await mkdir(pasta, { recursive: true });
  const ids = await pagina.$$eval('[data-baixar]', (botoes) => botoes.map((botao) => (botao as HTMLElement).dataset.baixar ?? ''));
  for (const id of ids) {
    const download = pagina.waitForEvent('download', { timeout: 15_000 });
    await pagina.click(`[data-baixar="${id}"]`);
    const arquivo = await download.catch(async () => {
      const estado = await pagina.textContent(`#v-${id} [data-estado]`);
      throw new Error(`"Baixar PNG" de ${id} não baixou nada. Status da página: ${estado || '(vazio)'}`);
    });
    const destino = join(pasta, arquivo.suggestedFilename());
    await arquivo.saveAs(destino);
    const { width, height } = await sharp(destino).metadata();
    if (width !== 1200 || height !== 675) throw new Error(`${destino} saiu com ${width}x${height}, esperado 1200x675.`);
    console.log(`${destino} (${width}x${height}, ${Math.round((await stat(destino)).size / 1024)} KB)`);
  }
}

await mkdir(SAIDA, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const celular = await abrir(browser, 350);
  await paginaInteira(celular, 350);
  const desktop = await abrir(browser, 1200);
  await paginaInteira(desktop, 1200);
  await baixarCards(desktop);
} finally {
  await browser.close();
}
