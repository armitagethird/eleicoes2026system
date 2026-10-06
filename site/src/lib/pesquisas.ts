// Pesquisas registradas no TSE (design/DIRECTION.md, Pesquisas registradas). Base legal: Res. TSE 23.600, art. 10.
// Só filtra, ordena e escreve o que o instituto divulgou. Nenhuma média, agregação, tendência ou cálculo nosso sobre pesquisas.
import { PESQUISA_ANTES_1O_TURNO, PESQUISA_COLETA_ATE, ROTULO_RESULTADO_PESQUISA, TIPO_PESQUISA } from './copy.ts';
import { numero, percentual } from './format.ts';

export type TipoPesquisa = keyof typeof TIPO_PESQUISA;
export type ChaveResultado = keyof typeof ROTULO_RESULTADO_PESQUISA;

/** src/data/pesquisas.json (contracts/schemas/pesquisas.schema.json). Datas em AAAA-MM-DD; percentuais como divulgados. */
export interface Pesquisa {
  id: string;
  instituto: string;
  /** null = o registro não informa contratante. */
  contratante: string | null;
  /** Registro no PesqEle, ex.: BR-01234/2026. */
  registro: string;
  coleta: { inicio: string; fim: string };
  entrevistas: number;
  margem_pp: number;
  confianca_pct: number;
  tipo: TipoPesquisa;
  cenario: '2turno';
  resultados: { '13': number; '22': number; brancos_nulos?: number; indecisos?: number };
  divulgada_em: string;
  fonte_url: string;
  /** Só nos exemplos do playground. */
  ficticio?: boolean;
}

const REGISTRO = /^[A-Z]{2}-\d{5}\/\d{4}$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const FONTE = /^https?:\/\//;

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const pctValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const pctPositivo = (v: unknown): v is number => pctValido(v) && v > 0;

function dataValida(v: unknown): v is string {
  if (typeof v !== 'string' || !DATA_ISO.test(v)) return false;
  const [ano, mes, dia] = v.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** Tem todo campo obrigatório, no tipo e no formato certos. Sem isso a pesquisa não vai para a tela (art. 10). */
function completa(x: unknown): x is Pesquisa {
  if (!ehObjeto(x)) return false;
  const { coleta, resultados } = x;
  return (
    texto(x.id) &&
    texto(x.instituto) &&
    (x.contratante === null || texto(x.contratante)) &&
    typeof x.registro === 'string' &&
    REGISTRO.test(x.registro) &&
    ehObjeto(coleta) &&
    dataValida(coleta.inicio) &&
    dataValida(coleta.fim) &&
    coleta.fim >= coleta.inicio &&
    Number.isInteger(x.entrevistas) &&
    (x.entrevistas as number) > 0 &&
    pctPositivo(x.margem_pp) &&
    pctPositivo(x.confianca_pct) &&
    typeof x.tipo === 'string' &&
    Object.hasOwn(TIPO_PESQUISA, x.tipo) &&
    x.cenario === '2turno' &&
    ehObjeto(resultados) &&
    pctValido(resultados['13']) &&
    pctValido(resultados['22']) &&
    (resultados.brancos_nulos === undefined || pctValido(resultados.brancos_nulos)) &&
    (resultados.indecisos === undefined || pctValido(resultados.indecisos)) &&
    dataValida(x.divulgada_em) &&
    typeof x.fonte_url === 'string' &&
    FONTE.test(x.fonte_url) &&
    (x.ficticio === undefined || typeof x.ficticio === 'boolean')
  );
}

const maisRecente = (a: Pesquisa, b: Pesquisa): number =>
  b.coleta.fim.localeCompare(a.coleta.fim) || b.divulgada_em.localeCompare(a.divulgada_em) || a.id.localeCompare(b.id);

function selecionar(lista: readonly unknown[], limite: number, comFicticias: boolean): Pesquisa[] {
  return lista
    .filter((x): x is Pesquisa => completa(x) && (comFicticias || x.ficticio !== true))
    .sort(maisRecente)
    .slice(0, Math.max(0, limite));
}

/**
 * O que a home mostra: ordenado pelo fim da coleta (a mais recente primeiro) e cortado em `limite`. Por segurança descarta
 * item com ficticio:true e item sem algum campo obrigatório: divulgar pesquisa falsa ou incompleta é infração (Res. 23.600).
 */
export const pesquisasParaExibir = (lista: readonly unknown[], limite = 5): Pesquisa[] => selecionar(lista, limite, false);

/** Igual a pesquisasParaExibir, mas mantém ficticio:true. Só para o playground; a linha de cada exemplo leva o carimbo. */
export const pesquisasDeExemplo = (lista: readonly unknown[], limite = 5): Pesquisa[] => selecionar(lista, limite, true);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

// As datas são só dia (AAAA-MM-DD): lidas pelo texto, sem fuso.
const diaEMes = (iso: string): { dia: number; mes: string } => {
  const [, mes, dia] = iso.split('-').map(Number);
  return { dia, mes: MESES[mes - 1] };
};

/** "1 a 4/out", "29/set a 7/out" ou, em um dia só, "6/out". */
export function periodoColeta({ inicio, fim }: Pesquisa['coleta']): string {
  const a = diaEMes(inicio);
  const b = diaEMes(fim);
  if (inicio === fim) return `${b.dia}/${b.mes}`;
  return a.mes === b.mes ? `${a.dia} a ${b.dia}/${b.mes}` : `${a.dia}/${a.mes} a ${b.dia}/${b.mes}`;
}

/** Cabeçalho da pesquisa: "coleta até 4/out". */
// Pesquisa de 2º turno feita antes do 1º turno simulava um confronto que ainda não existia: o leitor precisa saber.
const PRIMEIRO_TURNO = '2026-10-04';

export function fimDaColeta({ coleta }: Pesquisa): string {
  const { dia, mes } = diaEMes(coleta.fim);
  const quando = `${PESQUISA_COLETA_ATE} ${dia}/${mes}`;
  return coleta.fim < PRIMEIRO_TURNO ? `${quando}, ${PESQUISA_ANTES_1O_TURNO}` : quando;
}

// Os números saem como o instituto os escreveu: "46" fica "46" e 48.6 fica "48,6". O percentual() do format.ts fixa 1 casa
// ("46,0%"), o que inventaria uma precisão que o instituto não divulgou.
const casas = (n: number): number => (Number.isInteger(n) ? 0 : Math.round(n * 10) / 10 === n ? 1 : 2);

/** "46", "48,6": o número sem o sinal de %. */
export const numeroPesquisa = (n: number): string => percentual(n, casas(n)).replace('%', '');

/** "46%", "48,6%". */
export const percentualPesquisa = (n: number): string => percentual(n, casas(n));

/** Os elementos da linha legal, na ordem. Sem contratante, a expressão "contratada por" não aparece (art. 10: "se for o caso"). */
export function partesLinhaLegal(p: Pesquisa): string[] {
  return [
    p.instituto,
    ...(p.contratante ? [`contratada por ${p.contratante}`] : []),
    `${numero(p.entrevistas)} ${p.entrevistas === 1 ? 'entrevista' : 'entrevistas'}`,
    periodoColeta(p.coleta),
    `margem ±${numeroPesquisa(p.margem_pp)} p.p.`,
    `confiança ${percentualPesquisa(p.confianca_pct)}`,
    `registro ${p.registro}`,
  ];
}

/** "Quaest · contratada por Genial Investimentos · 2.004 entrevistas · 1 a 4/out · margem ±2 p.p. · confiança 95% · registro BR-01234/2026". */
export const linhaLegal = (p: Pesquisa): string => partesLinhaLegal(p).join(' · ');

export interface SegmentoPesquisa {
  chave: ChaveResultado;
  pct: number;
}

// Explícito: as chaves "13" e "22" são inteiras e o JS as lista antes das outras, o que não é a ordem da barra.
const ORDEM_DA_BARRA: readonly ChaveResultado[] = ['13', 'brancos_nulos', 'indecisos', '22'];

/** As fatias da barra, sempre na ordem 13, brancos e nulos, indecisos, 22, só as que o instituto divulgou. */
export const segmentosPesquisa = ({ resultados }: Pesquisa): SegmentoPesquisa[] =>
  ORDEM_DA_BARRA.flatMap((chave) => {
    const pct = resultados[chave];
    return pct === undefined ? [] : [{ chave, pct }];
  });

/** Nome acessível da barra: "Quaest, votos totais: 13, 46%; brancos e nulos, 7%; indecisos, 4%; 22, 43%". */
export const textoBarra = (p: Pesquisa): string =>
  `${p.instituto}, ${TIPO_PESQUISA[p.tipo]}: ${segmentosPesquisa(p)
    .map(({ chave, pct }) => `${ROTULO_RESULTADO_PESQUISA[chave]}, ${percentualPesquisa(pct)}`)
    .join('; ')}`;
