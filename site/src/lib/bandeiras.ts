// URLs dos rasters das bandeiras (src/assets/flags/raster, gerados por `npm run flags:raster`).
// As larguras disponíveis vêm dos nomes dos arquivos ({uf}-{largura}.webp): o diretório é a fonte de verdade.
import type { UF } from './contratos.ts';

export type Sigla = Lowercase<UF> | 'br';

// no-inline: o Vite embute em data: URI o que pesa menos de 4 KB, e quase todo WebP pequeno cai nisso; num srcset
// repetido pela página isso incharia o HTML em vez de virar um arquivo com cache imutável.
// (O Vite só aceita o objeto de opções literal, por isso ele se repete.)
const arquivosWebp = import.meta.glob<string>('../assets/flags/raster/*.webp', { eager: true, query: '?url&no-inline', import: 'default' });
const arquivosPng = import.meta.glob<string>('../assets/flags/raster/*.png', { eager: true, query: '?url&no-inline', import: 'default' });

const NOME_DO_ARQUIVO = /\/([a-z]{2})-(\d+)\.\w+$/;

interface Raster {
  largura: number;
  url: string;
}

const webpPorUf = new Map<string, Raster[]>();
for (const [caminho, url] of Object.entries(arquivosWebp)) {
  const [, uf, largura] = NOME_DO_ARQUIVO.exec(caminho) ?? [];
  webpPorUf.set(uf, [...(webpPorUf.get(uf) ?? []), { largura: Number(largura), url }]);
}
for (const lista of webpPorUf.values()) lista.sort((a, b) => a.largura - b.largura);

const pngPorUf = new Map(Object.entries(arquivosPng).map(([caminho, url]) => [NOME_DO_ARQUIVO.exec(caminho)?.[1], url]));

const semRaster = (uf: string) => new Error(`Bandeira "${uf}" sem raster em src/assets/flags/raster (rodar npm run flags:raster)`);

/** URL do PNG de 160 px da bandeira (para embutir no card e na ilha de compartilhar). Aceita "ma" ou "MA". */
export function urlBandeiraPng(uf: string): string {
  const url = pngPorUf.get(uf.toLowerCase());
  if (!url) throw semRaster(uf);
  return url;
}

/**
 * `src` (1x) e `srcset` (1x, 2x, 3x) de uma caixa de `largura` px CSS: em cada densidade, o menor WebP que cobre
 * largura x densidade. Acima do maior raster usa o maior.
 */
export function rasterBandeira(uf: string, largura: number): { src: string; srcset: string } {
  const lista = webpPorUf.get(uf.toLowerCase());
  if (!lista) throw semRaster(uf);
  const escolher = (densidade: number) => (lista.find((r) => r.largura >= Math.ceil(largura * densidade)) ?? lista[lista.length - 1]).url;
  const urls = [1, 2, 3].map(escolher);
  return { src: urls[0], srcset: urls.map((url, i) => `${url} ${i + 1}x`).join(', ') };
}

// "Bandeira " + isto: a preposição muda por estado (do Acre, da Bahia, de Alagoas).
const DE_QUEM: Record<Sigla, string> = {
  br: 'do Brasil',
  ac: 'do Acre',
  al: 'de Alagoas',
  am: 'do Amazonas',
  ap: 'do Amapá',
  ba: 'da Bahia',
  ce: 'do Ceará',
  df: 'do Distrito Federal',
  es: 'do Espírito Santo',
  go: 'de Goiás',
  ma: 'do Maranhão',
  mg: 'de Minas Gerais',
  ms: 'de Mato Grosso do Sul',
  mt: 'de Mato Grosso',
  pa: 'do Pará',
  pb: 'da Paraíba',
  pe: 'de Pernambuco',
  pi: 'do Piauí',
  pr: 'do Paraná',
  rj: 'do Rio de Janeiro',
  rn: 'do Rio Grande do Norte',
  ro: 'de Rondônia',
  rr: 'de Roraima',
  rs: 'do Rio Grande do Sul',
  sc: 'de Santa Catarina',
  se: 'de Sergipe',
  sp: 'de São Paulo',
  to: 'do Tocantins',
};

export const altBandeira = (uf: Sigla): string => `Bandeira ${DE_QUEM[uf]}`;
