// Grava os resultados reais: public/mapa/{id}.json (camadas do mapa) e src/data/hist/*, hist-uf/* e hist-br.json.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Municipio } from '../../src/lib/contratos.ts';
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

export async function gerar(): Promise<void> {
  const municipios = await lerJson<Municipio[]>(join(DIR_DADOS, 'municipios.json'));
  const ibgePorTse = new Map(municipios.map((m) => [m.cod_tse, m.cod_ibge]));
  const agregados = {} as Record<IdHistorico, Agregado>;
  for (const e of ELEICOES) agregados[e.id] = await lerJson<Agregado>(caminhoAgregado(e.id));

  await mkdir(DIR_MAPA, { recursive: true });
  for (const e of ELEICOES) {
    const camada = montarCamada(e, agregados[e.id], ibgePorTse);
    await writeFile(join(DIR_MAPA, `${e.id}.json`), serializarCamada(camada));
    console.log(`public/mapa/${e.id}.json: ${camada.municipios.length} municípios, ${Object.keys(camada.ufs).length} UFs`);
  }

  const t2022 = agregados['2022-t2'];
  const t1 = agregados['2026-t1'];
  const dirCidades = join(DIR_DADOS, 'hist');
  const dirUfs = join(DIR_DADOS, 'hist-uf');
  await rm(dirCidades, { recursive: true, force: true });
  await rm(dirUfs, { recursive: true, force: true });
  await mkdir(dirCidades, { recursive: true });
  await mkdir(dirUfs, { recursive: true });

  let sem2022 = 0;
  for (const m of municipios) {
    const em2026 = t1.municipios[String(m.cod_tse)];
    if (!em2026) throw new Error(`${m.slug}: sem votos no 1º turno de 2026`);
    const em2022 = t2022.municipios[String(m.cod_tse)];
    const hist = montarHist(em2022, em2026);
    if (!hist.t2_2022) sem2022++;
    await gravaJson(join(dirCidades, `${m.slug}.json`), hist);
  }

  for (const uf of new Set(municipios.map((m) => m.uf))) {
    const igual = (u: string) => u === uf;
    await gravaJson(join(dirUfs, `${uf.toLowerCase()}.json`), montarHist(resumir(t2022, igual), resumir(t1, igual)));
  }
  // O Brasil inclui o Exterior (zona ZZ), como o resultado oficial.
  await gravaJson(join(DIR_DADOS, 'hist-br.json'), montarHist(resumir(t2022, () => true), resumir(t1, () => true)));
  console.log(`hist: ${municipios.length} municípios (${sem2022} sem 2022), 27 UFs, Brasil`);
}
