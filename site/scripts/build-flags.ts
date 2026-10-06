// Baixa as 28 bandeiras oficiais (Wikimedia Commons, domínio público), otimiza com svgo e grava
// src/assets/flags/{uf}.svg + README.md (origem, licença, viewBox, proporção). Rodar só para refazer: npm run flags
// Regra da Lei 5.700/1971: forma, cores e proporções NÃO podem ser alteradas. O svgo só remove metadados e redundâncias;
// o viewBox é mantido (ou criado a partir de width/height). Cada arquivo otimizado é comparado pixel a pixel com o
// original no Chrome; se diferir além do ruído de antialiasing, tenta uma configuração mais conservadora.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { optimize } from 'svgo';

const destino = join(dirname(fileURLToPath(import.meta.url)), '../src/assets/flags');
const UA = { 'User-Agent': 'eleicoes2026-setup/1.0 (romerosaraiva4@gmail.com)' };
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIMITE_PIXELS_DIFERENTES = 0.0015; // 0,15% dos pixels (bordas com antialiasing)

const ARQUIVOS: Record<string, string> = {
  br: 'Flag of Brazil.svg',
  ac: 'Bandeira do Acre.svg',
  al: 'Bandeira de Alagoas.svg',
  am: 'Bandeira do Amazonas.svg',
  ap: 'Bandeira do Amapá.svg',
  ba: 'Bandeira da Bahia.svg',
  ce: 'Bandeira do Ceará.svg',
  df: 'Bandeira do Distrito Federal (Brasil).svg',
  es: 'Bandeira do Espírito Santo.svg',
  go: 'Bandeira de Goiás.svg',
  ma: 'Bandeira do Maranhão.svg',
  mg: 'Bandeira de Minas Gerais.svg',
  ms: 'Bandeira de Mato Grosso do Sul.svg',
  mt: 'Bandeira de Mato Grosso.svg',
  pa: 'Bandeira do Pará.svg',
  pb: 'Bandeira da Paraíba.svg',
  pe: 'Bandeira de Pernambuco.svg',
  pi: 'Bandeira do Piauí.svg',
  pr: 'Bandeira do Paraná.svg',
  rj: 'Bandeira do estado do Rio de Janeiro.svg',
  rn: 'Bandeira do Rio Grande do Norte.svg',
  ro: 'Bandeira de Rondônia.svg',
  rr: 'Bandeira de Roraima.svg',
  rs: 'Bandeira do Rio Grande do Sul.svg',
  sc: 'Bandeira de Santa Catarina.svg',
  se: 'Bandeira de Sergipe.svg',
  sp: 'Bandeira do estado de São Paulo.svg',
  to: 'Bandeira do Tocantins.svg',
};

const paginaCommons = (arquivo: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(arquivo.replaceAll(' ', '_'))}`;

async function licencas(): Promise<Map<string, { licenca: string; largura: number; altura: number }>> {
  const titulos = Object.values(ARQUIVOS).map((a) => `File:${a}`).join('|');
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|size&iiextmetadatafilter=LicenseShortName&titles=${encodeURIComponent(titulos)}`;
  const json = (await (await fetch(url, { headers: UA })).json()) as {
    query: { pages: Record<string, { title: string; imageinfo: Array<{ width: number; height: number; extmetadata: { LicenseShortName: { value: string } } }> }> };
  };
  return new Map(
    Object.values(json.query.pages).map((p) => [
      p.title.replace(/^File:/, ''),
      { licenca: p.imageinfo[0].extmetadata.LicenseShortName.value, largura: p.imageinfo[0].width, altura: p.imageinfo[0].height },
    ]),
  );
}

const viewBoxDe = (svg: string): number[] | null => {
  const v = /viewBox="([^"]+)"/.exec(svg)?.[1];
  return v ? v.trim().split(/[\s,]+/).map(Number) : null;
};

/** Candidatos do mais ao menos agressivo; o primeiro que passar na comparação visual vence. */
function candidatos(svg: string): string[] {
  const otimizar = (convertTransform: boolean) =>
    optimize(svg, {
      multipass: true,
      plugins: [{ name: 'preset-default', params: { overrides: { convertTransform: convertTransform ? {} : false } } }, 'removeDimensions'],
    }).data;
  // convertTransform arredonda matrizes de escala minúscula para zero (acontece na bandeira de Alagoas).
  return [otimizar(true), otimizar(false)];
}

const navegador = await chromium.launch({ executablePath: CHROME });
const pagina = await navegador.newPage();
await pagina.setContent('<canvas id="a"></canvas><canvas id="b"></canvas>');

/** Fração de pixels que diferem (canal > 40/255) ao renderizar os dois SVGs em 800 px de largura. */
async function fracaoDiferente(original: string, otimizado: string): Promise<number> {
  return pagina.evaluate(
    async ([a, b]) => {
      const carregar = (svg: string) =>
        new Promise<HTMLImageElement>((ok, erro) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = () => erro(new Error('svg não carregou'));
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });
      const [ia, ib] = await Promise.all([carregar(a), carregar(b)]);
      // O original tem width/height; o otimizado só viewBox. Usa a proporção do original nos dois.
      const razao = ia.naturalWidth / ia.naturalHeight;
      const largura = 800;
      const altura = Math.round(largura / razao);
      const pixels = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = largura;
        c.height = altura;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, largura, altura);
        return ctx.getImageData(0, 0, largura, altura).data;
      };
      const [pa, pb] = [pixels(ia), pixels(ib)];
      let diferentes = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]), Math.abs(pa[i + 3] - pb[i + 3]));
        if (d > 40) diferentes++;
      }
      return diferentes / (largura * altura);
    },
    [original, otimizado] as const,
  );
}

const meta = await licencas();
await mkdir(destino, { recursive: true });
const linhas: string[] = [];

for (const [uf, arquivo] of Object.entries(ARQUIVOS)) {
  const resposta = await fetch(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(arquivo)}`, { headers: UA });
  if (!resposta.ok) throw new Error(`${arquivo}: HTTP ${resposta.status}`);
  const bruto = (await resposta.text()).replace(/^\uFEFF/, '');

  let escolhido: { data: string; diff: number; tentativa: number } | null = null;
  const lista = candidatos(bruto);
  for (const [i, data] of lista.entries()) {
    const diff = await fracaoDiferente(bruto, data);
    if (diff <= LIMITE_PIXELS_DIFERENTES) {
      escolhido = { data, diff, tentativa: i };
      break;
    }
  }
  if (!escolhido) throw new Error(`${uf}: nenhuma otimização preservou a imagem (limite ${LIMITE_PIXELS_DIFERENTES})`);
  const { data } = escolhido;

  const viewBox = viewBoxDe(data);
  if (!viewBox) throw new Error(`${uf}: sem viewBox depois do svgo`);
  const [, , w, h] = viewBox;
  const info = meta.get(arquivo.replaceAll('_', ' '));
  if (!info) throw new Error(`${uf}: sem metadados do Commons`);
  const razao = w / h;
  if (Math.abs(razao / (info.largura / info.altura) - 1) > 0.01) {
    throw new Error(`${uf}: proporção do viewBox (${razao.toFixed(3)}) difere da publicada (${(info.largura / info.altura).toFixed(3)})`);
  }
  if (uf === 'br' && Math.abs(razao - 10 / 7) > 0.001) throw new Error(`br: a bandeira nacional deve ser 10:7, veio ${razao}`);

  await writeFile(join(destino, `${uf}.svg`), data);
  const tamanho = `${(Buffer.byteLength(data) / 1024).toFixed(1)} KB`;
  linhas.push(`| ${uf} | ${paginaCommons(arquivo)} | ${info.licenca} | \`${viewBox.join(' ')}\` | ${razao.toFixed(3)} | ${tamanho} |`);
  console.log(`${uf}.svg  ${tamanho}  viewBox ${viewBox.join(' ')}  ${razao.toFixed(3)}  pixels diferentes ${(escolhido.diff * 100).toFixed(3)}%  (config ${escolhido.tentativa})`);
}
await navegador.close();

await writeFile(
  join(destino, 'README.md'),
  `# Bandeiras

28 bandeiras oficiais (Brasil + 27 UFs), Wikimedia Commons, todas marcadas como domínio público (Public domain) na página do arquivo. Gerado por \`npm run flags\`.

Regras de uso (Lei 5.700/1971): sempre inteiras, nunca com fundo, textura, marca d'água, recorte, recolor ou distorção. O svgo só removeu metadados e redundâncias (precisão padrão de 3 casas); o script compara cada arquivo otimizado com o original, pixel a pixel, no Chrome (limite de ${LIMITE_PIXELS_DIFERENTES * 100}% de pixels diferentes). O viewBox foi mantido (ou criado a partir de width/height) e as cores não foram tocadas. Width/height foram removidos: o tamanho vem do CSS e a proporção, do viewBox.

As proporções NÃO são iguais entre as UFs (cada estado tem a sua lei). Os ícones devem ter a mesma caixa e preservar a proporção (\`object-fit: contain\`), sem esticar. A bandeira do Brasil é 10:7.

| UF | Origem | Licença no Commons | viewBox | Proporção | Tamanho |
|---|---|---|---|---|---|
${linhas.join('\n')}
`,
);
