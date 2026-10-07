// Gera public/geo/ (formato em src/lib/geo-mapa.ts) a partir da malha municipal oficial do IBGE. Roda uma vez:
//   npm run geo
// Fonte: API de malhas do IBGE, v4, qualidade "intermediaria". A v3 para no período 2022 e não tem Boa Esperança do Norte
// (MT, instalado em 2025); a v4 tem os 5.571. Confere a cobertura contra a API de localidades e falha se faltar algum.
// Saída:
//   ufs.json        27 UFs, bem simplificadas: o que se pinta primeiro;
//   municipios.json os 5.571 municípios, simplificados para a vista do Brasil inteiro (carregado depois da primeira pintura);
//   uf/{uf}.json    os municípios de uma UF com o detalhe da malha e os nomes, para quando a UF entra em foco.
// Todos da mesma topologia de arcos, na mesma origem e em grades múltiplas da de 20 m: as camadas encaixam sem fresta.
// Anéis orientados (externo horário, buraco anti-horário na tela) para o canvas juntar vizinhos e pintar com 'nonzero'.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { albers, codificarAneis, codificarArcos, codificarDeltas, UF_POR_CODIGO, type MalhaJson } from '../src/lib/geo-mapa.ts';

const IBGE = 'https://servicodados.ibge.gov.br/api';
const MALHA = `${IBGE}/v4/malhas/paises/BR?formato=application/json&qualidade=intermediaria&intrarregiao=municipio`;
const LOCALIDADES = `${IBGE}/v1/localidades/municipios?view=nivelado`;
const SAIDA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geo');

// Albers do IBGE para o Brasil: meridiano central -54, origem -12, paralelos padrão -2 e -22.
const PROJECAO = [-54, -12, -2, -22] as const;
// A malha intermediária do IBGE vem quantizada em ~20 m: é a grade do detalhe. Os arquivos de vista larga usam uma grade
// mais grossa (múltiplo desta, mesma origem), que encurta os deltas e o arquivo sem diferença visível na escala deles.
const METROS = 20;
const GRADE = { ufs: 10, municipios: 20, detalhe: 1 };
// Limiares de Visvalingam (área efetiva mínima do triângulo, em km²) e de ilha descartada, por arquivo.
const KM2 = 1e6 / METROS ** 2;
const SIMPLIFICACAO = { ufs: 8 * KM2, municipios: 2 * KM2, detalhe: 0.002 * KM2 };
const ILHA_MINIMA = { ufs: 40 * KM2, municipios: 1 * KM2 };
// Ilha oceânica de município do continente (Trindade e Martim Vaz são de Vitória-ES, a 1.100 km da costa): sai de todos os
// arquivos, senão a caixa do município e da UF vira oceano e o enquadramento se perde.
const ILHA_DISTANTE = { area: 50 * KM2, distancia: 50_000 / METROS };

type Ponto = [number, number];

interface Topo {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: Ponto[][];
  objects: Record<string, { geometries: Array<{ type: string; arcs: number[][] | number[][][]; properties: { codarea: string } }> }>;
}

interface Localidade {
  'municipio-id': number;
  'municipio-nome': string;
  'UF-sigla': string;
}

async function baixar<T>(url: string): Promise<T> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`IBGE respondeu ${resposta.status} para ${url}`);
  return (await resposta.json()) as T;
}

// ---------- Visvalingam–Whyatt: área efetiva de cada ponto, calculada uma vez, cortada por limiar depois ----------

const areaTriangulo = (a: Ponto, b: Ponto, c: Ponto): number =>
  Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;

function areasEfetivas(pts: Ponto[]): Float64Array {
  const n = pts.length;
  const area = new Float64Array(n).fill(Infinity);
  if (n < 3) return area;
  const anterior = Int32Array.from({ length: n }, (_, i) => i - 1);
  const proximo = Int32Array.from({ length: n }, (_, i) => i + 1);
  const atual = new Float64Array(n);
  // Heap mínimo com remoção preguiçosa: entradas velhas são puladas ao sair.
  const chaves: number[] = [];
  const itens: number[] = [];
  const subir = (i: number) => {
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (chaves[pai] <= chaves[i]) break;
      [chaves[pai], chaves[i]] = [chaves[i], chaves[pai]];
      [itens[pai], itens[i]] = [itens[i], itens[pai]];
      i = pai;
    }
  };
  const empurrar = (chave: number, item: number) => {
    chaves.push(chave);
    itens.push(item);
    subir(chaves.length - 1);
  };
  const tirar = (): [number, number] => {
    const topo: [number, number] = [chaves[0], itens[0]];
    const ultimaChave = chaves.pop() as number;
    const ultimoItem = itens.pop() as number;
    if (chaves.length) {
      chaves[0] = ultimaChave;
      itens[0] = ultimoItem;
      let i = 0;
      for (;;) {
        const e = 2 * i + 1;
        const d = e + 1;
        let menor = i;
        if (e < chaves.length && chaves[e] < chaves[menor]) menor = e;
        if (d < chaves.length && chaves[d] < chaves[menor]) menor = d;
        if (menor === i) break;
        [chaves[menor], chaves[i]] = [chaves[i], chaves[menor]];
        [itens[menor], itens[i]] = [itens[i], itens[menor]];
        i = menor;
      }
    }
    return topo;
  };

  for (let i = 1; i < n - 1; i++) {
    atual[i] = areaTriangulo(pts[i - 1], pts[i], pts[i + 1]);
    empurrar(atual[i], i);
  }
  let maior = 0;
  const removido = new Uint8Array(n);
  while (chaves.length) {
    const [a, i] = tirar();
    if (removido[i] || a !== atual[i]) continue;
    // Área efetiva nunca diminui: um ponto não sai antes de outro que já saiu com área maior.
    maior = Math.max(maior, a);
    area[i] = maior;
    removido[i] = 1;
    const p = anterior[i];
    const q = proximo[i];
    proximo[p] = q;
    anterior[q] = p;
    if (p > 0) {
      atual[p] = areaTriangulo(pts[anterior[p]], pts[p], pts[q]);
      empurrar(atual[p], p);
    }
    if (q < n - 1) {
      atual[q] = areaTriangulo(pts[p], pts[q], pts[proximo[q]]);
      empurrar(atual[q], q);
    }
  }
  return area;
}

/** Pontos com área efetiva >= limiar; arco fechado guarda pelo menos 3 pontos distintos para não sumir. */
function cortar(pts: Ponto[], areas: Float64Array, limiar: number): Ponto[] {
  const fechado = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  let corte = limiar;
  if (fechado) {
    const internas = [...areas.slice(1, -1)].sort((a, b) => b - a);
    corte = Math.min(limiar, internas[Math.min(1, internas.length - 1)]);
  }
  return pts.filter((_, i) => areas[i] >= corte);
}

// ---------- anéis, áreas e polylabel ----------

/** [x0, y0, x1, y1]. Laço, não Math.min(...pts): a malha tem pontos demais para virar argumentos de função. */
function caixa(pts: Ponto[]): [number, number, number, number] {
  const c: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) {
    c[0] = Math.min(c[0], x);
    c[1] = Math.min(c[1], y);
    c[2] = Math.max(c[2], x);
    c[3] = Math.max(c[3], y);
  }
  return c;
}

function areaAnel(pts: Ponto[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(s) / 2;
}

/** Distância com sinal do ponto ao contorno (positiva dentro, regra par-ímpar entre todos os anéis). */
function distanciaAoContorno(x: number, y: number, aneis: Ponto[][]): number {
  let dentro = false;
  let minimo = Infinity;
  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [ax, ay] = anel[i];
      const [bx, by] = anel[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) dentro = !dentro;
      const dx = bx - ax;
      const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
      minimo = Math.min(minimo, (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2);
    }
  }
  return (dentro ? 1 : -1) * Math.sqrt(minimo);
}

/** Polo de inacessibilidade (algoritmo polylabel da Mapbox): o ponto mais fundo dentro do polígono e o raio até a borda. */
function polylabel(aneis: Ponto[][]): [number, number, number] {
  const [x0, y0, x1, y1] = caixa(aneis.flat());
  const lado = Math.min(x1 - x0, y1 - y0);
  if (lado === 0) return [x0, y0, 0];
  const precisao = Math.max(1, lado / 200);
  type Celula = { x: number; y: number; h: number; d: number; max: number };
  const celula = (x: number, y: number, h: number): Celula => {
    const d = distanciaAoContorno(x, y, aneis);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const fila: Celula[] = [];
  const por = (c: Celula) => {
    let i = fila.length;
    while (i > 0 && fila[i - 1].max > c.max) i--;
    fila.splice(i, 0, c);
  };
  const h0 = lado / 2;
  for (let x = x0; x < x1; x += lado) for (let y = y0; y < y1; y += lado) por(celula(x + h0, y + h0, h0));
  let melhor = celula((x0 + x1) / 2, (y0 + y1) / 2, 0);
  while (fila.length) {
    const c = fila.pop() as Celula;
    if (c.d > melhor.d) melhor = c;
    if (c.max - melhor.d <= precisao) continue;
    const h = c.h / 2;
    por(celula(c.x - h, c.y - h, h));
    por(celula(c.x + h, c.y - h, h));
    por(celula(c.x - h, c.y + h, h));
    por(celula(c.x + h, c.y + h, h));
  }
  return [Math.round(melhor.x), Math.round(melhor.y), Math.round(Math.max(0, melhor.d))];
}

// ---------- montagem ----------

const [malha, localidades] = await Promise.all([baixar<Topo>(MALHA), baixar<Localidade[]>(LOCALIDADES)]);

const projetar = albers(...PROJECAO);
const { scale, translate } = malha.transform;
const arcosMetros: Ponto[][] = malha.arcs.map((arco) => {
  let qx = 0;
  let qy = 0;
  return arco.map(([dx, dy]) => {
    qx += dx;
    qy += dy;
    return projetar(qx * scale[0] + translate[0], qy * scale[1] + translate[1]);
  });
});
const [xMin, yMin, xMax, yMax] = caixa(arcosMetros.flat());
const largura = Math.ceil((xMax - xMin) / METROS);
const altura = Math.ceil((yMax - yMin) / METROS);

// Grade inteira, y para baixo; pontos repetidos que a quantização junta saem (o arco fica com pelo menos as duas pontas).
const arcos: Ponto[][] = arcosMetros.map((arco) => {
  const grade = arco.map(([x, y]): Ponto => [Math.round((x - xMin) / METROS), Math.round((yMax - y) / METROS)]);
  const limpo = grade.filter((p, i) => i === 0 || p[0] !== grade[i - 1][0] || p[1] !== grade[i - 1][1]);
  return limpo.length > 1 ? limpo : [grade[0], grade[grade.length - 1]];
});
const areas = arcos.map(areasEfetivas);

interface FeicaoTopo {
  codigo: number;
  aneis: number[][];
}
const feicoes: FeicaoTopo[] = Object.values(malha.objects)[0]
  .geometries.map((g) => ({
    codigo: Number(g.properties.codarea),
    aneis: (g.type === 'MultiPolygon' ? (g.arcs as number[][][]).flat() : (g.arcs as number[][])).map((anel) => [...anel]),
  }))
  .sort((a, b) => a.codigo - b.codigo);

// Cobertura: um polígono para cada município da API de localidades, nem mais nem menos.
const oficiais = new Map(localidades.map((l) => [l['municipio-id'], l]));
const naMalha = new Set(feicoes.map((f) => f.codigo));
const faltam = [...oficiais.keys()].filter((c) => !naMalha.has(c));
const sobram = [...naMalha].filter((c) => !oficiais.has(c));
if (faltam.length || sobram.length) {
  throw new Error(`Malha e localidades não batem. Sem polígono: ${faltam.join(', ') || '-'}. Sem localidade: ${sobram.join(', ') || '-'}.`);
}
for (const f of feicoes) {
  const uf = UF_POR_CODIGO[Math.floor(f.codigo / 100000)];
  if (uf !== oficiais.get(f.codigo)?.['UF-sigla']) throw new Error(`UF do código ${f.codigo} (${uf}) difere da localidade`);
}

const ufDe = (codigo: number) => Math.floor(codigo / 100000);
const indice = (ref: number) => (ref < 0 ? ~ref : ref);
const pontosDoArco = (pts: Ponto[], ref: number): Ponto[] => (ref < 0 ? [...pts].reverse() : pts);

/** Pontos do anel montado a partir de arcos (cada arco começa onde o anterior termina). */
function pontosDoAnel(anel: number[], fonte: Ponto[][]): Ponto[] {
  const saida: Ponto[] = [];
  for (const ref of anel) {
    const pts = pontosDoArco(fonte[indice(ref)], ref);
    saida.push(...(saida.length ? pts.slice(1) : pts));
  }
  return saida;
}

const areaComSinal = (pts: Ponto[]): number =>
  pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0) / 2;

function dentroDoAnel(x: number, y: number, anel: Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [ax, ay] = anel[i];
    const [bx, by] = anel[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) dentro = !dentro;
  }
  return dentro;
}

/**
 * Anel externo com área positiva (horário na tela, y para baixo) e buraco com negativa. Assim o canvas junta vizinhos do
 * mesmo tom num Path2D só e pinta com a regra 'nonzero': com 'evenodd', um enclave do mesmo tom que o município em volta
 * sairia vazado. Inverter um anel é inverter a lista de refs e o sentido de cada uma; os arcos não mudam.
 */
function orientar(aneis: number[][], fonte: Ponto[][]): number[][] {
  const pontos = aneis.map((anel) => pontosDoAnel(anel, fonte));
  return aneis.map((anel, i) => {
    const [[x0, y0], [x1, y1]] = pontos[i];
    const buraco = pontos.reduce((d, outro, k) => (k !== i && dentroDoAnel((x0 + x1) / 2, (y0 + y1) / 2, outro) ? !d : d), false);
    return areaComSinal(pontos[i]) > 0 !== buraco ? anel : [...anel].reverse().map((r) => ~r);
  });
}

/** Distância entre duas caixas (0 se se tocam). */
const distanciaCaixas = (a: number[], b: number[]) =>
  Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));

for (const f of feicoes) {
  const aneis = f.aneis.map((anel) => {
    const pts = pontosDoAnel(anel, arcos);
    return { anel, area: areaAnel(pts), caixa: caixa(pts) };
  });
  const principal = aneis.reduce((a, b) => (b.area > a.area ? b : a));
  const longe = aneis.filter((a) => a.area < ILHA_DISTANTE.area && distanciaCaixas(a.caixa, principal.caixa) > ILHA_DISTANTE.distancia);
  if (!longe.length) continue;
  f.aneis = aneis.filter((a) => !longe.includes(a)).map((a) => a.anel);
  const descrever = (a: (typeof aneis)[number]) =>
    `${(a.area / KM2).toFixed(1)} km² a ${Math.round((distanciaCaixas(a.caixa, principal.caixa) * METROS) / 1000)} km`;
  console.log(`ilha distante fora: ${f.codigo} ${oficiais.get(f.codigo)?.['municipio-nome']} (${longe.map(descrever).join('; ')})`);
}

/** Pontos na grade `fator` vezes mais grossa; a junção vira o mesmo ponto em todo arco que a usa, então a topologia se mantém. */
function engrossar(pts: Ponto[], fator: number): Ponto[] {
  const grade = pts.map(([x, y]): Ponto => [Math.round(x / fator), Math.round(y / fator)]);
  const limpo = grade.filter((p, i) => i === 0 || p[0] !== grade[i - 1][0] || p[1] !== grade[i - 1][1]);
  return limpo.length > 1 ? limpo : [grade[0], grade[grade.length - 1]];
}

/**
 * Corta os arcos no limiar, passa para a grade do arquivo e garante anel com área (>= 3 pontos distintos) em toda feição,
 * devolvendo pontos a um arco quando a simplificação ou a grade o achataram.
 */
function simplificar(fonte: Ponto[][], areasFonte: Float64Array[], limiar: number, fator: number, usados: FeicaoTopo[]): Ponto[][] {
  const corte = new Float64Array(fonte.length).fill(limiar);
  const saida = fonte.map((pts, a) => engrossar(cortar(pts, areasFonte[a], limiar), fator));
  for (let volta = 0; volta < 30; volta++) {
    let reforcos = 0;
    for (const f of usados) {
      for (const anel of f.aneis) {
        if (areaAnel(pontosDoAnel(anel, saida)) > 0) continue;
        for (const ref of anel) {
          const a = indice(ref);
          const internas = [...areasFonte[a].slice(1, -1)].filter((x) => x < corte[a]).sort((x, y) => y - x);
          if (!internas.length) continue;
          corte[a] = internas[0];
          saida[a] = engrossar(cortar(fonte[a], areasFonte[a], corte[a]), fator);
          reforcos++;
        }
      }
    }
    if (!reforcos) return saida;
  }
  throw new Error(`Algum anel continua degenerado depois de reforçar os arcos (limiar ${limiar}, grade ${fator})`);
}

/** Tira ilhas pequenas (anéis abaixo de `minima`), mas nunca o maior anel da feição. */
function semIlhas(f: FeicaoTopo, fonte: Ponto[][], minima: number): number[][] {
  const medidas = f.aneis.map((anel) => areaAnel(pontosDoAnel(anel, fonte)));
  const maior = Math.max(...medidas);
  return f.aneis.filter((_, i) => medidas[i] === maior || medidas[i] >= minima);
}

/**
 * Reindexa só os arcos usados, na ordem e no sentido da primeira referência, e escreve no formato de geo-mapa.ts. Assim cada
 * arco novo começa onde o anterior do anel terminou (delta zero) e a ref nova é sempre a seguinte (delta constante).
 */
function arquivo(
  fs: Array<{ codigo: number; aneis: number[][]; rotulo?: [number, number, number]; nome?: string }>,
  fonte: Ponto[][],
  fator: number,
): MalhaJson {
  const novo = new Map<number, number>();
  const ordem: number[] = [];
  const invertido = new Set<number>();
  const aneis = fs.map((f) =>
    orientar(f.aneis, fonte).map((anel) =>
      anel.map((ref) => {
        const a = indice(ref);
        if (!novo.has(a)) {
          novo.set(a, ordem.length);
          ordem.push(a);
          if (ref < 0) invertido.add(a);
        }
        const n = novo.get(a) as number;
        return ref < 0 !== invertido.has(a) ? ~n : n;
      }),
    ),
  );
  const json: MalhaJson = {
    v: 1,
    largura: Math.ceil(largura / fator),
    altura: Math.ceil(altura / fator),
    metros: METROS * fator,
    projecao: [...PROJECAO, Math.round(xMin), Math.round(yMax)],
    arcos: codificarArcos(ordem.map((a) => (invertido.has(a) ? [...fonte[a]].reverse() : fonte[a]))),
    codigos: codificarDeltas(fs.map((f) => f.codigo)),
    aneis: codificarAneis(aneis),
  };
  if (fs.every((f) => f.rotulo)) json.rotulos = fs.flatMap((f) => (f.rotulo as number[]).map((n) => Math.round(n / fator)));
  if (fs.every((f) => f.nome)) json.nomes = fs.map((f) => f.nome as string);
  return json;
}

// ---------- UFs: anéis costurados com os arcos de divisa, divididos em trechos entre junções e deduplicados ----------

function malhaDasUfs(): { arcos: Ponto[][]; feicoes: Array<{ codigo: number; aneis: number[][] }> } {
  const donos = arcos.map((): number[] => []);
  feicoes.forEach((f) => f.aneis.forEach((anel) => anel.forEach((ref) => donos[indice(ref)].push(ufDe(f.codigo)))));
  // Lado do arco: o par de UFs que ele separa ("ext" = costa ou fronteira).
  const lado = donos.map((ufs) => (ufs.length === 1 ? `${ufs[0]}|ext` : ufs[0] === ufs[1] ? '' : [...ufs].sort().join('|')));
  const chave = (p: Ponto) => `${p[0]},${p[1]}`;

  const trechos = new Map<string, { indice: number; refs: number[] }>();
  const pontosTrecho: Ponto[][] = [];
  const ufs = [...new Set(feicoes.map((f) => ufDe(f.codigo)))].sort((a, b) => a - b);

  const saidaFeicoes = ufs.map((uf) => {
    const refs = feicoes.filter((f) => ufDe(f.codigo) === uf).flatMap((f) => f.aneis.flat()).filter((ref) => lado[indice(ref)]);
    const porInicio = new Map<string, number[]>();
    for (const ref of refs) {
      const k = chave(pontosDoArco(arcos[indice(ref)], ref)[0]);
      porInicio.set(k, [...(porInicio.get(k) ?? []), ref]);
    }
    const usada = new Set<number>();
    const aneis: number[][] = [];
    for (const inicio of refs) {
      if (usada.has(inicio)) continue;
      const anel: number[] = [];
      let ref = inicio;
      while (!usada.has(ref)) {
        usada.add(ref);
        anel.push(ref);
        const pts = pontosDoArco(arcos[indice(ref)], ref);
        const seguinte = (porInicio.get(chave(pts[pts.length - 1])) ?? []).find((r) => !usada.has(r));
        if (seguinte === undefined) break;
        ref = seguinte;
      }
      // Gira o anel para começar numa troca de lado (ou, se o lado nunca troca, no menor arco) e corta em trechos.
      let giro = anel.findIndex((r, i) => lado[indice(r)] !== lado[indice(anel[(i - 1 + anel.length) % anel.length])]);
      if (giro < 0) giro = anel.reduce((m, r, i) => (indice(r) < indice(anel[m]) ? i : m), 0);
      const girado = [...anel.slice(giro), ...anel.slice(0, giro)];
      const pedacos: number[][] = [];
      for (const r of girado) {
        const ultimo = pedacos[pedacos.length - 1];
        if (ultimo && lado[indice(r)] === lado[indice(ultimo[0])]) ultimo.push(r);
        else pedacos.push([r]);
      }
      aneis.push(
        pedacos.map((pedaco) => {
          const inverso = [...pedaco].reverse().map((r) => ~r);
          const fechado = pedacos.length === 1;
          // Trecho fechado: a outra UF o percorre ao contrário e a partir de outro arco; normaliza começo e sentido.
          const normal = (seq: number[]) => {
            if (!fechado) return seq;
            const m = seq.reduce((acc, r, i) => (indice(r) < indice(seq[acc]) ? i : acc), 0);
            return [...seq.slice(m), ...seq.slice(0, m)];
          };
          const [ida, volta] = [normal(pedaco), normal(inverso)];
          const direto = fechado ? ida[0] >= 0 : ida.join() < volta.join();
          const canonico = direto ? ida : volta;
          const k = canonico.join();
          let trecho = trechos.get(k);
          if (!trecho) {
            trecho = { indice: pontosTrecho.length, refs: canonico };
            trechos.set(k, trecho);
            pontosTrecho.push(pontosDoAnel(canonico, arcos));
          }
          return direto ? trecho.indice : ~trecho.indice;
        }),
      );
    }
    return { codigo: uf, aneis };
  });
  return { arcos: pontosTrecho, feicoes: saidaFeicoes };
}

function escrever(nome: string, json: MalhaJson): Promise<void> {
  const texto = JSON.stringify(json);
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    `${nome.padEnd(18)} ${kb(texto.length).padStart(9)}  gzip ${kb(gzipSync(texto, { level: 9 }).length).padStart(9)}  brotli ${kb(brotliCompressSync(texto).length).padStart(9)}`,
  );
  return writeFile(join(SAIDA, nome), texto);
}

await rm(SAIDA, { recursive: true, force: true });
await mkdir(join(SAIDA, 'uf'), { recursive: true });

// UFs: trechos simplificados com força; o rótulo (polylabel) sai do contorno completo.
const ufsTopo = malhaDasUfs();
const ufsArcos = simplificar(ufsTopo.arcos, ufsTopo.arcos.map(areasEfetivas), SIMPLIFICACAO.ufs, GRADE.ufs, ufsTopo.feicoes);
await escrever(
  'ufs.json',
  arquivo(
    ufsTopo.feicoes.map((f) => ({
      codigo: f.codigo,
      aneis: semIlhas(f, ufsArcos, ILHA_MINIMA.ufs / GRADE.ufs ** 2),
      rotulo: polylabel(f.aneis.map((anel) => pontosDoAnel(anel, ufsTopo.arcos))),
    })),
    ufsArcos,
    GRADE.ufs,
  ),
);

// Brasil: todos os municípios, simplificados para a vista nacional.
const nacional = simplificar(arcos, areas, SIMPLIFICACAO.municipios, GRADE.municipios, feicoes);
await escrever(
  'municipios.json',
  arquivo(
    feicoes.map((f) => ({ codigo: f.codigo, aneis: semIlhas(f, nacional, ILHA_MINIMA.municipios / GRADE.municipios ** 2) })),
    nacional,
    GRADE.municipios,
  ),
);

// Por UF: o detalhe da malha, com rótulo (polylabel) e nome de cada município.
const detalhe = simplificar(arcos, areas, SIMPLIFICACAO.detalhe, GRADE.detalhe, feicoes);
for (const uf of [...new Set(feicoes.map((f) => ufDe(f.codigo)))].sort((a, b) => a - b)) {
  const daUf = feicoes
    .filter((f) => ufDe(f.codigo) === uf)
    .map((f) => ({
      codigo: f.codigo,
      aneis: f.aneis,
      rotulo: polylabel(f.aneis.map((anel) => pontosDoAnel(anel, detalhe))),
      nome: oficiais.get(f.codigo)?.['municipio-nome'] as string,
    }));
  await escrever(`uf/${UF_POR_CODIGO[uf].toLowerCase()}.json`, arquivo(daUf, detalhe, GRADE.detalhe));
}
console.log(`${feicoes.length} municípios, ${new Set(feicoes.map((f) => ufDe(f.codigo))).size} UFs, grade ${largura}x${altura} (${METROS} m)`);
