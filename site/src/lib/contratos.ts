// Tipos dos arquivos de dados, espelhando /contracts/schemas. O front tolera campos ausentes:
// quem lê JSON de rede deve tratar tudo como Partial até validar o que usa.

export type UF =
  | 'AC' | 'AL' | 'AM' | 'AP' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO' | 'MA' | 'MG' | 'MS' | 'MT' | 'PA'
  | 'PB' | 'PE' | 'PI' | 'PR' | 'RJ' | 'RN' | 'RO' | 'RR' | 'RS' | 'SC' | 'SE' | 'SP' | 'TO';

export const UFS: readonly UF[] = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

export interface Candidato {
  n: number;
  nome: string;
  partido: string;
  votos: number;
  pct: number;
  eleito: boolean;
}

/** Variação em pontos percentuais vs 2022, indexada pelo número de urna ("13", "22"). Vazia quando não há 2022. */
export type Variacao2022 = Record<string, number>;

export interface CargoPlacar {
  cand: Candidato[];
  variacao_2022: Variacao2022;
  brancos: number;
  nulos: number;
}

/** /data/br.json e /data/uf/{uf}.json */
export interface Placar {
  v: 1;
  turno: 2;
  atualizado: string;
  secoes_pct: number;
  comparecimento_pct: number;
  abstencao_pct: number;
  presidente: CargoPlacar;
  governador: CargoPlacar | null;
}

export interface CargoCidade {
  cand: Candidato[];
  variacao_2022: Variacao2022;
  diferenca_votos: number;
}

export type Selo = 'mais_dividida_br' | 'mais_dividida_uf' | 'mais_unanime_br' | 'maior_virada_br' | 'maior_virada_uf';

/** /data/c/{slug}.json */
export interface Cidade {
  v: 1;
  slug: string;
  nome: string;
  uf: UF;
  cod_tse: number;
  cod_ibge: number;
  eleitores: number;
  atualizado: string;
  secoes_pct: number;
  presidente: CargoCidade;
  governador: CargoCidade | null;
  selos: Selo[];
  rank: { dividida_br: number | null; dividida_uf: number | null; virada_uf: number | null };
  virou: boolean;
}

/** src/data/hist/{slug}.json, src/data/hist-uf/{uf}.json e src/data/hist-br.json (embutidos no build). */
export interface Hist {
  t2_2022: { pct: { '13': number; '22': number }; comparecimento_pct: number } | null;
  t1_2026: { pct: { '13': number; '22': number; outros: number }; comparecimento_pct: number };
}

/** /data/rankings.json */
export interface Rankings {
  dividida: string[];
  unanime: string[];
  virada: string[];
  capitais: string[];
}

/** src/data/municipios.json */
export interface Municipio {
  slug: string;
  nome: string;
  uf: UF;
  cod_tse: number;
  cod_ibge: number;
  lat: number;
  lon: number;
  eleitores: number;
}

export const NOME_UF: Readonly<Record<UF, string>> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul',
  SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};
