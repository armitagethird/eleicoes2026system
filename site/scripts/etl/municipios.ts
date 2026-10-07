// Monta src/data/municipios.json: nome, UF e código IBGE (API do IBGE), centroide (malhas IBGE v4), código TSE (de-para do
// próprio TSE, campos cd e cdi do config de 2026) e eleitorado apto (1º turno 2026). A contagem vem da fonte, nunca é fixa.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slugMunicipio } from '../../src/lib/slug.ts';
import type { Municipio, UF } from '../../src/lib/contratos.ts';
import { type Agregado, caminhoAgregado } from './agregar.ts';
import { CACHE, DIR_DADOS } from './fontes.ts';

export interface MunicipioIbge {
  id: number;
  nome: string;
  'regiao-imediata': { 'regiao-intermediaria': { UF: { sigla: string } } };
}

export interface CentroideIbge {
  id: string;
  centroide: { latitude: number; longitude: number };
}

export interface ConfigTse {
  abr: { cd: string; mu?: { cd: string; cdi: string; nm: string }[] }[];
}

const semAcento = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Pares (IBGE, TSE) em que o nome difere depois de tirar acento, caixa e pontuação: para conferir à mão, não para barrar. */
export function nomesDivergentes(ibge: readonly MunicipioIbge[], tse: ConfigTse): string[] {
  const nomeTse = new Map(tse.abr.flatMap((uf) => (uf.mu ?? []).map((m) => [Number(m.cdi), m.nm] as const)));
  return ibge.flatMap((m) => {
    const t = nomeTse.get(m.id);
    return t !== undefined && semAcento(t) !== semAcento(m.nome) ? [`${m.id} IBGE "${m.nome}" x TSE "${t}"`] : [];
  });
}

export function montarMunicipios(
  ibge: readonly MunicipioIbge[],
  centroides: readonly CentroideIbge[],
  tse: ConfigTse,
  eleitoresPorTse: ReadonlyMap<number, number>,
): Municipio[] {
  const centro = new Map(centroides.map((c) => [Number(c.id), c.centroide]));
  const codigoTse = new Map(tse.abr.flatMap((uf) => (uf.mu ?? []).filter((m) => m.cdi !== '').map((m) => [Number(m.cdi), Number(m.cd)] as const)));

  const municipios = ibge
    .map((m): Municipio => {
      const c = centro.get(m.id);
      const cod_tse = codigoTse.get(m.id);
      if (!c) throw new Error(`${m.nome} (${m.id}): sem centroide no IBGE`);
      if (cod_tse === undefined) throw new Error(`${m.nome} (${m.id}): sem código TSE no de-para`);
      const eleitores = eleitoresPorTse.get(cod_tse);
      if (eleitores === undefined || eleitores <= 0) throw new Error(`${m.nome} (${m.id}, TSE ${cod_tse}): sem eleitorado em 2026`);
      const uf = m['regiao-imediata']['regiao-intermediaria'].UF.sigla as UF;
      return { slug: slugMunicipio(m.nome, uf), nome: m.nome, uf, cod_tse, cod_ibge: m.id, lat: c.latitude, lon: c.longitude, eleitores };
    })
    .sort((a, b) => a.cod_ibge - b.cod_ibge);

  const vistos = new Map<string, number>();
  for (const m of municipios) {
    const outro = vistos.get(m.slug);
    if (outro !== undefined) throw new Error(`slug duplicado "${m.slug}": IBGE ${outro} e ${m.cod_ibge}`);
    vistos.set(m.slug, m.cod_ibge);
  }
  return municipios;
}

const lerJson = async <T>(arquivo: string): Promise<T> => JSON.parse(await readFile(join(CACHE, arquivo), 'utf8')) as T;

export async function gerarMunicipios(): Promise<void> {
  const ibge = await lerJson<MunicipioIbge[]>('ibge-municipios.json');
  const centroides = await lerJson<CentroideIbge[]>('ibge-centroides.json');
  const tse = await lerJson<ConfigTse>('tse-municipios-2026.json');
  const agregado = JSON.parse(await readFile(caminhoAgregado('2026-t1'), 'utf8')) as Agregado;
  const eleitores = new Map(Object.entries(agregado.municipios).map(([cd, m]) => [Number(cd), m.aptos]));

  const municipios = montarMunicipios(ibge, centroides, tse, eleitores);
  await writeFile(join(DIR_DADOS, 'municipios.json'), `[\n${municipios.map((m) => JSON.stringify(m)).join(',\n')}\n]\n`);

  const divergentes = nomesDivergentes(ibge, tse);
  console.log(`municipios.json: ${municipios.length} municípios (IBGE: ${ibge.length}); nomes IBGE x TSE divergentes: ${divergentes.length}`);
  for (const d of divergentes) console.log(`  ${d}`);
}
