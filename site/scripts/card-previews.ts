// Gera em .shots/card/ o PNG de cada variante do card a 1200 e a 350 px de largura (como aparece na timeline do X).
// O PNG sai do caminho real do Compartilhar (card-png.ts no Chrome, com fonte e bandeira embutidas), e cada variante é
// conferida em duas frentes: o SVG inline (com a fonte da página) tem de ser pixel a pixel igual ao PNG exportado, e nenhum
// texto pode passar das margens. Rodar: npm run card:previews [filtro]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { renderCard, type CardData } from '../src/components/Card.ts';
import { cardDeCidade, cardDePlacar, comPalpite } from '../src/lib/card-dados.ts';
import type { Candidato, Cidade, Hist, Placar, UF } from '../src/lib/contratos.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAIDA = join(root, '.shots/card');
const ATUALIZADO = '2026-10-25T18:42:10-03:00';
// 1/255 por canal: o PNG sai do canvas e o inline da página, e a conversão de cor arredonda diferente em raros pixels.
const TOLERANCIA = 1;

const lula = (pct: number, votos = Math.round(pct * 3000), eleito = false): Candidato => ({ n: 13, nome: 'Lula', partido: 'PT', votos, pct, eleito });
const flavio = (pct: number, votos = Math.round(pct * 3000), eleito = false): Candidato => ({ n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', votos, pct, eleito });

interface Caso {
  nome: string;
  nomeCidade: string;
  uf: UF;
  secoes: number;
  pct13: number;
  /** Variação do 13 vs 2022; ausente = sem comparação. */
  variacao?: number;
  diferencaVotos?: number;
  selos?: Cidade['selos'];
  virou?: boolean;
  modo?: 'parcial' | 'final';
  hora?: string;
}

function cidade(c: Caso): Cidade {
  const v = c.variacao;
  return {
    v: 1,
    slug: c.nome,
    nome: c.nomeCidade,
    uf: c.uf,
    cod_tse: 0,
    cod_ibge: 0,
    eleitores: 0,
    atualizado: c.hora ?? ATUALIZADO,
    secoes_pct: c.secoes,
    presidente: {
      cand: [lula(c.pct13), flavio(100 - c.pct13)],
      variacao_2022: v === undefined ? {} : { '13': v, '22': -v },
      diferenca_votos: c.diferencaVotos ?? Math.round(Math.abs(2 * c.pct13 - 100) * 3000),
    },
    governador: null,
    selos: c.selos ?? [],
    rank: { dividida_br: null, dividida_uf: null, virada_uf: null },
    virou: c.virou ?? false,
  };
}

const casos: Caso[] = [
  { nome: 'parcial-10', nomeCidade: 'São Luís', uf: 'MA', secoes: 10.4, pct13: 58.6, variacao: -3.4, hora: '2026-10-25T17:48:00-03:00' },
  { nome: 'parcial-87', nomeCidade: 'São Luís', uf: 'MA', secoes: 87.3, pct13: 58.6, variacao: -3.4 },
  { nome: 'final', nomeCidade: 'Natal', uf: 'RN', secoes: 100, pct13: 63.8, variacao: 5.7, modo: 'final', hora: '2026-10-25T20:31:00-03:00' },
  { nome: 'virou', nomeCidade: 'Juiz de Fora', uf: 'MG', secoes: 94.1, pct13: 48.2, variacao: -4.9, virou: true },
  { nome: 'com-selo', nomeCidade: 'São Luís', uf: 'MA', secoes: 87.3, pct13: 51.3, variacao: 1.8, selos: ['mais_dividida_uf'] },
  { nome: 'sem-selo', nomeCidade: 'Campinas', uf: 'SP', secoes: 87.3, pct13: 44.3, variacao: 3.3 },
  { nome: 'nome-longo', nomeCidade: 'Vila Bela da Santíssima Trindade', uf: 'MT', secoes: 97.2, pct13: 46.9, variacao: 2.1, hora: '2026-10-25T19:05:00-03:00' },
  { nome: 'nome-medio', nomeCidade: "Santa Bárbara d'Oeste", uf: 'SP', secoes: 62, pct13: 38.5, variacao: -2.2, selos: ['maior_virada_uf'] },
  { nome: 'margem-0-1', nomeCidade: 'São João da Boa Vista', uf: 'SP', secoes: 96.8, pct13: 49.95, variacao: 4.1, diferencaVotos: 312 },
  { nome: 'cem-por-cento', nomeCidade: 'Una', uf: 'BA', secoes: 100, pct13: 100, variacao: 0.8, modo: 'final' },
  { nome: '22-lidera', nomeCidade: 'Jaú', uf: 'SP', secoes: 71.5, pct13: 38.3, variacao: 2.1 },
  { nome: 'sem-2022', nomeCidade: 'Rio Branco', uf: 'AC', secoes: 72, pct13: 41.3 },
  { nome: 'aguardando', nomeCidade: 'Natal', uf: 'RN', secoes: 0.4, pct13: 50, variacao: 0 },
  { nome: 'cedilha', nomeCidade: 'Açailândia', uf: 'MA', secoes: 55, pct13: 57.2, variacao: 1.4 },
  { nome: 'selo-longo', nomeCidade: 'Conceição do Mato Dentro', uf: 'MG', secoes: 88, pct13: 44.9, variacao: -4.2, selos: ['mais_dividida_br'] },
];

const historico = (pct13: number): Hist => ({
  t2_2022: { pct: { '13': pct13, '22': 100 - pct13 }, comparecimento_pct: 80 },
  t1_2026: { pct: { '13': 40, '22': 40, outros: 20 }, comparecimento_pct: 80 },
});

function placar(governador: Placar['governador']): Placar {
  return {
    v: 1,
    turno: 2,
    atualizado: ATUALIZADO,
    secoes_pct: 87.3,
    comparecimento_pct: 79.1,
    abstencao_pct: 20.9,
    presidente: { cand: [lula(51.5, 3356101), flavio(48.5, 3160389)], variacao_2022: { '13': -2, '22': 2 }, brancos: 0, nulos: 0 },
    governador,
  };
}

const governador = (nomeA: string, nomeB: string, pctA: number): NonNullable<Placar['governador']> => ({
  cand: [
    { n: 12, nome: nomeA, partido: 'FIC', votos: Math.round(pctA * 60000), pct: pctA, eleito: false },
    { n: 45, nome: nomeB, partido: 'FIC', votos: Math.round((100 - pctA) * 60000), pct: 100 - pctA, eleito: false },
  ],
  variacao_2022: {},
  brancos: 0,
  nulos: 0,
});

async function dataUri(arquivo: string, tipo: string): Promise<string> {
  return `data:${tipo};base64,${(await readFile(join(root, arquivo))).toString('base64')}`;
}

const bandeira = (uf: string): Promise<string> => dataUri(`src/assets/flags/${uf.toLowerCase()}.svg`, 'image/svg+xml');

const PAGINA = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Archivo; font-weight: 900; font-stretch: 62% 125%; src: url(/fonts/archivo/archivo-display.woff2) format('woff2'); }
html, body { margin: 0; background: #0e1411; } svg { display: block; }
</style><body><script type="module">import * as png from '/src/lib/card-png.ts'; window.png = png;</script>`;

const TIPOS: Record<string, string> = { '.woff2': 'font/woff2', '.ts': 'text/javascript' };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-lcd-text'] });
try {
  const contexto = await browser.newContext({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
  await contexto.route('http://card.test/**', async (rota) => {
    const { pathname } = new URL(rota.request().url());
    if (pathname === '/') return rota.fulfill({ contentType: 'text/html', body: PAGINA });
    if (pathname.startsWith('/src/lib/')) {
      return rota.fulfill({ contentType: TIPOS['.ts'], body: stripTypeScriptTypes(await readFile(join(root, pathname), 'utf8')) });
    }
    return rota.fulfill({ contentType: TIPOS['.woff2'], body: await readFile(join(root, 'public', pathname)) });
  });
  const pagina = await contexto.newPage();
  await pagina.goto('http://card.test/');
  await pagina.waitForFunction(() => 'png' in window);
  await pagina.evaluate(() => document.fonts.load('900 100px Archivo'));

  const fonte = await dataUri('public/fonts/archivo/card.woff2', 'font/woff2');
  const variantes: Array<{ nome: string; card: CardData }> = [];
  for (const c of casos) {
    const card = cardDeCidade(cidade(c), historico(c.pct13 - (c.variacao ?? 0)), c.modo ?? 'parcial');
    if (card) variantes.push({ nome: c.nome, card: { ...card, bandeiraHref: await bandeira(c.uf) } });
  }
  const base = variantes.find((v) => v.nome === 'parcial-87')?.card as CardData;
  variantes.push({ nome: 'palpite', card: comPalpite(base, 57) });
  variantes.push({ nome: 'palpite-22-lidera', card: comPalpite(base, 38.5) });
  variantes.push({ nome: 'palpite-final', card: { ...comPalpite(base, 61), erroPalpite: 2.6 } });
  variantes.push({ nome: 'palpite-final-acertou', card: { ...comPalpite(base, 58), erroPalpite: 0.04 } });
  const brasil = cardDePlacar(
    { ...placar(null), presidente: { ...placar(null).presidente, cand: [lula(50.9, 3356101, true), flavio(49.1, 3160389)] } },
    { nome: 'Brasil', uf: 'BR' },
    'final',
  ) as CardData;
  variantes.push({ nome: 'brasil-eleito', card: { ...brasil, bandeiraHref: await bandeira('br'), secoesPct: 100 } });
  const rj = { nome: 'Rio de Janeiro', uf: 'RJ' as const };
  const bandeiraRj = await bandeira('rj');
  for (const [nome, a, b, pct] of [
    ['governador', 'Fictício A', 'Fictícia B', 39.4],
    ['governador-nome-longo', 'Fictícia Aparecida dos Santos Pereira', 'Fictício Antônio Carlos de Souza Lima', 47.2],
  ] as const) {
    const card = cardDePlacar(placar(governador(a, b, pct)), rj, 'parcial', 'governador') as CardData;
    variantes.push({ nome, card: { ...card, bandeiraHref: bandeiraRj } });
  }

  const filtro = process.argv[2];
  await mkdir(SAIDA, { recursive: true });
  let falhas = 0;
  for (const { nome, card } of variantes.filter((v) => !filtro || v.nome.includes(filtro))) {
    const inline = renderCard(card);
    const medidas = await pagina.evaluate((svg) => {
      document.body.innerHTML = svg;
      return [...document.querySelectorAll('text')].map((t) => {
        const b = t.getBBox();
        return { classe: t.getAttribute('class') ?? '', esquerda: b.x, direita: b.x + b.width, texto: (t.textContent ?? '').slice(0, 30) };
      });
    }, inline);
    await pagina.evaluate(() => document.fonts.ready);
    const naPagina = await pagina.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 675 } });

    const exportado = await pagina.evaluate(
      async (svg) => {
        const w = window as unknown as { png: typeof import('../src/lib/card-png.ts') };
        const blob = await w.png.svgParaPng(svg);
        return w.png.paraDataUri(URL.createObjectURL(blob));
      },
      renderCard({ ...card, fonteDataUri: fonte }),
    );
    const bytes = Buffer.from(exportado.split(',')[1], 'base64');
    await writeFile(join(SAIDA, `${nome}-1200.png`), bytes);
    await sharp(bytes).resize({ width: 350, kernel: 'lanczos3' }).png().toFile(join(SAIDA, `${nome}-350.png`));

    const [a, b] = await Promise.all([naPagina, bytes].map((buf) => sharp(buf).ensureAlpha().raw().toBuffer()));
    let diferentes = 0;
    let maior = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      if (d > 0) diferentes += 1;
      if (d > maior) maior = d;
    }
    const estouros = medidas.filter((m) => m.esquerda < 46 || m.direita > 1154);
    if (estouros.length || maior > TOLERANCIA) falhas += 1;
    console.log(
      `${nome.padEnd(24)} png vs inline: ${diferentes} bytes diferentes (max ${maior}); ${estouros.length ? `ESTOURA: ${estouros.map((e) => `${e.texto} [${e.esquerda.toFixed(1)}..${e.direita.toFixed(1)}]`).join(', ')}` : 'dentro das margens'}`,
    );
  }
  if (falhas) process.exitCode = 1;
} finally {
  await browser.close();
}
