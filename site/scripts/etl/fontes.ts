// O que o ETL lê e onde guarda. Os zips do TSE (2,3 GB no total) ficam em site/.builds/etl-cache, fora do git.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CandidatoCamada } from '../../src/lib/camada-mapa.ts';

const SITE = fileURLToPath(new URL('../../', import.meta.url));
export const CACHE = join(SITE, '.builds/etl-cache');
export const DIR_DADOS = join(SITE, 'src/data');
export const DIR_MAPA = join(SITE, 'public/mapa');

const TSE = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
const IBGE = 'https://servicodados.ibge.gov.br/api';

export interface Fonte {
  arquivo: string;
  url: string;
  /** Para que serve, no README. */
  uso: string;
  /** Quantos municípios a fonte lista, para conferir a contagem de municipios.json (só nas fontes em JSON). */
  municipios?: (json: never) => number;
}

export const FONTES: readonly Fonte[] = [
  {
    arquivo: 'ibge-municipios.json',
    url: `${IBGE}/v1/localidades/municipios`,
    uso: 'nome, UF e código IBGE dos municípios',
    municipios: (lista: unknown[]) => lista.length,
  },
  {
    arquivo: 'ibge-centroides.json',
    url: `${IBGE}/v4/malhas/paises/BR/metadados?intrarregiao=municipio`,
    uso: 'centroide de cada município (lat/lon)',
    municipios: (lista: unknown[]) => lista.length,
  },
  {
    arquivo: 'tse-municipios-2026.json',
    url: 'https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json',
    uso: 'de-para código TSE (cd) e IBGE (cdi)',
    // O exterior (uf "zz") lista cidades estrangeiras, que não são municípios.
    municipios: (config: { abr: { cd: string; mu?: unknown[] }[] }) => config.abr.filter((uf) => uf.cd !== 'zz').reduce((soma, uf) => soma + (uf.mu?.length ?? 0), 0),
  },
  { arquivo: 'votacao_candidato_munzona_2018.zip', url: `${TSE}/votacao_candidato_munzona/votacao_candidato_munzona_2018.zip`, uso: 'votos por candidato, município e zona, 2018' },
  { arquivo: 'votacao_candidato_munzona_2022.zip', url: `${TSE}/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip`, uso: 'votos por candidato, município e zona, 2022' },
  { arquivo: 'detalhe_votacao_munzona_2018.zip', url: `${TSE}/detalhe_votacao_munzona/detalhe_votacao_munzona_2018.zip`, uso: 'eleitorado e comparecimento por município e zona, 2018' },
  { arquivo: 'detalhe_votacao_munzona_2022.zip', url: `${TSE}/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip`, uso: 'eleitorado e comparecimento por município e zona, 2022' },
  { arquivo: 'votacao_secao_2026_BR.zip', url: `${TSE}/votacao_secao/votacao_secao_2026_BR.zip`, uso: 'votos para presidente por seção, 1º turno 2026' },
  { arquivo: 'detalhe_votacao_secao_2026.zip', url: `${TSE}/detalhe_votacao_secao/detalhe_votacao_secao_2026.zip`, uso: 'eleitorado e comparecimento por seção, 1º turno 2026' },
  { arquivo: 'relatorio_totalizacao_2018_BR.zip', url: `${TSE}/relatorio_resultado_totalizacao/Relatorio_Resultado_Totalizacao_2018_BR.zip`, uso: 'totais nacionais oficiais (conferência), 2018' },
  { arquivo: 'relatorio_totalizacao_2022_BR.zip', url: `${TSE}/relatorio_resultado_totalizacao/Relatorio_Resultado_Totalizacao_2022_BR.zip`, uso: 'totais nacionais oficiais (conferência), 2022' },
  { arquivo: 'relatorio_totalizacao_2026_BR.zip', url: `${TSE}/relatorio_resultado_totalizacao/Relatorio_Resultado_Totalizacao_2026_BR.zip`, uso: 'totais nacionais oficiais (conferência), 2026' },
];

export type IdHistorico = '2018-t1' | '2018-t2' | '2022-t1' | '2022-t2' | '2026-t1';

/** Onde estão os votos e o detalhe (eleitorado, comparecimento) de uma eleição. `munzona` e `secao` têm colunas diferentes. */
interface Arquivo {
  zip: string;
  entrada: string;
  formato: 'munzona' | 'secao';
}

export interface Eleicao {
  id: IdHistorico;
  rotulo: string;
  turno: 1 | 2;
  /** Os dois candidatos que a camada compara, na ordem das colunas (A, B). */
  candidatos: [CandidatoCamada, CandidatoCamada];
  votos: Arquivo;
  detalhe: Arquivo;
  /**
   * Números de urna cujos votos o TSE conta como nulos técnicos (candidatura indeferida). O arquivo por zona já os separa
   * (QT_VOTOS_NOMINAIS_VALIDOS); o por seção não, então a exclusão é explícita.
   */
  nulosTecnicos?: readonly string[];
}

const HADDAD: CandidatoCamada = { n: 13, nome: 'Fernando Haddad', partido: 'PT', cor: '13' };
// Em 2018 o candidato do Bolsonaro era o 17 (PSL): a cor segue o campo, não o número.
const BOLSONARO_2018: CandidatoCamada = { n: 17, nome: 'Jair Bolsonaro', partido: 'PSL', cor: '22' };
const LULA: CandidatoCamada = { n: 13, nome: 'Lula', partido: 'PT', cor: '13' };
const BOLSONARO_2022: CandidatoCamada = { n: 22, nome: 'Jair Bolsonaro', partido: 'PL', cor: '22' };
const FLAVIO: CandidatoCamada = { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', cor: '22' };

const munzona = (ano: number): { votos: Arquivo; detalhe: Arquivo } => ({
  votos: { zip: `votacao_candidato_munzona_${ano}.zip`, entrada: `votacao_candidato_munzona_${ano}_BR.csv`, formato: 'munzona' },
  detalhe: { zip: `detalhe_votacao_munzona_${ano}.zip`, entrada: `detalhe_votacao_munzona_${ano}_BR.csv`, formato: 'munzona' },
});

export const ELEICOES: readonly Eleicao[] = [
  { id: '2018-t1', rotulo: '1º turno 2018', turno: 1, candidatos: [HADDAD, BOLSONARO_2018], ...munzona(2018) },
  { id: '2018-t2', rotulo: '2º turno 2018', turno: 2, candidatos: [HADDAD, BOLSONARO_2018], ...munzona(2018) },
  { id: '2022-t1', rotulo: '1º turno 2022', turno: 1, candidatos: [LULA, BOLSONARO_2022], ...munzona(2022) },
  { id: '2022-t2', rotulo: '2º turno 2022', turno: 2, candidatos: [LULA, BOLSONARO_2022], ...munzona(2022) },
  {
    id: '2026-t1',
    rotulo: '1º turno 2026',
    turno: 1,
    candidatos: [LULA, FLAVIO],
    votos: { zip: 'votacao_secao_2026_BR.zip', entrada: 'votacao_secao_2026_BR.csv', formato: 'secao' },
    detalhe: { zip: 'detalhe_votacao_secao_2026.zip', entrada: 'detalhe_votacao_secao_2026_BR.csv', formato: 'secao' },
    // Leonardo Alves de Araújo (28): 5.246 votos, listados como "nulos técnicos" no Relatório de Totalização de 05/10/2026.
    nulosTecnicos: ['28'],
  },
];
