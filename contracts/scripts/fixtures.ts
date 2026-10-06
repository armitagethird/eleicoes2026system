// Gera as fixtures de desenvolvimento em contracts/fixtures/ e copia para site/public/data/.
// Determinístico (pseudo-aleatório semeado pelo slug/UF, sem relógio). Roda com Node puro: npm run fixtures (em /site).
//   npm run fixtures -- --modo=live   -> public/data/status.json = status.live.json (padrão: pre)
//
// REAL: slug, nomes, UF, códigos IBGE, lat/lon (municipios.json) e hist/ (hoje stub fictício; vira real na Fase 0.5).
// FICTÍCIO: todos os números do 2º turno de 2026 (votos, percentuais, seções, selos, ranks) e as variações vs 2022 dos placares.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = join(RAIZ, 'contracts/fixtures');
const PUBLIC_DATA = join(RAIZ, 'site/public/data');

interface Municipio { slug: string; nome: string; uf: string; cod_tse: number; cod_ibge: number; eleitores: number }
interface Hist {
  t2_2022: { pct: { '13': number; '22': number }; comparecimento_pct: number } | null;
  t1_2026: { pct: { '13': number; '22': number; outros: number }; comparecimento_pct: number };
}
interface Quem { n: number; nome: string; partido: string }
interface Cenario { secoes?: number; p13?: number | 'espelho' }

const ATUALIZADO = '2026-10-25T18:42:10-03:00';
const PRESIDENTE: [Quem, Quem] = [
  { n: 13, nome: 'Lula', partido: 'PT' },
  { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL' },
];
// Candidatos a governador são FICTÍCIOS (nome e número); só o formato importa.
const GOVERNADOR: [Quem, Quem] = [
  { n: 12, nome: 'Fictício A', partido: 'FIC' },
  { n: 45, nome: 'Fictícia B', partido: 'FIC' },
];
const UFS_COM_GOVERNADOR = ['AC', 'AM', 'DF', 'ES', 'RJ', 'RN', 'TO'];

// Eleitorado por UF: aproximação grosseira, fictícia, só para dar escala aos placares.
const ELEITORES_UF: Record<string, number> = {
  AC: 600_000, AL: 2_300_000, AM: 2_600_000, AP: 520_000, BA: 11_100_000, CE: 6_600_000, DF: 2_200_000, ES: 2_800_000,
  GO: 4_900_000, MA: 5_100_000, MG: 16_300_000, MS: 2_000_000, MT: 2_600_000, PA: 6_100_000, PB: 3_100_000, PE: 6_900_000,
  PI: 2_400_000, PR: 8_500_000, RJ: 12_700_000, RN: 2_500_000, RO: 1_200_000, RR: 400_000, RS: 8_500_000, SC: 5_500_000,
  SE: 1_700_000, SP: 34_600_000, TO: 1_100_000,
};

const CAPITAIS = [
  'rio-branco-ac', 'maceio-al', 'macapa-ap', 'manaus-am', 'salvador-ba', 'fortaleza-ce', 'brasilia-df', 'vitoria-es',
  'goiania-go', 'sao-luis-ma', 'cuiaba-mt', 'campo-grande-ms', 'belo-horizonte-mg', 'belem-pa', 'joao-pessoa-pb',
  'curitiba-pr', 'recife-pe', 'teresina-pi', 'rio-de-janeiro-rj', 'natal-rn', 'porto-alegre-rs', 'porto-velho-ro',
  'boa-vista-rr', 'florianopolis-sc', 'sao-paulo-sp', 'aracaju-se', 'palmas-to',
];

// Casos de borda forçados (o resto é sorteado pelo slug).
const CENARIOS: Record<string, Cenario> = {
  'sao-luis-ma': { secoes: 87.3 }, // exemplo do brief
  'santa-barbara-doeste-sp': { secoes: 96.4, p13: 50.1 }, // margem de 0,2 ponto
  'sao-joao-da-boa-vista-sp': { secoes: 91.8, p13: 49.95 }, // margem de 0,1 ponto
  'serra-da-saudade-mg': { secoes: 100, p13: 0 }, // 100% para o 22
  'bora-sp': { secoes: 0.4 }, // aguardando primeiras seções
  'boa-esperanca-do-norte-mt': { secoes: 100 }, // sem 2022
  'vila-bela-da-santissima-trindade-mt': { secoes: 78.2, p13: 'espelho' }, // virou
  'petrolina-pe': { secoes: 83.5, p13: 'espelho' }, // virou
  'juazeiro-do-norte-ce': { secoes: 99.1, p13: 'espelho' }, // virou
  'campinas-sp': { secoes: 72.6, p13: 'espelho' }, // virou
  'ji-parana-ro': { secoes: 64, p13: 'espelho' }, // virou
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const grava = (caminho: string, dados: unknown) => {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, `${JSON.stringify(dados, null, 2)}\n`);
};
const le = <T>(caminho: string): T => JSON.parse(readFileSync(caminho, 'utf8')) as T;

function semente(texto: string): () => number {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dois candidatos, ordem por número de urna; pct calculado dos votos, como o worker fará. */
function candidatos([a, b]: [Quem, Quem], votosA: number, votosB: number) {
  const validos = votosA + votosB;
  const pct = (v: number) => (validos ? r2((v / validos) * 100) : 0);
  return [
    { ...a, votos: votosA, pct: pct(votosA), eleito: false },
    { ...b, votos: votosB, pct: pct(votosB), eleito: false },
  ];
}

const dividir = (validos: number, p13: number): [number, number] => {
  const v13 = Math.round((validos * p13) / 100);
  return [v13, validos - v13];
};

// ---------- cidades ----------
const municipios = le<Municipio[]>(join(RAIZ, 'site/src/data/municipios.json'));

interface CidadeCalc { m: Municipio; hist: Hist; secoes: number; p13: number; p22: number; margem: number; lider: 13 | 22 | null; virou: boolean; swing: number }

const calcs: CidadeCalc[] = municipios.map((m) => {
  const hist = le<Hist>(join(RAIZ, `site/src/data/hist/${m.slug}.json`));
  const rnd = semente(m.slug);
  const cenario = CENARIOS[m.slug] ?? {};
  const secoes = cenario.secoes ?? r1(35 + rnd() * 64.5);
  const t1 = hist.t1_2026.pct;
  const p13Sorteado = t1['13'] + t1.outros * (0.25 + rnd() * 0.5);
  const p13Base = cenario.p13 === 'espelho' ? 100 - (hist.t2_2022?.pct['13'] ?? 50) + 0.3 : (cenario.p13 ?? p13Sorteado);
  const p13 = secoes < 1 ? 0 : r2(Math.min(100, Math.max(0, p13Base)));
  const p22 = secoes < 1 ? 0 : r2(100 - p13);
  const margem = secoes < 1 ? Infinity : Math.abs(p13 - p22);
  const lider = secoes < 1 || p13 === p22 ? null : p13 > p22 ? 13 : 22;
  const m2022 = hist.t2_2022 ? hist.t2_2022.pct['13'] - hist.t2_2022.pct['22'] : null;
  const virou = lider !== null && m2022 !== null && m2022 !== 0 && (m2022 > 0 ? 13 : 22) !== lider;
  const swing = virou && m2022 !== null ? Math.abs(p13 - p22 - m2022) : 0;
  return { m, hist, secoes, p13, p22, margem, lider, virou, swing };
});

const comVoto = calcs.filter((c) => c.secoes >= 1);
const posicao = (lista: CidadeCalc[], ordem: (c: CidadeCalc) => number): Map<string, number> =>
  new Map([...lista].sort((a, b) => ordem(a) - ordem(b) || a.m.slug.localeCompare(b.m.slug)).map((c, i) => [c.m.slug, i + 1]));

const dividida = posicao(comVoto, (c) => c.margem);
const unanime = posicao(comVoto, (c) => -Math.max(c.p13, c.p22));
const viradas = calcs.filter((c) => c.virou);
const virada = posicao(viradas, (c) => -c.swing);
const noGrupo = (lista: CidadeCalc[], uf: string) => lista.filter((c) => c.m.uf === uf);
const posicaoNaUf = (lista: CidadeCalc[], global: Map<string, number>, uf: string, slug: string): number | null => {
  const ordenada = noGrupo(lista, uf).sort((a, b) => global.get(a.m.slug)! - global.get(b.m.slug)!);
  const i = ordenada.findIndex((c) => c.m.slug === slug);
  return i < 0 ? null : i + 1;
};

function cidade({ m, hist, secoes, p13, virou }: CidadeCalc) {
  const validos = Math.round(m.eleitores * (hist.t1_2026.comparecimento_pct / 100) * (secoes / 100) * 0.95);
  const [v13, v22] = dividir(validos, p13);
  const presidente = candidatos(PRESIDENTE, v13, v22);
  const variacao = hist.t2_2022 && secoes >= 1
    ? { '13': r2(presidente[0].pct - hist.t2_2022.pct['13']), '22': r2(presidente[1].pct - hist.t2_2022.pct['22']) }
    : {};
  const diferenca = Math.abs(v13 - v22);

  let governador = null;
  if (UFS_COM_GOVERNADOR.includes(m.uf)) {
    const [g12, g45] = dividir(validos, r2(35 + semente(`${m.slug}-gov`)() * 30));
    governador = { cand: candidatos(GOVERNADOR, g12, g45), variacao_2022: {}, diferenca_votos: Math.abs(g12 - g45) };
  }

  const dividida_br = dividida.get(m.slug) ?? null;
  const dividida_uf = posicaoNaUf(comVoto, dividida, m.uf, m.slug);
  const viradaBr = virada.get(m.slug) ?? null;
  const viradaUf = posicaoNaUf(viradas, virada, m.uf, m.slug);

  const selos: string[] = [];
  if (dividida_br && dividida_br <= 3) selos.push('mais_dividida_br');
  if (dividida_uf === 1 && noGrupo(comVoto, m.uf).length > 1) selos.push('mais_dividida_uf');
  if ((unanime.get(m.slug) ?? 99) <= 3) selos.push('mais_unanime_br');
  if (viradaBr === 1) selos.push('maior_virada_br');
  if (viradaUf === 1 && noGrupo(viradas, m.uf).length > 1) selos.push('maior_virada_uf');

  return {
    v: 1, slug: m.slug, nome: m.nome, uf: m.uf, cod_tse: m.cod_tse, cod_ibge: m.cod_ibge, eleitores: m.eleitores,
    atualizado: ATUALIZADO, secoes_pct: secoes,
    presidente: { cand: presidente, variacao_2022: variacao, diferenca_votos: diferenca },
    governador, selos,
    rank: { dividida_br, dividida_uf, virada_uf: viradaUf },
    virou,
  };
}

// ---------- UFs e Brasil ----------
interface UfCalc { votos: [number, number]; votos2022: [number, number]; brancos: number; nulos: number; comparecidos: number; apto: number; secoes: number; gov: [number, number] | null }

const ufs: Record<string, UfCalc> = {};
for (const [uf, eleitores] of Object.entries(ELEITORES_UF)) {
  const rnd = semente(`uf-${uf}`);
  const secoes = r1(60 + rnd() * 38);
  const comp = 74 + rnd() * 10;
  const apto = Math.round(eleitores * (secoes / 100));
  const comparecidos = Math.round(apto * (comp / 100));
  const brancos = Math.round(comparecidos * 0.03);
  const nulos = Math.round(comparecidos * 0.04);
  const validos = comparecidos - brancos - nulos;
  const p13 = 38 + rnd() * 24;
  const votos = dividir(validos, p13);
  const votos2022 = dividir(Math.round(eleitores * 0.78 * 0.93), 30 + rnd() * 40);
  const gov = UFS_COM_GOVERNADOR.includes(uf) ? dividir(validos, 35 + rnd() * 30) : null;
  ufs[uf] = { votos, votos2022, brancos, nulos, comparecidos, apto, secoes, gov };
}

function placar(u: UfCalc, secoes: number) {
  const pres = candidatos(PRESIDENTE, u.votos[0], u.votos[1]);
  const p2022 = candidatos(PRESIDENTE, u.votos2022[0], u.votos2022[1]);
  const comparecimento = r1((u.comparecidos / u.apto) * 100);
  return {
    v: 1, turno: 2, atualizado: ATUALIZADO,
    secoes_pct: secoes, comparecimento_pct: comparecimento, abstencao_pct: r1(100 - comparecimento),
    presidente: {
      cand: pres,
      variacao_2022: { '13': r2(pres[0].pct - p2022[0].pct), '22': r2(pres[1].pct - p2022[1].pct) },
      brancos: u.brancos, nulos: u.nulos,
    },
    governador: u.gov
      ? { cand: candidatos(GOVERNADOR, u.gov[0], u.gov[1]), variacao_2022: {}, brancos: Math.round(u.brancos * 0.9), nulos: Math.round(u.nulos * 0.9) }
      : null,
  };
}

const soma = (campo: (u: UfCalc) => number) => Object.values(ufs).reduce((acc, u) => acc + campo(u), 0);
const brasil: UfCalc = {
  votos: [soma((u) => u.votos[0]), soma((u) => u.votos[1])],
  votos2022: [soma((u) => u.votos2022[0]), soma((u) => u.votos2022[1])],
  brancos: soma((u) => u.brancos), nulos: soma((u) => u.nulos),
  comparecidos: soma((u) => u.comparecidos), apto: soma((u) => u.apto), secoes: 0, gov: null,
};
const eleitoresBrasil = Object.values(ELEITORES_UF).reduce((a, b) => a + b, 0);
const secoesBrasil = r1((brasil.apto / eleitoresBrasil) * 100);

// ---------- escrita ----------
rmSync(FIXTURES, { recursive: true, force: true });

grava(join(FIXTURES, 'status.json'), { v: 1, modo: 'pre', inicio: '2026-10-25T17:00:00-03:00', atualizado: '2026-10-12T10:00:00-03:00' });
grava(join(FIXTURES, 'status.live.json'), { v: 1, modo: 'live', inicio: '2026-10-25T17:00:00-03:00', atualizado: ATUALIZADO });
grava(join(FIXTURES, 'status.final.json'), { v: 1, modo: 'final', inicio: '2026-10-25T17:00:00-03:00', atualizado: '2026-10-25T21:03:00-03:00' });

grava(join(FIXTURES, 'br.json'), { ...placar(brasil, secoesBrasil), governador: null });
for (const [uf, u] of Object.entries(ufs)) grava(join(FIXTURES, `uf/${uf.toLowerCase()}.json`), placar(u, u.secoes));
for (const c of calcs) grava(join(FIXTURES, `c/${c.m.slug}.json`), cidade(c));

const lista = (itens: CidadeCalc[], n = 10) => itens.slice(0, n).map((c) => c.m.slug);
grava(join(FIXTURES, 'rankings.json'), {
  dividida: lista([...comVoto].sort((a, b) => dividida.get(a.m.slug)! - dividida.get(b.m.slug)!)),
  unanime: lista([...comVoto].sort((a, b) => unanime.get(a.m.slug)! - unanime.get(b.m.slug)!)),
  virada: lista([...viradas].sort((a, b) => virada.get(a.m.slug)! - virada.get(b.m.slug)!)),
  capitais: CAPITAIS.map((slug) => municipios.find((m) => m.slug === slug)!).sort((a, b) => b.eleitores - a.eleitores).map((m) => m.slug),
});

rmSync(PUBLIC_DATA, { recursive: true, force: true });
cpSync(FIXTURES, PUBLIC_DATA, { recursive: true });
const modo = process.argv.find((a) => a.startsWith('--modo='))?.slice(7) ?? 'pre';
if (modo !== 'pre') cpSync(join(FIXTURES, `status.${modo}.json`), join(PUBLIC_DATA, 'status.json'));

console.log(`fixtures: ${calcs.length} cidades, ${Object.keys(ufs).length} UFs, status.json = ${modo} -> site/public/data`);
