// Grava os resultados reais: public/mapa/{id}.json (camadas do mapa) e src/data/hist/*, hist-uf/* e hist-br.json.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CamadaJson } from '../../src/lib/camada-mapa.ts';
import type { Hist, Municipio } from '../../src/lib/contratos.ts';
import { type Agregado, caminhoAgregado } from './agregar.ts';
import { acumular, montarCamada, montarHist, type Resumo, serializarCamada } from './camada.ts';
import { DIR_DADOS, DIR_MAPA, ELEICOES, type IdHistorico } from './fontes.ts';

const lerJson = async <T>(caminho: string): Promise<T> => JSON.parse(await readFile(caminho, 'utf8')) as T;
const gravaJson = (caminho: string, dados: unknown): Promise<void> => writeFile(caminho, `${JSON.stringify(dados, null, 2)}\n`);

/** Soma o resumo (votos, aptos, comparecimento) dos municípios que passam no filtro. */
function resumir(agregado: Agregado, filtro: (uf: string) => boolean): Resumo {
  const votos: Record<string, number> = {};
  let aptos = 0;
  let comparecimento = 0;
  for (const m of Object.values(agregado.municipios)) {
    if (!filtro(m.uf)) continue;
    acumular(votos, m.votos);
    aptos += m.aptos;
    comparecimento += m.comparecimento;
  }
  return { votos, aptos, comparecimento };
}

export interface Resultados {
  camadas: Array<{ id: IdHistorico; camada: CamadaJson }>;
  cidades: Array<{ slug: string; hist: Hist }>;
  ufs: Array<{ uf: string; hist: Hist }>;
  brasil: Hist;
  sem2022: number;
}

/** Monta tudo em memória antes de gravar: se algo falhar aqui, nenhum arquivo versionado foi tocado. */
export function montarResultados(municipios: Municipio[], agregados: Record<IdHistorico, Agregado>): Resultados {
  const ibgePorTse = new Map(municipios.map((m) => [m.cod_tse, m.cod_ibge]));
  const camadas = ELEICOES.map((e) => ({ id: e.id, camada: montarCamada(e, agregados[e.id], ibgePorTse) }));

  const t2022 = agregados['2022-t2'];
  const t1 = agregados['2026-t1'];
  let sem2022 = 0;
  const cidades = municipios.map((m) => {
    const em2026 = t1.municipios[String(m.cod_tse)];
    if (!em2026) throw new Error(`${m.slug}: sem votos no 1º turno de 2026`);
    const hist = montarHist(t2022.municipios[String(m.cod_tse)], em2026);
    if (!hist.t2_2022) sem2022++;
    return { slug: m.slug, hist };
  });

  const ufs = [...new Set(municipios.map((m) => m.uf))].map((uf) => {
    const igual = (u: string) => u === uf;
    return { uf, hist: montarHist(resumir(t2022, igual), resumir(t1, igual)) };
  });
  // O Brasil inclui o Exterior (zona ZZ), como o resultado oficial.
  const brasil = montarHist(resumir(t2022, () => true), resumir(t1, () => true));
  return { camadas, cidades, ufs, brasil, sem2022 };
}

export async function gerar(): Promise<void> {
  const municipios = await lerJson<Municipio[]>(join(DIR_DADOS, 'municipios.json'));
  const agregados = {} as Record<IdHistorico, Agregado>;
  for (const e of ELEICOES) agregados[e.id] = await lerJson<Agregado>(caminhoAgregado(e.id));
  const { camadas, cidades, ufs, brasil, sem2022 } = montarResultados(municipios, agregados);

  await mkdir(DIR_MAPA, { recursive: true });
  for (const { id, camada } of camadas) {
    await writeFile(join(DIR_MAPA, `${id}.json`), serializarCamada(camada));
    console.log(`public/mapa/${id}.json: ${camada.municipios.length} municípios, ${Object.keys(camada.ufs).length} UFs`);
  }

  const dirCidades = join(DIR_DADOS, 'hist');
  const dirUfs = join(DIR_DADOS, 'hist-uf');
  await rm(dirCidades, { recursive: true, force: true });
  await rm(dirUfs, { recursive: true, force: true });
  await mkdir(dirCidades, { recursive: true });
  await mkdir(dirUfs, { recursive: true });
  for (const { slug, hist } of cidades) await gravaJson(join(dirCidades, `${slug}.json`), hist);
  for (const { uf, hist } of ufs) await gravaJson(join(dirUfs, `${uf.toLowerCase()}.json`), hist);
  await gravaJson(join(DIR_DADOS, 'hist-br.json'), brasil);
  console.log(`hist: ${cidades.length} municípios (${sem2022} sem 2022), ${ufs.length} UFs, Brasil`);
}
