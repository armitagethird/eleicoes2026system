// Camada de dados do mapa de apuração e dos gráficos históricos: um arquivo por eleição e turno.
// Histórico em /mapa/{id}.json (gerado pelo ETL), ao vivo em /data/apuracao.json (worker). Contrato:
// contracts/schemas/camada-mapa.schema.json. Formato compacto porque cada arquivo traz os 5.571 municípios.
import { UFS, type UF } from './contratos.ts';

/**
 * Os dois candidatos que a camada compara, na ordem das colunas. `cor` diz qual cor de candidato usar
 * ('13' = vermelho, '22' = azul claro; null = neutro). Em 2018 o Bolsonaro era o 17 (PSL): a cor vem do dado, não do número.
 */
export interface CandidatoCamada {
  n: number;
  nome: string;
  partido: string;
  cor: '13' | '22' | null;
}

/** [pct A, pct B, pct outros, número de quem lidera quando não é A nem B (0 = A ou B lidera), % das seções]. pct sobre válidos. */
export type Linha = [number, number, number, number, number];

export interface CamadaJson {
  v: 1;
  id: string;
  rotulo: string;
  atualizado: string;
  candidatos: [CandidatoCamada, CandidatoCamada];
  br: Linha;
  ufs: Partial<Record<UF, Linha>>;
  /** [código IBGE, ...Linha] */
  municipios: [number, ...Linha][];
}

export interface Valor {
  a: number;
  b: number;
  outros: number;
  /** Número de urna de quem lidera quando não é nenhum dos dois; null quando A ou B lidera. */
  liderOutro: number | null;
  secoes: number;
}

export interface Camada {
  id: string;
  rotulo: string;
  atualizado: string;
  candidatos: [CandidatoCamada, CandidatoCamada];
  br: Valor | null;
  ufs: Map<UF, Valor>;
  municipios: Map<number, Valor>;
}

const pct = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;

function valor(linha: unknown): Valor | null {
  if (!Array.isArray(linha) || linha.length !== 5) return null;
  const [a, b, outros, liderOutro, secoes] = linha;
  if (!pct(a) || !pct(b) || !pct(outros) || !pct(secoes) || !Number.isInteger(liderOutro)) return null;
  return { a, b, outros, liderOutro: liderOutro === 0 ? null : liderOutro, secoes };
}

function candidato(c: unknown): CandidatoCamada | null {
  if (typeof c !== 'object' || c === null) return null;
  const { n, nome, partido, cor } = c as Record<string, unknown>;
  if (!Number.isInteger(n) || typeof nome !== 'string' || typeof partido !== 'string') return null;
  return { n: n as number, nome, partido, cor: cor === '13' || cor === '22' ? cor : null };
}

/** Lê uma camada sem lançar: o front tolera campos ausentes e descarta linhas inválidas em vez de quebrar o mapa. */
export function lerCamada(bruto: unknown): Camada | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const o = bruto as Record<string, unknown>;
  const cands = Array.isArray(o.candidatos) ? o.candidatos.map(candidato) : [];
  if (cands.length !== 2 || !cands[0] || !cands[1]) return null;

  const ufs = new Map<UF, Valor>();
  const ufsBrutas = typeof o.ufs === 'object' && o.ufs !== null ? (o.ufs as Record<string, unknown>) : {};
  for (const uf of UFS) {
    const v = valor(ufsBrutas[uf]);
    if (v) ufs.set(uf, v);
  }

  const municipios = new Map<number, Valor>();
  for (const linha of Array.isArray(o.municipios) ? o.municipios : []) {
    if (!Array.isArray(linha) || !Number.isInteger(linha[0])) continue;
    const v = valor(linha.slice(1));
    if (v) municipios.set(linha[0] as number, v);
  }

  return {
    id: typeof o.id === 'string' ? o.id : '',
    rotulo: typeof o.rotulo === 'string' ? o.rotulo : '',
    atualizado: typeof o.atualizado === 'string' ? o.atualizado : '',
    candidatos: [cands[0], cands[1]],
    br: valor(o.br),
    ufs,
    municipios,
  };
}
