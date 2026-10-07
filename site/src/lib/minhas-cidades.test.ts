import { describe, expect, it } from 'vitest';
import municipios from '../data/municipios.json';
import {
  adicionarCidade,
  CHAVE_MINHAS_CIDADES,
  estaSalva,
  guardarCidades,
  LIMITE_MINHAS_CIDADES,
  lerCidades,
  removerCidade,
  type Armazenamento,
  type CidadeSalva,
} from './minhas-cidades.ts';

const saoPaulo: CidadeSalva = { slug: 'sao-paulo-sp', nome: 'São Paulo', uf: 'SP' };
const rio: CidadeSalva = { slug: 'rio-de-janeiro-rj', nome: 'Rio de Janeiro', uf: 'RJ' };
const salvador: CidadeSalva = { slug: 'salvador-ba', nome: 'Salvador', uf: 'BA' };
const fortaleza: CidadeSalva = { slug: 'fortaleza-ce', nome: 'Fortaleza', uf: 'CE' };
const beloHorizonte: CidadeSalva = { slug: 'belo-horizonte-mg', nome: 'Belo Horizonte', uf: 'MG' };
const manaus: CidadeSalva = { slug: 'manaus-am', nome: 'Manaus', uf: 'AM' };

const memoria = (conteudo?: string): Armazenamento & { gravado: () => string | null } => {
  let valor = conteudo ?? null;
  return {
    getItem: (chave) => (chave === CHAVE_MINHAS_CIDADES ? valor : null),
    setItem: (chave, novo) => {
      if (chave === CHAVE_MINHAS_CIDADES) valor = novo;
    },
    gravado: () => valor,
  };
};

const indisponivel: Armazenamento = {
  getItem: () => {
    throw new DOMException('acesso negado', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('sem espaço', 'QuotaExceededError');
  },
};

describe('adicionarCidade', () => {
  it('guarda a cidade numa lista vazia', () => {
    expect(adicionarCidade([], saoPaulo)).toEqual([saoPaulo]);
  });

  it('põe a mais recente na frente, da mais recente para a mais antiga', () => {
    expect(adicionarCidade([saoPaulo], rio)).toEqual([rio, saoPaulo]);
  });

  it('não duplica: adicionar de novo leva a cidade para a frente', () => {
    expect(adicionarCidade([rio, saoPaulo, salvador], salvador)).toEqual([salvador, rio, saoPaulo]);
  });

  it('guarda no máximo 5 e descarta a mais antiga', () => {
    const cheia = [saoPaulo, rio, salvador, fortaleza, beloHorizonte];
    expect(LIMITE_MINHAS_CIDADES).toBe(5);
    expect(adicionarCidade(cheia, manaus)).toEqual([manaus, saoPaulo, rio, salvador, fortaleza]);
  });

  it('com a lista cheia, readicionar uma que já está nela não descarta ninguém', () => {
    const cheia = [saoPaulo, rio, salvador, fortaleza, beloHorizonte];
    expect(adicionarCidade(cheia, beloHorizonte)).toEqual([beloHorizonte, saoPaulo, rio, salvador, fortaleza]);
  });

  it('não altera a lista recebida', () => {
    const original = [saoPaulo];
    adicionarCidade(original, rio);
    expect(original).toEqual([saoPaulo]);
  });

  it('ignora cidade inválida e devolve a lista como estava', () => {
    expect(adicionarCidade([saoPaulo], { slug: '', nome: 'Nada', uf: 'SP' })).toEqual([saoPaulo]);
    expect(adicionarCidade([saoPaulo], { slug: 'x-zz', nome: 'X', uf: 'ZZ' as CidadeSalva['uf'] })).toEqual([saoPaulo]);
  });

  it('guarda só slug, nome e UF', () => {
    const comSobra = { ...rio, eleitores: 4_800_000 } as CidadeSalva;
    expect(adicionarCidade([], comSobra)).toEqual([rio]);
    expect(Object.keys(adicionarCidade([], comSobra)[0])).toEqual(['slug', 'nome', 'uf']);
  });
});

describe('removerCidade', () => {
  it('tira a cidade pelo slug e mantém a ordem das outras', () => {
    expect(removerCidade([rio, saoPaulo, salvador], 'sao-paulo-sp')).toEqual([rio, salvador]);
  });

  it('slug que não está na lista não muda nada', () => {
    expect(removerCidade([rio], 'manaus-am')).toEqual([rio]);
  });

  it('não altera a lista recebida', () => {
    const original = [rio, saoPaulo];
    removerCidade(original, 'rio-de-janeiro-rj');
    expect(original).toEqual([rio, saoPaulo]);
  });
});

describe('estaSalva', () => {
  it('diz se o slug está na lista', () => {
    expect(estaSalva([rio, saoPaulo], 'sao-paulo-sp')).toBe(true);
    expect(estaSalva([rio, saoPaulo], 'manaus-am')).toBe(false);
    expect(estaSalva([], 'manaus-am')).toBe(false);
  });
});

describe('lerCidades', () => {
  it('sem armazenamento (localStorage bloqueado), devolve lista vazia', () => {
    expect(lerCidades(null)).toEqual([]);
  });

  it('armazenamento sem a chave, devolve lista vazia', () => {
    expect(lerCidades(memoria())).toEqual([]);
  });

  it('getItem que lança (modo privado, cookies bloqueados), devolve lista vazia', () => {
    expect(lerCidades(indisponivel)).toEqual([]);
  });

  it('lê o que guardarCidades gravou', () => {
    const lugar = memoria();
    guardarCidades(lugar, [rio, saoPaulo]);
    expect(lerCidades(lugar)).toEqual([rio, saoPaulo]);
  });

  it.each([
    ['JSON truncado', '[{"slug":"rio-de-janeiro-rj","nome":'],
    ['texto solto', 'rio de janeiro'],
    ['objeto em vez de lista', '{"slug":"rio-de-janeiro-rj"}'],
    ['número', '42'],
    ['null', 'null'],
    ['string vazia', ''],
  ])('conteúdo corrompido (%s) vira lista vazia, sem lançar', (_nome, bruto) => {
    expect(lerCidades(memoria(bruto))).toEqual([]);
  });

  it('descarta item por item o que não tem o formato certo e mantém o resto', () => {
    const bruto = JSON.stringify([
      rio,
      null,
      'texto',
      42,
      { slug: 'sem-nome-sp', uf: 'SP' },
      { slug: 'Maiuscula-SP', nome: 'X', uf: 'SP' },
      { slug: 'com espaco-sp', nome: 'X', uf: 'SP' },
      { slug: 'javascript:alert(1)', nome: 'X', uf: 'SP' },
      { slug: '../admin', nome: 'X', uf: 'SP' },
      { slug: 'xx-zz', nome: 'X', uf: 'ZZ' },
      { slug: 'nome-numero-sp', nome: 7, uf: 'SP' },
      { slug: 'nome-vazio-sp', nome: '   ', uf: 'SP' },
      { slug: 'nome-enorme-sp', nome: 'A'.repeat(200), uf: 'SP' },
      saoPaulo,
    ]);
    expect(lerCidades(memoria(bruto))).toEqual([rio, saoPaulo]);
  });

  it('remove duplicatas guardadas, ficando com a primeira (a mais recente)', () => {
    expect(lerCidades(memoria(JSON.stringify([rio, saoPaulo, rio])))).toEqual([rio, saoPaulo]);
  });

  it('corta em 5 se o armazenado tiver mais', () => {
    const seis = [saoPaulo, rio, salvador, fortaleza, beloHorizonte, manaus];
    expect(lerCidades(memoria(JSON.stringify(seis)))).toEqual(seis.slice(0, 5));
  });

  it('descarta campos a mais do que slug, nome e UF', () => {
    const bruto = JSON.stringify([{ ...rio, email: 'x@y.com', eleitores: 1 }]);
    expect(lerCidades(memoria(bruto))).toEqual([rio]);
  });

  it('aceita todos os slugs, nomes e UFs de municipios.json', () => {
    const todos = municipios.map(({ slug, nome, uf }) => ({ slug, nome, uf }));
    const recusados = todos.filter((c) => adicionarCidade([], c as CidadeSalva).length === 0);
    expect(recusados).toEqual([]);
  });
});

describe('guardarCidades', () => {
  it('grava a lista como JSON na chave do site', () => {
    const lugar = memoria();
    expect(guardarCidades(lugar, [rio])).toBe(true);
    expect(JSON.parse(lugar.gravado() ?? 'null')).toEqual([rio]);
  });

  it('devolve false, sem lançar, quando o navegador recusa gravar (cota, modo privado)', () => {
    expect(guardarCidades(indisponivel, [rio])).toBe(false);
  });

  it('devolve false sem armazenamento', () => {
    expect(guardarCidades(null, [rio])).toBe(false);
  });
});
