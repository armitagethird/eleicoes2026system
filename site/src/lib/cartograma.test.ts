import { describe, expect, it } from 'vitest';
import { UFS, type UF } from './contratos.ts';
import { AREAS, CARTOGRAMA, COLUNAS, LINHAS, LUGARES, ordemEntrada, vizinho, type Direcao, type Lugar } from './cartograma.ts';

// Fronteiras terrestres reais entre UFs (IBGE). Só para julgar se a grade é plausível.
const FRONTEIRAS: Record<UF, UF[]> = {
  AC: ['AM', 'RO'],
  AL: ['PE', 'SE', 'BA'],
  AM: ['AC', 'RO', 'MT', 'PA', 'RR'],
  AP: ['PA'],
  BA: ['SE', 'AL', 'PE', 'PI', 'TO', 'GO', 'MG', 'ES'],
  CE: ['PI', 'PE', 'PB', 'RN'],
  DF: ['GO', 'MG'],
  ES: ['BA', 'MG', 'RJ'],
  GO: ['TO', 'BA', 'MG', 'MS', 'MT', 'DF'],
  MA: ['PA', 'TO', 'PI'],
  MG: ['BA', 'ES', 'RJ', 'SP', 'MS', 'GO', 'DF'],
  MS: ['MT', 'GO', 'MG', 'SP', 'PR'],
  MT: ['AM', 'PA', 'TO', 'GO', 'MS', 'RO'],
  PA: ['AP', 'RR', 'AM', 'MT', 'TO', 'MA'],
  PB: ['RN', 'CE', 'PE'],
  PE: ['PB', 'CE', 'PI', 'BA', 'AL'],
  PI: ['MA', 'TO', 'BA', 'PE', 'CE'],
  PR: ['SP', 'MS', 'SC'],
  RJ: ['ES', 'MG', 'SP'],
  RN: ['CE', 'PB'],
  RO: ['AC', 'AM', 'MT'],
  RR: ['AM', 'PA'],
  RS: ['SC'],
  SC: ['PR', 'RS'],
  SE: ['AL', 'BA'],
  SP: ['MG', 'RJ', 'PR', 'MS'],
  TO: ['MA', 'PI', 'BA', 'GO', 'MT', 'PA'],
};

// Centro aproximado de cada UF [longitude, latitude], para conferir a orientação da grade.
const CENTRO: Record<UF, [number, number]> = {
  AC: [-70.5, -9.0], AL: [-36.6, -9.6], AM: [-64.6, -4.2], AP: [-51.8, 1.4], BA: [-41.7, -12.5], CE: [-39.6, -5.2],
  DF: [-47.8, -15.8], ES: [-40.7, -19.6], GO: [-49.6, -15.9], MA: [-45.3, -5.0], MG: [-44.6, -18.5], MS: [-54.8, -20.5],
  MT: [-55.9, -12.9], PA: [-52.3, -4.0], PB: [-36.7, -7.1], PE: [-37.9, -8.3], PI: [-42.9, -7.4], PR: [-51.6, -24.6],
  RJ: [-42.7, -22.2], RN: [-36.6, -5.8], RO: [-62.8, -10.9], RR: [-61.4, 2.0], RS: [-53.3, -29.7], SC: [-50.5, -27.2],
  SE: [-37.4, -10.6], SP: [-48.6, -22.2], TO: [-48.3, -10.2],
};

const chave = ({ c, r }: { c: number; r: number }) => `${c},${r}`;
const dentro = (area: { c: number; r: number; w: number; h: number }, { c, r }: { c: number; r: number }) =>
  c >= area.c && c < area.c + area.w && r >= area.r && r < area.r + area.h;
const ufs = UFS as readonly UF[];

describe('cartograma: a grade', () => {
  it('tem as 28 placas (Brasil + 27 UFs), cada uma numa célula única dentro de 7 × 8', () => {
    expect([...LUGARES].sort()).toEqual(['BR', ...UFS].sort());
    expect(Object.keys(CARTOGRAMA).sort()).toEqual([...LUGARES].sort());
    const celulas = LUGARES.map((l) => CARTOGRAMA[l]);
    expect(new Set(celulas.map(chave)).size).toBe(28);
    for (const { c, r } of celulas) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(COLUNAS);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(LINHAS);
    }
  });

  it('nenhuma placa colide com o título, o painel ou a legenda, e essas áreas não se sobrepõem', () => {
    const areas = Object.values(AREAS);
    for (const l of LUGARES) for (const area of areas) expect(dentro(area, CARTOGRAMA[l]), l).toBe(false);
    for (let c = 1; c <= COLUNAS; c++) {
      for (let r = 1; r <= LINHAS; r++) expect(areas.filter((a) => dentro(a, { c, r })).length).toBeLessThanOrEqual(1);
    }
  });

  it('o Brasil fica no oceano: a leste de todas as placas da sua linha e sem encostar em UF nenhuma', () => {
    const br = CARTOGRAMA.BR;
    const daLinha = ufs.filter((uf) => CARTOGRAMA[uf].r === br.r);
    expect(daLinha.length).toBeGreaterThan(0);
    for (const uf of daLinha) expect(CARTOGRAMA[uf].c, uf).toBeLessThan(br.c);
    for (const uf of ufs) {
      const { c, r } = CARTOGRAMA[uf];
      expect(Math.max(Math.abs(c - br.c), Math.abs(r - br.r)), uf).toBeGreaterThan(1);
    }
  });
});

describe('cartograma: a silhueta lembra o Brasil', () => {
  const linha = (r: number) => ufs.filter((uf) => CARTOGRAMA[uf].r === r).map((uf) => CARTOGRAMA[uf].c);
  const leste = (r: number) => Math.max(...linha(r));
  const oeste = (r: number) => Math.min(...linha(r));
  const largura = (r: number) => leste(r) - oeste(r) + 1;

  it('o norte tem duas pontas (RR e AP) separadas pela Guiana', () => {
    expect(linha(1).sort()).toEqual([CARTOGRAMA.RR.c, CARTOGRAMA.AP.c].sort());
    expect(CARTOGRAMA.AP.c - CARTOGRAMA.RR.c).toBeGreaterThan(1);
  });

  it('a faixa mais larga é a do meio-norte, do Acre à Paraíba, de margem a margem', () => {
    expect(largura(3)).toBe(COLUNAS);
    expect([CARTOGRAMA.AC.c, CARTOGRAMA.PB.c]).toEqual([1, COLUNAS]);
  });

  it('o Nordeste é saliente: a costa recua para oeste depois de AL e não volta', () => {
    const nordeste = Math.max(leste(3), leste(4));
    for (let r = 5; r <= LINHAS; r++) expect(leste(r), `linha ${r}`).toBeLessThan(nordeste);
    for (let r = 6; r <= LINHAS; r++) expect(leste(r), `linha ${r}`).toBeLessThanOrEqual(leste(r - 1));
  });

  it('o Sul afina até uma ponta: RS é a placa mais ao sul, sozinha na linha, a sudoeste de SC', () => {
    for (let r = 5; r < LINHAS; r++) expect(largura(r + 1), `linha ${r + 1}`).toBeLessThanOrEqual(largura(r));
    expect(linha(LINHAS)).toEqual([CARTOGRAMA.RS.c]);
    expect(CARTOGRAMA.RS.r - CARTOGRAMA.SC.r).toBe(1);
    expect(CARTOGRAMA.RS.c).toBeLessThan(CARTOGRAMA.SC.c);
  });
});

describe('cartograma: vizinhanças plausíveis', () => {
  const vizinhos8 = (uf: UF) =>
    ufs.filter((outra) => {
      if (outra === uf) return false;
      const a = CARTOGRAMA[uf];
      const b = CARTOGRAMA[outra];
      return Math.abs(a.c - b.c) <= 1 && Math.abs(a.r - b.r) <= 1;
    });

  it('as fronteiras da tabela são simétricas', () => {
    for (const uf of ufs) for (const outra of FRONTEIRAS[uf]) expect(FRONTEIRAS[outra], `${uf}-${outra}`).toContain(uf);
  });

  it('toda UF encosta (inclusive na diagonal) em pelo menos uma UF com que faz fronteira', () => {
    for (const uf of ufs) expect(vizinhos8(uf).some((v) => FRONTEIRAS[uf].includes(v)), uf).toBe(true);
  });

  it('pelo menos 3 de cada 4 pares lado a lado fazem fronteira de verdade', () => {
    const pares: [UF, UF][] = [];
    for (const a of ufs) {
      for (const b of ufs) {
        const ca = CARTOGRAMA[a];
        const cb = CARTOGRAMA[b];
        if (a < b && Math.abs(ca.c - cb.c) + Math.abs(ca.r - cb.r) === 1) pares.push([a, b]);
      }
    }
    const reais = pares.filter(([a, b]) => FRONTEIRAS[a].includes(b));
    expect(pares.length).toBeGreaterThan(30);
    expect(reais.length / pares.length).toBeGreaterThanOrEqual(0.75);
  });

  it('a orientação bate com a geografia: duas ou mais colunas a leste = mais a leste; duas ou mais linhas abaixo = mais ao sul', () => {
    for (const a of ufs) {
      for (const b of ufs) {
        const dc = CARTOGRAMA[b].c - CARTOGRAMA[a].c;
        const dr = CARTOGRAMA[b].r - CARTOGRAMA[a].r;
        if (dc >= 2) expect(CENTRO[b][0], `${b} a leste de ${a}`).toBeGreaterThan(CENTRO[a][0]);
        if (dr >= 2) expect(CENTRO[b][1], `${b} ao sul de ${a}`).toBeLessThan(CENTRO[a][1]);
      }
    }
  });
});

describe('cartograma: teclado e entrada', () => {
  it('as setas levam à placa vizinha esperada', () => {
    const casos: [Lugar, Direcao, Lugar | null][] = [
      ['MA', 'direita', 'CE'],
      ['MA', 'esquerda', 'PA'],
      ['BA', 'baixo', 'ES'],
      ['BA', 'cima', 'PI'],
      ['RR', 'baixo', 'AM'],
      ['AP', 'baixo', 'MA'],
      ['SP', 'baixo', 'SC'],
      ['SC', 'baixo', 'RS'],
      ['RS', 'baixo', null],
      ['AC', 'esquerda', null],
      ['PB', 'direita', null],
    ];
    for (const [de, direcao, para] of casos) expect(vizinho(de, direcao), `${de} ${direcao}`).toBe(para);
  });

  it('a seta oposta sempre volta para uma placa (nunca prende o foco) e nunca aponta para a própria placa', () => {
    const oposta: Record<Direcao, Direcao> = { cima: 'baixo', baixo: 'cima', esquerda: 'direita', direita: 'esquerda' };
    for (const l of LUGARES) {
      for (const d of Object.keys(oposta) as Direcao[]) {
        const alvo = vizinho(l, d);
        if (alvo === null) continue;
        expect(alvo).not.toBe(l);
        expect(vizinho(alvo, oposta[d]), `${l} ${d} ${alvo}`).not.toBeNull();
      }
    }
  });

  it('todas as placas são alcançáveis pelas setas a partir de qualquer uma', () => {
    const vistas = new Set<Lugar>(['RR']);
    const fila: Lugar[] = ['RR'];
    while (fila.length) {
      const atual = fila.shift() as Lugar;
      for (const d of ['cima', 'direita', 'baixo', 'esquerda'] as Direcao[]) {
        const alvo = vizinho(atual, d);
        if (alvo && !vistas.has(alvo)) {
          vistas.add(alvo);
          fila.push(alvo);
        }
      }
    }
    expect(vistas.size).toBe(28);
  });

  it('a entrada escalonada dá um passo único de 0 a 27 por placa, numa onda do noroeste para o sudeste', () => {
    const ordem = ordemEntrada();
    expect([...ordem.values()].sort((a, b) => a - b)).toEqual([...Array(28).keys()]);
    const diagonal = (l: Lugar) => CARTOGRAMA[l].c + CARTOGRAMA[l].r;
    for (const a of LUGARES) for (const b of LUGARES) if (diagonal(a) < diagonal(b)) expect(ordem.get(a)).toBeLessThan(ordem.get(b) as number);
  });
});
