// Gera as fixtures de desenvolvimento em contracts/fixtures/ e copia para site/public/data/.
// Determinístico (pseudo-aleatório semeado pelo slug/UF, sem relógio). Roda com Node puro: npm run fixtures (em /site).
//   npm run fixtures -- --modo=live   -> public/data/status.json = status.live.json (padrão: pre)
//
// REAL (ETL, Fase 0.5): municípios (nome, UF, códigos, lat/lon, eleitorado de 2026), hist/, hist-uf/ e hist-br.json
// (2º turno de 2022 e 1º de 2026, do TSE). As variações vs 2022 são calculadas contra esses dados reais.
// FICTÍCIO: todos os números do 2º turno de 2026 (votos, percentuais, seções, selos, ranks).
// Os números nascem por município (todos os 5.571) e sobem por soma: UF = soma dos seus municípios, Brasil = soma das UFs.
// Por isso o mapa ao vivo (apuracao.json), os placares (br, uf/*) e as cidades (c/*) contam a mesma história.
// c/*.json existe só para a amostra de 50 cidades (não se versionam 5.571 arquivos); ranks, selos e rankings.json
// são calculados entre elas.
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
const SIGLAS_UF = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// As 50 cidades com c/{slug}.json: 27 capitais, nomes longos, apóstrofo, hífen, o menor eleitorado do país (Borá) e a cidade criada depois de 2022.
const AMOSTRA = new Set([
  'anapolis-go', 'aracaju-se', 'belem-pa', 'belo-horizonte-mg', 'boa-esperanca-do-norte-mt', 'boa-vista-rr', 'bora-sp',
  'brasilia-df', 'campina-grande-pb', 'campinas-sp', 'campo-grande-ms', 'caxias-do-sul-rs', 'cuiaba-mt', 'curitiba-pr',
  'feira-de-santana-ba', 'florianopolis-sc', 'fortaleza-ce', 'goiania-go', 'imperatriz-ma', 'ji-parana-ro',
  'joao-pessoa-pb', 'joinville-sc', 'juazeiro-do-norte-ce', 'londrina-pr', 'macapa-ap', 'maceio-al', 'manaus-am',
  'mossoro-rn', 'natal-rn', 'niteroi-rj', 'palmas-to', 'parnaiba-pi', 'petrolina-pe', 'porto-alegre-rs', 'porto-velho-ro',
  'recife-pe', 'rio-branco-ac', 'rio-de-janeiro-rj', 'rondonopolis-mt', 'salvador-ba', 'santa-barbara-doeste-sp',
  'santarem-pa', 'sao-joao-da-boa-vista-sp', 'sao-luis-ma', 'sao-paulo-sp', 'serra-da-saudade-mg', 'teresina-pi',
  'uberlandia-mg', 'vila-bela-da-santissima-trindade-mt', 'vitoria-es',
]);

const CAPITAIS = [
  'rio-branco-ac', 'maceio-al', 'macapa-ap', 'manaus-am', 'salvador-ba', 'fortaleza-ce', 'brasilia-df', 'vitoria-es',
  'goiania-go', 'sao-luis-ma', 'cuiaba-mt', 'campo-grande-ms', 'belo-horizonte-mg', 'belem-pa', 'joao-pessoa-pb',
  'curitiba-pr', 'recife-pe', 'teresina-pi', 'rio-de-janeiro-rj', 'natal-rn', 'porto-alegre-rs', 'porto-velho-ro',
  'boa-vista-rr', 'florianopolis-sc', 'sao-paulo-sp', 'aracaju-se', 'palmas-to',
];

// Casos de borda forçados (o resto é sorteado pelo slug). Só valem para quem está na amostra.
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

// ---------- municípios ----------
const municipios = le<Municipio[]>(join(RAIZ, 'site/src/data/municipios.json'));
const faltando = [...AMOSTRA].filter((slug) => !municipios.some((m) => m.slug === slug));
if (faltando.length > 0) throw new Error(`amostra com slug fora de municipios.json: ${faltando.join(', ')}`);

interface CidadeCalc {
  m: Municipio;
  hist: Hist;
  secoes: number;
  p13: number;
  p22: number;
  margem: number;
  lider: 13 | 22 | null;
  virou: boolean;
  swing: number;
  /** Eleitorado apto das seções já apuradas, comparecidos, brancos e nulos. */
  apto: number;
  comparecidos: number;
  brancos: number;
  nulos: number;
  votos13: number;
  votos22: number;
  gov: [number, number] | null;
}

const calcs: CidadeCalc[] = municipios.map((m) => {
  const hist = le<Hist>(join(RAIZ, `site/src/data/hist/${m.slug}.json`));
  const rnd = semente(m.slug);
  const cenario = AMOSTRA.has(m.slug) ? (CENARIOS[m.slug] ?? {}) : {};
  const secoes = cenario.secoes ?? r1(35 + rnd() * 64.5);
  const t1 = hist.t1_2026.pct;
  const p13Sorteado = t1['13'] + t1.outros * (0.25 + rnd() * 0.5);
  const p13Base = cenario.p13 === 'espelho' ? 100 - (hist.t2_2022?.pct['13'] ?? 50) + 0.3 : (cenario.p13 ?? p13Sorteado);
  const aguardando = secoes < 1;
  const p13 = aguardando ? 0 : r2(Math.min(100, Math.max(0, p13Base)));
  const p22 = aguardando ? 0 : r2(100 - p13);
  const margem = aguardando ? Infinity : Math.abs(p13 - p22);
  const lider = aguardando || p13 === p22 ? null : p13 > p22 ? 13 : 22;
  const m2022 = hist.t2_2022 ? hist.t2_2022.pct['13'] - hist.t2_2022.pct['22'] : null;
  const virou = lider !== null && m2022 !== null && m2022 !== 0 && (m2022 > 0 ? 13 : 22) !== lider;
  const swing = virou && m2022 !== null ? Math.abs(p13 - p22 - m2022) : 0;

  const apto = Math.round(m.eleitores * (secoes / 100));
  const comparecidos = Math.round(apto * (hist.t1_2026.comparecimento_pct / 100));
  const brancos = Math.round(comparecidos * 0.03);
  const nulos = Math.round(comparecidos * 0.04);
  // Antes de 1% das seções ainda não há voto apurado: o placar fica zerado ("aguardando primeiras seções").
  const validos = aguardando ? 0 : comparecidos - brancos - nulos;
  const [votos13, votos22] = dividir(validos, p13);
  const gov = UFS_COM_GOVERNADOR.includes(m.uf) ? dividir(validos, r2(35 + semente(`${m.slug}-gov`)() * 30)) : null;
  return { m, hist, secoes, p13, p22, margem, lider, virou, swing, apto, comparecidos, brancos, nulos, votos13, votos22, gov };
});

// Ranks, selos e rankings.json: só entre as cidades da amostra, que são as que têm c/{slug}.json.
const amostra = calcs.filter((c) => AMOSTRA.has(c.m.slug));
const comVoto = amostra.filter((c) => c.secoes >= 1);
const posicao = (lista: CidadeCalc[], ordem: (c: CidadeCalc) => number): Map<string, number> =>
  new Map([...lista].sort((a, b) => ordem(a) - ordem(b) || a.m.slug.localeCompare(b.m.slug)).map((c, i) => [c.m.slug, i + 1]));

const dividida = posicao(comVoto, (c) => c.margem);
const unanime = posicao(comVoto, (c) => -Math.max(c.p13, c.p22));
const viradas = amostra.filter((c) => c.virou);
const virada = posicao(viradas, (c) => -c.swing);
const noGrupo = (lista: CidadeCalc[], uf: string) => lista.filter((c) => c.m.uf === uf);
const posicaoNaUf = (lista: CidadeCalc[], global: Map<string, number>, uf: string, slug: string): number | null => {
  const ordenada = noGrupo(lista, uf).sort((a, b) => global.get(a.m.slug)! - global.get(b.m.slug)!);
  const i = ordenada.findIndex((c) => c.m.slug === slug);
  return i < 0 ? null : i + 1;
};

function cidade({ m, hist, secoes, votos13, votos22, gov, virou }: CidadeCalc) {
  const presidente = candidatos(PRESIDENTE, votos13, votos22);
  const variacao = hist.t2_2022 && secoes >= 1
    ? { '13': r2(presidente[0].pct - hist.t2_2022.pct['13']), '22': r2(presidente[1].pct - hist.t2_2022.pct['22']) }
    : {};
  const diferenca = Math.abs(votos13 - votos22);
  const governador = gov ? { cand: candidatos(GOVERNADOR, gov[0], gov[1]), variacao_2022: {}, diferenca_votos: Math.abs(gov[0] - gov[1]) } : null;

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

// ---------- UFs e Brasil: soma dos municípios ----------
interface Soma {
  votos: [number, number];
  pct2022: Hist['t2_2022'];
  brancos: number;
  nulos: number;
  comparecidos: number;
  apto: number;
  eleitores: number;
  gov: [number, number] | null;
}

const histUf = (uf: string) => le<Hist>(join(RAIZ, `site/src/data/hist-uf/${uf.toLowerCase()}.json`));

const somar = (cidades: CidadeCalc[], pct2022: Hist['t2_2022']): Soma => {
  const total = (campo: (c: CidadeCalc) => number) => cidades.reduce((acc, c) => acc + campo(c), 0);
  return {
    votos: [total((c) => c.votos13), total((c) => c.votos22)],
    pct2022,
    brancos: total((c) => c.brancos),
    nulos: total((c) => c.nulos),
    comparecidos: total((c) => c.comparecidos),
    apto: total((c) => c.apto),
    eleitores: total((c) => c.m.eleitores),
    gov: cidades[0]?.gov ? [total((c) => c.gov?.[0] ?? 0), total((c) => c.gov?.[1] ?? 0)] : null,
  };
};

const ufs = Object.fromEntries(SIGLAS_UF.map((uf) => [uf, somar(calcs.filter((c) => c.m.uf === uf), histUf(uf).t2_2022)]));
const brasil = somar(calcs, le<Hist>(join(RAIZ, 'site/src/data/hist-br.json')).t2_2022);

const secoesDe = (s: Soma) => r1((s.apto / s.eleitores) * 100);

function placar(u: Soma) {
  const pres = candidatos(PRESIDENTE, u.votos[0], u.votos[1]);
  const comparecimento = r1((u.comparecidos / u.apto) * 100);
  return {
    v: 1, turno: 2, atualizado: ATUALIZADO,
    secoes_pct: secoesDe(u), comparecimento_pct: comparecimento, abstencao_pct: r1(100 - comparecimento),
    presidente: {
      cand: pres,
      variacao_2022: u.pct2022 ? { '13': r2(pres[0].pct - u.pct2022.pct['13']), '22': r2(pres[1].pct - u.pct2022.pct['22']) } : {},
      brancos: u.brancos, nulos: u.nulos,
    },
    governador: u.gov
      ? { cand: candidatos(GOVERNADOR, u.gov[0], u.gov[1]), variacao_2022: {}, brancos: Math.round(u.brancos * 0.9), nulos: Math.round(u.nulos * 0.9) }
      : null,
  };
}

// ---------- escrita ----------
// Só as pastas que este script gera: pesquisas.exemplo.json é escrito à mão e mora em fixtures/ também.
for (const gerada of ['c', 'uf']) rmSync(join(FIXTURES, gerada), { recursive: true, force: true });

grava(join(FIXTURES, 'status.json'), { v: 1, modo: 'pre', inicio: '2026-10-25T17:00:00-03:00', atualizado: '2026-10-12T10:00:00-03:00' });
grava(join(FIXTURES, 'status.live.json'), { v: 1, modo: 'live', inicio: '2026-10-25T17:00:00-03:00', atualizado: ATUALIZADO });
grava(join(FIXTURES, 'status.final.json'), { v: 1, modo: 'final', inicio: '2026-10-25T17:00:00-03:00', atualizado: '2026-10-25T21:03:00-03:00' });

const placarBr = { ...placar(brasil), governador: null };
const placaresUf = Object.entries(ufs).map(([uf, u]) => [uf, placar(u)] as const);
grava(join(FIXTURES, 'br.json'), placarBr);
for (const [uf, p] of placaresUf) grava(join(FIXTURES, `uf/${uf.toLowerCase()}.json`), p);

// PROPOSTA (aguarda aprovação): /data/mapa.json, os 28 placares só com o que o mapa usa, numa requisição.
const doMapa = ({ secoes_pct, presidente }: ReturnType<typeof placar>) => ({
  secoes_pct,
  presidente: { cand: presidente.cand.map(({ n, pct }) => ({ n, pct })), variacao_2022: presidente.variacao_2022 },
});
grava(join(FIXTURES, 'mapa.json'), {
  v: 1,
  atualizado: ATUALIZADO,
  placas: Object.fromEntries([['BR', doMapa(placarBr)], ...placaresUf.map(([uf, p]) => [uf, doMapa(p)])]),
});

// /data/apuracao.json: a camada "ao-vivo" do mapa da /apuracao (contracts/schemas/camada-mapa.schema.json), 2º turno FICTÍCIO.
// Linha = [pct 13, pct 22, outros, quem lidera fora os dois (sempre 0 no 2º turno), % das seções]. Sem voto apurado, pct 0 e 0.
const linhaDe = (pct13: number, pct22: number, secoes: number) => [pct13, pct22, 0, 0, secoes];
const linhaDoPlacar = (p: ReturnType<typeof placar>) => linhaDe(p.presidente.cand[0].pct, p.presidente.cand[1].pct, p.secoes_pct);
const camadaAoVivo = {
  v: 1,
  id: 'ao-vivo',
  rotulo: '2º turno 2026',
  atualizado: ATUALIZADO,
  candidatos: [
    { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
    { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', cor: '22' },
  ],
  br: linhaDoPlacar(placarBr),
  ufs: Object.fromEntries(placaresUf.map(([uf, p]) => [uf, linhaDoPlacar(p)])),
  // O percentual sai dos votos inteiros, como em c/{slug}.json e como o worker fará: em município pequeno difere do p13 sorteado.
  municipios: [...calcs]
    .sort((a, b) => a.m.cod_ibge - b.m.cod_ibge)
    .map((c) => {
      const [a, b] = candidatos(PRESIDENTE, c.votos13, c.votos22);
      return [c.m.cod_ibge, ...linhaDe(a!.pct, b!.pct, c.secoes)];
    }),
};
// Um município por linha: o diff do git fica legível.
const { municipios: linhasAoVivo, ...cabecalhoAoVivo } = camadaAoVivo;
mkdirSync(FIXTURES, { recursive: true });
writeFileSync(
  join(FIXTURES, 'apuracao.json'),
  `${JSON.stringify(cabecalhoAoVivo).slice(0, -1)},"municipios":[\n${linhasAoVivo.map((l) => JSON.stringify(l)).join(',\n')}\n]}\n`,
);

for (const c of amostra) grava(join(FIXTURES, `c/${c.m.slug}.json`), cidade(c));

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

console.log(`fixtures: ${calcs.length} municípios na camada ao-vivo, ${amostra.length} cidades em c/, ${SIGLAS_UF.length} UFs, status.json = ${modo} -> site/public/data`);
