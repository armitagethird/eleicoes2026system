import { describe, expect, it } from 'vitest';
import { buscar, normalizar, type EntradaIndice } from './busca.ts';

// Ordenado por eleitores desc, como /busca.json. Coordenadas não importam aqui.
const e = (slug: string, nome: string, uf: string, eleitores: number): EntradaIndice => [slug, nome, uf, 0, 0, eleitores];

const indice: EntradaIndice[] = [
  e('sao-paulo-sp', 'São Paulo', 'SP', 9_000_000),
  e('rio-de-janeiro-rj', 'Rio de Janeiro', 'RJ', 4_800_000),
  e('sao-luis-ma', 'São Luís', 'MA', 760_000),
  e('rio-pardo-rs', 'Rio Pardo', 'RS', 32_000),
  e('santa-barbara-doeste-sp', "Santa Bárbara d'Oeste", 'SP', 150_000),
  e('bom-jesus-rs', 'Bom Jesus', 'RS', 10_500),
  e('bom-jesus-pi', 'Bom Jesus', 'PI', 8_900),
  e('bom-jesus-go', 'Bom Jesus', 'GO', 18_000),
  e('sao-luis-gonzaga-do-maranhao-ma', 'São Luís Gonzaga do Maranhão', 'MA', 4_400),
  e('sao-luis-do-quitunde-al', 'São Luís do Quitunde', 'AL', 28_000),
  e('rio-maria-pa', 'Rio Maria', 'PA', 14_000),
  e('maceio-al', 'Maceió', 'AL', 700_000),
  e('ji-parana-ro', 'Ji-Paraná', 'RO', 90_000),
  e('mirassol-doeste-mt', "Mirassol d'Oeste", 'MT', 27_000),
].sort((a, b) => b[5] - a[5]);

const slugs = (consulta: string, limite?: number) => buscar(indice, consulta, limite).map((r) => r.slug);

describe('normalizar', () => {
  it.each([
    ['São Luís', 'sao luis'],
    ['SÃO LUÍS', 'sao luis'],
    ["Santa Bárbara d'Oeste", 'santa barbara doeste'],
    ['Santa Bárbara d’Oeste', 'santa barbara doeste'],
    ['Ji-Paraná', 'ji parana'],
    ['  sao   luis  ', 'sao luis'],
    ['São Luís, MA', 'sao luis ma'],
    ['', ''],
    ['   ', ''],
  ])('%j -> %j', (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });
});

describe('buscar', () => {
  it('consulta vazia ou só pontuação não devolve nada', () => {
    expect(buscar(indice, '')).toEqual([]);
    expect(buscar(indice, '   ')).toEqual([]);
    expect(buscar(indice, "-'")).toEqual([]);
  });

  it('ignora acento e caixa na consulta', () => {
    expect(slugs('SAO LUIS')[0]).toBe('sao-luis-ma');
    expect(slugs('são luís')[0]).toBe('sao-luis-ma');
    expect(slugs('maceio')).toEqual(['maceio-al']);
  });

  it('devolve só slug, nome, uf e eleitores', () => {
    expect(buscar(indice, 'maceio')).toEqual([{ slug: 'maceio-al', nome: 'Maceió', uf: 'AL', eleitores: 700_000 }]);
  });

  it('ordena por nome exato > prefixo do nome > prefixo de palavra > contém, mesmo contra eleitores', () => {
    const idx: EntradaIndice[] = [
      e('contem', 'Pernatal', 'AA', 900_000),
      e('palavra', 'Vila Natal', 'BB', 500_000),
      e('prefixo', 'Natalândia', 'CC', 100_000),
      e('exato', 'Natal', 'DD', 1_000),
    ];
    expect(buscar(idx, 'natal').map((r) => r.slug)).toEqual(['exato', 'prefixo', 'palavra', 'contem']);
  });

  it('desempata por eleitores dentro do mesmo nível', () => {
    expect(slugs('bom jesus')).toEqual(['bom-jesus-go', 'bom-jesus-rs', 'bom-jesus-pi']);
  });

  it('mantém cidades de mesmo nome em UFs diferentes como resultados distintos', () => {
    expect(new Set(slugs('bom jesus')).size).toBe(3);
  });

  it('nome exato vem antes de quem só começa com ele', () => {
    expect(slugs('sao luis')).toEqual(['sao-luis-ma', 'sao-luis-do-quitunde-al', 'sao-luis-gonzaga-do-maranhao-ma']);
  });

  it('aceita a UF no fim, com ou sem acento e vírgula', () => {
    expect(slugs('sao luis ma')).toEqual(['sao-luis-ma', 'sao-luis-gonzaga-do-maranhao-ma']);
    expect(slugs('são luís ma')).toEqual(['sao-luis-ma', 'sao-luis-gonzaga-do-maranhao-ma']);
    expect(slugs('São Luís, MA')).toEqual(['sao-luis-ma', 'sao-luis-gonzaga-do-maranhao-ma']);
    expect(slugs('luis ma')).toEqual(['sao-luis-ma', 'sao-luis-gonzaga-do-maranhao-ma']);
  });

  it('a UF no fim separa nomes repetidos', () => {
    expect(slugs('bom jesus pi')).toEqual(['bom-jesus-pi']);
    expect(slugs('bom jesus rs')).toEqual(['bom-jesus-rs']);
  });

  it('só trata o último termo como UF se a consulta sem ele não casar o texto inteiro', () => {
    // "rio pa" é prefixo de "Rio Pardo": quem digita ainda está no meio do nome, não filtrando por Pará.
    expect(slugs('rio pa')).toEqual(['rio-pardo-rs']);
    expect(slugs('rio pa')).not.toContain('rio-maria-pa');
  });

  it('um termo só nunca é UF: "ma" busca nomes, não o Maranhão', () => {
    expect(slugs('ma')).toEqual(['maceio-al', 'rio-maria-pa', 'sao-luis-gonzaga-do-maranhao-ma']);
  });

  it('apostrofo: d\'oeste, d oeste e doeste dão o mesmo resultado', () => {
    for (const consulta of ["santa barbara d'oeste", 'santa barbara d oeste', 'santa barbara doeste', 'Santa Bárbara d’Oeste']) {
      expect(slugs(consulta), consulta).toEqual(['santa-barbara-doeste-sp']);
    }
  });

  it('o apostrofo também separa palavra: "oeste" acha d\'Oeste antes de qualquer "contém"', () => {
    expect(slugs('oeste')).toEqual(['santa-barbara-doeste-sp', 'mirassol-doeste-mt']);
  });

  it('hífen vale como espaço: "ji parana" e "ji-parana" acham Ji-Paraná', () => {
    expect(slugs('ji parana')).toEqual(['ji-parana-ro']);
    expect(slugs('ji-parana')).toEqual(['ji-parana-ro']);
  });

  it('respeita o limite (padrão 8)', () => {
    const grande: EntradaIndice[] = Array.from({ length: 30 }, (_, i) => e(`cidade-${i}-aa`, `Cidade ${i}`, 'AA', 30 - i));
    expect(buscar(grande, 'cidade')).toHaveLength(8);
    expect(buscar(grande, 'cidade', 3).map((r) => r.slug)).toEqual(['cidade-0-aa', 'cidade-1-aa', 'cidade-2-aa']);
    expect(buscar(grande, 'cidade', 0)).toEqual([]);
  });

  it('sem resultado devolve lista vazia e não altera o índice', () => {
    const antes = JSON.stringify(indice);
    expect(buscar(indice, 'xyzzy')).toEqual([]);
    expect(JSON.stringify(indice)).toBe(antes);
  });

  it('índice vazio devolve lista vazia', () => {
    expect(buscar([], 'sao luis')).toEqual([]);
  });
});
