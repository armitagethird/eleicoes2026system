// Simulador de dev da apuração (brief, Fase 3): reescreve site/public/data/ progressivamente, de 5% a 100% das seções em
// 2 minutos, para ver a home, a UF e a cidade se moverem com o dev server de pé. Roda com Node puro: npm run simular (em /site).
//   npm run simular -- --duracao=60 --intervalo=3   duração total e passo, em segundos (padrão 120 e 4)
//   npm run simular -- --manter-final               deixa o status final ativo até o Ctrl+C (sem isto, volta ao pre sozinho 30 s depois)
//   npm run simular -- --destino=<pasta>           escreve noutra pasta em vez de site/public/data (testes; não mexe no que o dev serve)
//   npm run simular -- --restaurar                  volta public/data ao modo pre (se o processo morreu sem Ctrl+C)
//
// FONTE: contracts/fixtures/ (só leitura aqui). SAÍDA: site/public/data/ (fora do git).
// PRE DE VOLTA: ao chegar em final o simulador avisa "status FINAL fictício ativo" e, sem --manter-final, restaura o modo pre
// sozinho 30 s depois e sai. Ctrl+C (ou SIGTERM) em qualquer ponto também restaura. Se o processo for morto à força (o Windows
// não entrega o sinal), rode --restaurar ou npm run fixtures: enquanto o status for live ou final, o site inteiro mostra o 2º
// turno fictício (inclusive o gráfico do /historico).
// TODOS OS NÚMEROS SÃO FICTÍCIOS, só para desenvolvimento: nada disto é resultado. O "eleito: true" do fim também é teatro:
// o líder do Brasil e os governadores, só em 100%, para exercitar o card final.
//
// Como os números andam: cada UF (presidente e governador) e cada cidade da amostra é uma "unidade" com os votos finais das
// fixtures, uma curva própria de seções (gamma e atraso semeados pelo nome) e um viés que decai até zero. O Brasil é a SOMA
// das UFs. A cidade da amostra, a UF e o Brasil de apuracao.json e de mapa.json são os mesmos números dos placares.
// Determinístico: sem relógio nem Math.random (a hora dos arquivos é simulada: 17h às 21h03).
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');

interface Candidato { n: number; nome: string; partido: string; votos: number; pct: number; eleito: boolean }
interface CargoPlacar { cand: Candidato[]; variacao_2022: Record<string, number>; brancos: number; nulos: number }
interface CargoCidade { cand: Candidato[]; variacao_2022: Record<string, number>; diferenca_votos: number }
interface Status { v: number; modo: 'pre' | 'live' | 'final'; inicio: string; atualizado: string }
interface Placar {
  v: number; turno: number; atualizado: string; secoes_pct: number; comparecimento_pct: number; abstencao_pct: number;
  presidente: CargoPlacar; governador: CargoPlacar | null;
}
interface Cidade {
  v: number; slug: string; nome: string; uf: string; cod_tse: number; cod_ibge: number; eleitores: number; atualizado: string;
  secoes_pct: number; presidente: CargoCidade; governador: CargoCidade | null; selos: string[];
  rank: { dividida_br: number | null; dividida_uf: number | null; virada_uf: number | null }; virou: boolean;
}
type Linha = [number, number, number, number, number, number];
interface Camada {
  v: number; id: string; rotulo: string; atualizado: string; candidatos: unknown[];
  br: number[]; ufs: Record<string, number[]>; municipios: Linha[];
}
interface Mapa {
  v: number; atualizado: string;
  placas: Record<string, { secoes_pct: number; presidente: { cand: Array<{ n: number; pct: number }>; variacao_2022: Record<string, number> } }>;
}

export interface Fixtures {
  status: { pre: Status; live: Status; final: Status };
  br: Placar;
  ufs: Record<string, Placar>;
  cidades: Record<string, Cidade>;
  apuracao?: Camada;
  mapa?: Mapa;
}

export interface Saida {
  status: Status;
  br: Placar;
  ufs: Record<string, Placar>;
  cidades: Record<string, Cidade>;
  apuracao?: Camada;
  mapa?: Mapa;
}

const lerJson = <T>(...partes: string[]): T => JSON.parse(readFileSync(join(...partes), 'utf8')) as T;
const lerOpcional = <T>(...partes: string[]): T | undefined => {
  try {
    return lerJson<T>(...partes);
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw erro;
  }
};
const jsons = (pasta: string): string[] => readdirSync(pasta).filter((f) => f.endsWith('.json'));

export function lerFixtures(raiz: string = RAIZ): Fixtures {
  const f = join(raiz, 'contracts/fixtures');
  const lerPasta = <T>(sub: string): Record<string, T> =>
    Object.fromEntries(jsons(join(f, sub)).map((arquivo) => [arquivo.replace(/\.json$/, ''), lerJson<T>(f, sub, arquivo)]));
  return {
    status: { pre: lerJson(f, 'status.json'), live: lerJson(f, 'status.live.json'), final: lerJson(f, 'status.final.json') },
    br: lerJson(f, 'br.json'),
    ufs: Object.fromEntries(Object.entries(lerPasta<Placar>('uf')).map(([uf, p]) => [uf.toUpperCase(), p])),
    cidades: lerPasta<Cidade>('c'),
    apuracao: lerOpcional(f, 'apuracao.json'),
    mapa: lerOpcional(f, 'mapa.json'),
  };
}

// ---------- números ----------

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;
const limita = (x: number, minimo: number, maximo: number): number => Math.min(maximo, Math.max(minimo, x));

/** Pseudo-aleatório em [0, 1) semeado por texto (FNV-1a + mulberry32): o mesmo texto dá sempre o mesmo número. */
function sorteio(semente: string): number {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Quem tem votos finais (das fixtures) e uma curva própria de apuração. */
interface Unidade {
  v13: number;
  v22: number;
  brancos: number;
  nulos: number;
  /** % do 13 no 2º turno de 2022 (null = sem 2022 para comparar). */
  base2022: number | null;
  gamma: number;
  atraso: number;
  vies: number;
}

interface Curva { gamma: [number, number]; atraso: number }
// UFs começam todas com número (gamma <= 1, sem atraso); cidades podem começar tarde, e algumas ainda aguardam a 5%.
const CURVA_UF: Curva = { gamma: [0.7, 1], atraso: 0 };
const CURVA_CIDADE: Curva = { gamma: [0.75, 1.6], atraso: 0.07 };

function unidade(semente: string, cargo: { cand: Candidato[]; brancos?: number; nulos?: number }, base2022: number | null, curva: Curva, atrasoMinimo = 0): Unidade {
  const [gMin, gMax] = curva.gamma;
  return {
    v13: cargo.cand[0].votos,
    v22: cargo.cand[1].votos,
    brancos: cargo.brancos ?? 0,
    nulos: cargo.nulos ?? 0,
    base2022,
    gamma: gMin + (gMax - gMin) * sorteio(`${semente}:g`),
    atraso: Math.max(atrasoMinimo, curva.atraso * sorteio(`${semente}:a`)),
    vies: 2 * sorteio(`${semente}:v`) - 1,
  };
}

/** Fração das seções apurada em p (0..1). Monótona em p; em p = 1 é exatamente 1. */
function fracao(u: { gamma: number; atraso: number }, p: number): number {
  if (p >= 1) return 1;
  return limita((Math.max(0, p - u.atraso) / (1 - u.atraso)) ** u.gamma, 0, 1);
}

/** secoes_pct como o worker publica (1 casa). Abaixo de 100% nunca arredonda para 100. */
const secoesDe = (fr: number): number => (fr >= 1 ? 100 : Math.min(99.9, r1(fr * 100)));

const AMPLITUDE = 0.14;

interface Contagem { votos13: number; votos22: number; brancos: number; nulos: number; secoes: number }

/** O que a unidade já contou em p. Com menos de 1% das seções não há voto nem percentual (o contrato pede 0 e 0). */
function contar(u: Unidade, p: number): Contagem {
  const fr = fracao(u, p);
  const secoes = secoesDe(fr);
  if (secoes < 1) return { votos13: 0, votos22: 0, brancos: 0, nulos: 0, secoes };
  const total = u.v13 + u.v22;
  const final = total > 0 ? u.v13 / total : 0;
  // O viés decai até zero: no começo a parcial erra para um lado, e converge para o número final.
  const parte = fr >= 1 ? final : limita(final + u.vies * AMPLITUDE * (1 - fr) ** 1.2, 0.01, 0.99);
  const contados = Math.round(total * fr);
  const votos13 = Math.round(contados * parte);
  return { votos13, votos22: contados - votos13, brancos: Math.round(u.brancos * fr), nulos: Math.round(u.nulos * fr), secoes };
}

const percentuais = (votos13: number, votos22: number): [number, number] => {
  const total = votos13 + votos22;
  if (total === 0) return [0, 0];
  const p13 = r2((100 * votos13) / total);
  return [p13, r2(100 - p13)];
};

function candidatos(modelo: Candidato[], c: Contagem, eleito: 'nenhum' | 'lider'): Candidato[] {
  const [p13, p22] = percentuais(c.votos13, c.votos22);
  const votos = [c.votos13, c.votos22];
  const pct = [p13, p22];
  const lider = c.votos13 === c.votos22 ? -1 : c.votos13 > c.votos22 ? 0 : 1;
  return modelo.map((cand, i) => ({ ...cand, votos: votos[i], pct: pct[i], eleito: eleito === 'lider' && i === lider }));
}

function variacao(base2022: number | null, c: Contagem): Record<string, number> {
  if (base2022 === null || c.secoes < 1) return {};
  const [p13] = percentuais(c.votos13, c.votos22);
  const v = r2(p13 - base2022);
  return { '13': v, '22': r2(-v) };
}

// ---------- hora simulada ----------

const INICIO_MS = Date.parse('2026-10-25T17:00:00-03:00');
const DURACAO_MS = 243 * 60_000; // 17h00 às 21h03 (status.final.json)

/** ISO 8601 em -03:00, como as fixtures. */
function horaSimulada(p: number): string {
  const brasilia = new Date(INICIO_MS + p * DURACAO_MS - 3 * 3_600_000);
  return `${brasilia.toISOString().slice(0, 19)}-03:00`;
}

// ---------- o estado em cada ponto ----------

const pctDe2022 = (cargo: { cand: Candidato[]; variacao_2022: Record<string, number> }): number | null => {
  const v = cargo.variacao_2022['13'];
  return v === undefined ? null : r2(cargo.cand[0].pct - v);
};

/** O estado de todos os arquivos quando a apuração está em p (0,05 a 1). Em p = 1 é o resultado final. */
export function estadoNoProgresso(p: number, fx: Fixtures): Saida {
  const final = p >= 1;
  const atualizado = final ? fx.status.final.atualizado : horaSimulada(p);
  const eleitoDoCargo = final ? 'lider' : 'nenhum';

  // UFs: presidente e governador, cada um com a sua unidade.
  const ufs: Record<string, Placar> = {};
  const contagens: Array<{ u: Unidade; c: Contagem; peso: number }> = [];
  for (const [uf, modelo] of Object.entries(fx.ufs)) {
    const up = unidade(`uf:${uf}`, modelo.presidente, pctDe2022(modelo.presidente), CURVA_UF);
    const cp = contar(up, p);
    contagens.push({ u: up, c: cp, peso: up.v13 + up.v22 });
    let governador: CargoPlacar | null = null;
    if (modelo.governador) {
      const ug = unidade(`gov:${uf}`, modelo.governador, null, CURVA_UF);
      const cg = contar(ug, p);
      governador = {
        cand: candidatos(modelo.governador.cand, cg, eleitoDoCargo),
        variacao_2022: {},
        brancos: cg.brancos,
        nulos: cg.nulos,
      };
    }
    ufs[uf] = {
      ...modelo,
      atualizado,
      secoes_pct: cp.secoes,
      presidente: { cand: candidatos(modelo.presidente.cand, cp, 'nenhum'), variacao_2022: variacao(up.base2022, cp), brancos: cp.brancos, nulos: cp.nulos },
      governador,
    };
  }

  // Brasil = soma das UFs.
  const soma = contagens.reduce(
    (t, { c }) => ({ votos13: t.votos13 + c.votos13, votos22: t.votos22 + c.votos22, brancos: t.brancos + c.brancos, nulos: t.nulos + c.nulos, secoes: 0 }),
    { votos13: 0, votos22: 0, brancos: 0, nulos: 0, secoes: 0 },
  );
  const pesoTotal = contagens.reduce((t, { peso }) => t + peso, 0);
  soma.secoes = final ? 100 : Math.min(99.9, r1((100 * contagens.reduce((t, { u, peso }) => t + fracao(u, p) * peso, 0)) / pesoTotal));
  const baseBr = pctDe2022(fx.br.presidente);
  const br: Placar = {
    ...fx.br,
    atualizado,
    secoes_pct: soma.secoes,
    presidente: { cand: candidatos(fx.br.presidente.cand, soma, eleitoDoCargo), variacao_2022: variacao(baseBr, soma), brancos: soma.brancos, nulos: soma.nulos },
  };

  // Cidades da amostra.
  const cidades: Record<string, Cidade> = {};
  for (const [slug, modelo] of Object.entries(fx.cidades)) {
    const base = pctDe2022(modelo.presidente);
    const atrasoDaFixture = modelo.secoes_pct < 1 ? 0.35 : 0;
    const uc = unidade(`c:${slug}`, modelo.presidente, base, CURVA_CIDADE, atrasoDaFixture);
    const cc = contar(uc, p);
    const cand = candidatos(modelo.presidente.cand, cc, 'nenhum');
    const virou = base !== null && cc.secoes >= 1 && cc.votos13 !== cc.votos22 && cc.votos13 > cc.votos22 !== base > 50;
    let governador: CargoCidade | null = null;
    if (modelo.governador) {
      const cg = contar(unidade(`gov:${slug}`, modelo.governador, null, CURVA_CIDADE, atrasoDaFixture), p);
      governador = { cand: candidatos(modelo.governador.cand, cg, 'nenhum'), variacao_2022: {}, diferenca_votos: Math.abs(cg.votos13 - cg.votos22) };
    }
    cidades[slug] = {
      ...modelo,
      atualizado,
      secoes_pct: cc.secoes,
      presidente: { cand, variacao_2022: variacao(base, cc), diferenca_votos: Math.abs(cc.votos13 - cc.votos22) },
      governador,
      // Os selos de ranking só aparecem com a cidade mais da metade apurada; "virou" acompanha a parcial.
      selos: cc.secoes >= 50 ? modelo.selos : [],
      rank: { ...modelo.rank, virada_uf: virou ? (modelo.rank.virada_uf ?? 1) : null },
      virou,
    };
  }

  const status: Status = final ? fx.status.final : { ...fx.status.live, atualizado };
  const saida: Saida = { status, br, ufs, cidades };
  if (fx.apuracao) saida.apuracao = camada(fx.apuracao, p, atualizado, br, ufs, cidades);
  if (fx.mapa) saida.mapa = mapa(fx.mapa, atualizado, br, ufs);
  return saida;
}

const linhaDoPlacar = (placar: Placar): number[] => {
  const [a, b] = placar.presidente.cand;
  return [a.pct, b.pct, 0, 0, placar.secoes_pct];
};

/** apuracao.json: UF, Brasil e as cidades da amostra são exatamente os placares; os outros municípios andam pela curva própria. */
function camada(modelo: Camada, p: number, atualizado: string, br: Placar, ufs: Record<string, Placar>, cidades: Record<string, Cidade>): Camada {
  const daAmostra = new Map(Object.values(cidades).map((c) => [c.cod_ibge, c]));
  const municipios = modelo.municipios.map((linha): Linha => {
    const [codigo, pct13] = linha;
    const cidade = daAmostra.get(codigo);
    if (cidade) {
      const [a, b] = cidade.presidente.cand;
      return [codigo, a.pct, b.pct, 0, 0, cidade.secoes_pct];
    }
    const curva = unidade(`m:${codigo}`, { cand: [{ votos: pct13 * 100 }, { votos: (100 - pct13) * 100 }] as Candidato[] }, null, CURVA_CIDADE);
    const c = contar(curva, p);
    if (c.secoes < 1) return [codigo, 0, 0, 0, 0, c.secoes];
    const [a, b] = percentuais(c.votos13, c.votos22);
    return [codigo, a, b, 0, 0, c.secoes];
  });
  return { ...modelo, atualizado, br: linhaDoPlacar(br), ufs: Object.fromEntries(Object.entries(ufs).map(([uf, placar]) => [uf, linhaDoPlacar(placar)])), municipios };
}

function mapa(modelo: Mapa, atualizado: string, br: Placar, ufs: Record<string, Placar>): Mapa {
  const placa = (placar: Placar) => ({
    secoes_pct: placar.secoes_pct,
    presidente: { cand: placar.presidente.cand.map(({ n, pct }) => ({ n, pct })), variacao_2022: placar.presidente.variacao_2022 },
  });
  return { ...modelo, atualizado, placas: Object.fromEntries(Object.keys(modelo.placas).map((lugar) => [lugar, placa(lugar === 'BR' ? br : ufs[lugar])])) };
}

// ---------- disco ----------

const opcao = (nome: string): string | undefined => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);

const FIXTURES = join(RAIZ, 'contracts/fixtures');
// --destino=<pasta> escreve (e restaura) noutra pasta, para testar sem mexer no site/public/data que o dev server serve.
const DESTINO = resolve(opcao('destino') ?? join(RAIZ, 'site/public/data'));

const grava = (caminho: string, dados: unknown, compacto = false): void => {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, compacto ? JSON.stringify(dados) : `${JSON.stringify(dados, null, 2)}\n`);
};

function gravar(saida: Saida): void {
  grava(join(DESTINO, 'br.json'), saida.br);
  for (const [uf, placar] of Object.entries(saida.ufs)) grava(join(DESTINO, 'uf', `${uf.toLowerCase()}.json`), placar);
  for (const [slug, cidade] of Object.entries(saida.cidades)) grava(join(DESTINO, 'c', `${slug}.json`), cidade);
  if (saida.apuracao) grava(join(DESTINO, 'apuracao.json'), saida.apuracao, true);
  if (saida.mapa) grava(join(DESTINO, 'mapa.json'), saida.mapa);
  // O status vai por último: a página só vira live depois de os JSON dela estarem no lugar.
  grava(join(DESTINO, 'status.json'), saida.status);
}

/** Copia de volta as fixtures (modo pre) para tudo o que o simulador reescreve. */
function restaurar(): void {
  const copia = (relativo: string): void => {
    mkdirSync(dirname(join(DESTINO, relativo)), { recursive: true });
    copyFileSync(join(FIXTURES, relativo), join(DESTINO, relativo));
  };
  for (const pasta of ['uf', 'c']) for (const arquivo of jsons(join(FIXTURES, pasta))) copia(join(pasta, arquivo));
  for (const arquivo of ['br.json', 'apuracao.json', 'mapa.json', 'status.json']) {
    try {
      copia(arquivo);
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') throw erro;
    }
  }
}

/** Quanto tempo o status final fica no ar quando não há --manter-final. */
const FINAL_MS = 30_000;

const virgula = (n: number): string => n.toFixed(1).replace('.', ',');

function principal(): void {
  if (process.argv.includes('--restaurar')) {
    restaurar();
    console.log(`simular: ${DESTINO} restaurado para as fixtures (status.json = pre).`);
    return;
  }
  const duracao = Number(opcao('duracao') ?? 120);
  const intervalo = Number(opcao('intervalo') ?? 4);
  if (!(duracao > 0) || !(intervalo > 0)) throw new Error('Use --duracao=<segundos> e --intervalo=<segundos>, números maiores que zero.');
  const passos = Math.max(1, Math.round(duracao / intervalo));
  const fixtures = lerFixtures();

  console.log('SIMULAÇÃO: todos os números abaixo são FICTÍCIOS, só para desenvolvimento. Nada disto é resultado.');
  console.log(`Escreve em ${DESTINO}: 5% a 100% das seções em ${duracao} s, um passo a cada ${intervalo} s. Ctrl+C restaura o modo pre.`);

  const sair = (): never => {
    restaurar();
    console.log(`\nsimular: ${DESTINO} restaurado (status.json = pre).`);
    process.exit(0);
  };
  for (const sinal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(sinal, sair);

  let passo = 0;
  const avancar = (): void => {
    const p = passo >= passos ? 1 : 0.05 + (0.95 * passo) / passos;
    const saida = estadoNoProgresso(p, fixtures);
    gravar(saida);
    const [a, b] = saida.br.presidente.cand;
    console.log(`[${String(passo + 1).padStart(2, '0')}/${passos + 1}] ${saida.status.modo.padEnd(5)} ${virgula(saida.br.secoes_pct).padStart(5)}% das seções · Brasil: 13 ${virgula(a.pct)}% × 22 ${virgula(b.pct)}% (FICTÍCIO)`);
    if (passo >= passos) {
      clearInterval(relogio);
      console.log('status FINAL fictício ativo; rode npm run fixtures (ou Ctrl+C) para voltar ao pre. O líder do Brasil está "eleito" (FICTÍCIO).');
      if (process.argv.includes('--manter-final')) {
        console.log('--manter-final: o status final fica até o Ctrl+C.');
        setInterval(() => undefined, 60_000);
      } else {
        console.log(`Sem --manter-final: volta ao pre sozinho em ${FINAL_MS / 1000} s.`);
        setTimeout(sair, FINAL_MS);
      }
    }
    passo += 1;
  };
  const relogio = setInterval(avancar, intervalo * 1000);
  avancar();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
