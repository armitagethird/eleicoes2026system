// Pesquisas registradas no TSE: contrato, filtro de segurança, ordenação e a linha legal do art. 10 da Res. TSE 23.600.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import {
  PALAVRAS_PROIBIDAS,
  PESQUISAS_APOIO,
  PESQUISAS_TITULO,
  PESQUISA_ANTES_1O_TURNO,
  PESQUISA_COLETA_ATE,
  PESQUISA_FICTICIA,
  PESQUISA_VER_DIVULGACAO,
  ROTULO_RESULTADO_PESQUISA,
  TIPO_PESQUISA,
} from './copy.ts';
import {
  fimDaColeta,
  linhaLegal,
  periodoColeta,
  pesquisasDeExemplo,
  pesquisasParaExibir,
  segmentosPesquisa,
  textoBarra,
  type Pesquisa,
} from './pesquisas.ts';

const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const lerJson = (...partes: string[]) => JSON.parse(readFileSync(join(raiz, ...partes), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(lerJson('contracts/schemas/common.schema.json'));
ajv.addSchema(lerJson('contracts/schemas/pesquisas.schema.json'));
const validador = ajv.getSchema('pesquisas.schema.json');
if (!validador) throw new Error('pesquisas.schema.json não carregou');
const valida = (dados: unknown): string | true => (validador(dados) ? true : ajv.errorsText(validador.errors));

const dadosReais = lerJson('site/src/data/pesquisas.json') as Pesquisa[];
const exemplos = lerJson('contracts/fixtures/pesquisas.exemplo.json') as Pesquisa[];

// O exemplo da linha legal do brief. Só existe neste teste: nunca vai para src/data nem para a tela.
const quaest: Pesquisa = {
  id: 'quaest-2026-10-04',
  instituto: 'Quaest',
  contratante: 'Genial Investimentos',
  registro: 'BR-01234/2026',
  coleta: { inicio: '2026-10-01', fim: '2026-10-04' },
  entrevistas: 2004,
  margem_pp: 2,
  confianca_pct: 95,
  tipo: 'votos_totais',
  cenario: '2turno',
  resultados: { '13': 46, '22': 43, brancos_nulos: 7, indecisos: 4 },
  divulgada_em: '2026-10-05',
  fonte_url: 'https://exemplo.invalid/quaest',
};
const com = (alteracoes: Partial<Pesquisa>): Pesquisa => ({ ...quaest, ...alteracoes });
const fim = (dia: string, id: string, extra: Partial<Pesquisa> = {}): Pesquisa =>
  com({ id, coleta: { inicio: '2026-09-20', fim: dia }, ...extra });
const semCampo = (campo: keyof Pesquisa): Record<string, unknown> => {
  const { [campo]: _tirado, ...resto } = quaest;
  return resto;
};

describe('contrato: src/data/pesquisas.json', () => {
  it('todo item passa no schema', () => {
    expect(Array.isArray(dadosReais)).toBe(true);
    expect(valida(dadosReais)).toBe(true);
  });

  it('nenhum item tem ficticio:true (divulgar pesquisa falsa é crime)', () => {
    expect(dadosReais.filter((p) => p.ficticio === true)).toEqual([]);
  });

  it('ids e registros não se repetem, o fim da coleta não vem antes do início e os percentuais não passam de 100', () => {
    expect(new Set(dadosReais.map((p) => p.id)).size).toBe(dadosReais.length);
    expect(new Set(dadosReais.map((p) => p.registro)).size).toBe(dadosReais.length);
    for (const p of dadosReais) {
      expect(p.coleta.fim >= p.coleta.inicio, p.id).toBe(true);
      const soma = Object.values(p.resultados).reduce((s, v) => s + v, 0);
      expect(soma, p.id).toBeLessThanOrEqual(100.5);
    }
  });
});

describe('contrato: o schema recusa o que seria vergonhoso em público', () => {
  it('a fixture de exemplo passa e todo item dela é ficticio:true', () => {
    expect(valida(exemplos)).toBe(true);
    expect(exemplos.length).toBeGreaterThanOrEqual(4);
    expect(exemplos.every((p) => p.ficticio === true)).toBe(true);
  });

  it('a fixture cobre votos totais, votos válidos, sem contratante e empate dentro da margem', () => {
    expect(exemplos.some((p) => p.tipo === 'votos_totais')).toBe(true);
    expect(exemplos.some((p) => p.tipo === 'votos_validos')).toBe(true);
    expect(exemplos.some((p) => p.contratante === null)).toBe(true);
    expect(exemplos.some((p) => Math.abs(p.resultados['13'] - p.resultados['22']) <= p.margem_pp)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['registro sem o zero à esquerda', { ...quaest, registro: 'BR-1234/2026' }],
    ['registro em minúsculas', { ...quaest, registro: 'br-01234/2026' }],
    ['sem margem de erro', semCampo('margem_pp')],
    ['sem nível de confiança', semCampo('confianca_pct')],
    ['sem número de entrevistas', semCampo('entrevistas')],
    ['sem período de coleta', semCampo('coleta')],
    ['sem contratante (tem de ser null, não ausente)', semCampo('contratante')],
    ['cenário que não é o 2º turno', { ...quaest, cenario: '1turno' }],
    ['tipo desconhecido', { ...quaest, tipo: 'votos_brutos' }],
    ['sem o 22', { ...quaest, resultados: { '13': 50 } }],
    ['percentual acima de 100', { ...quaest, resultados: { '13': 120, '22': 10 } }],
    ['fonte_url que não é http(s)', { ...quaest, fonte_url: 'javascript:alert(1)' }],
    ['campo fora do contrato', { ...quaest, media: 45 }],
    ['data que não existe', { ...quaest, divulgada_em: '2026-02-30' }],
  ])('recusa: %s', (_nome, item) => {
    expect(valida([item])).not.toBe(true);
  });
});

describe('pesquisasParaExibir', () => {
  it('ordena pelo fim da coleta, a mais recente primeiro', () => {
    const lista = [fim('2026-10-02', 'b'), fim('2026-10-09', 'd'), fim('2026-09-30', 'a'), fim('2026-10-05', 'c')];
    expect(pesquisasParaExibir(lista).map((p) => p.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('empata o fim da coleta pela divulgação mais recente e depois pelo id', () => {
    const lista = [
      fim('2026-10-04', 'z', { divulgada_em: '2026-10-05' }),
      fim('2026-10-04', 'b', { divulgada_em: '2026-10-06' }),
      fim('2026-10-04', 'a', { divulgada_em: '2026-10-06' }),
    ];
    expect(pesquisasParaExibir(lista).map((p) => p.id)).toEqual(['a', 'b', 'z']);
  });

  it('mostra no máximo 5 por padrão e respeita o limite pedido', () => {
    const lista = Array.from({ length: 8 }, (_, i) => fim(`2026-10-0${i + 1}`, `p${i + 1}`));
    expect(pesquisasParaExibir(lista).map((p) => p.id)).toEqual(['p8', 'p7', 'p6', 'p5', 'p4']);
    expect(pesquisasParaExibir(lista, 2).map((p) => p.id)).toEqual(['p8', 'p7']);
    expect(pesquisasParaExibir(lista, 0)).toEqual([]);
  });

  it('não muda a lista recebida', () => {
    const lista = [fim('2026-10-02', 'b'), fim('2026-10-09', 'a')];
    pesquisasParaExibir(lista);
    expect(lista.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('descarta qualquer item com ficticio:true', () => {
    expect(pesquisasParaExibir([com({ ficticio: true })])).toEqual([]);
    expect(pesquisasParaExibir(exemplos)).toEqual([]);
    expect(pesquisasParaExibir([com({ ficticio: false })])).toHaveLength(1);
  });

  it('lista vazia não mostra nada', () => {
    expect(pesquisasParaExibir([])).toEqual([]);
  });

  it.each<[string, unknown]>([
    ['sem instituto', semCampo('instituto')],
    ['instituto vazio', { ...quaest, instituto: '  ' }],
    ['sem margem de erro', semCampo('margem_pp')],
    ['margem zero', { ...quaest, margem_pp: 0 }],
    ['sem confiança', semCampo('confianca_pct')],
    ['sem entrevistas', semCampo('entrevistas')],
    ['entrevistas fracionárias', { ...quaest, entrevistas: 10.5 }],
    ['sem coleta', semCampo('coleta')],
    ['coleta sem fim', { ...quaest, coleta: { inicio: '2026-10-01' } }],
    ['fim antes do início', { ...quaest, coleta: { inicio: '2026-10-04', fim: '2026-10-01' } }],
    ['data que não existe', { ...quaest, coleta: { inicio: '2026-02-30', fim: '2026-03-02' } }],
    ['sem contratante (nem null)', semCampo('contratante')],
    ['sem registro', semCampo('registro')],
    ['registro mal formado', { ...quaest, registro: 'BR-1234/2026' }],
    ['tipo desconhecido', { ...quaest, tipo: 'votos_brutos' }],
    ['cenário que não é o 2º turno', { ...quaest, cenario: '1turno' }],
    ['sem resultados', semCampo('resultados')],
    ['sem o 13', { ...quaest, resultados: { '22': 43 } }],
    ['sem o 22', { ...quaest, resultados: { '13': 46 } }],
    ['resultado que não é número', { ...quaest, resultados: { '13': '46', '22': 43 } }],
    ['indecisos acima de 100', { ...quaest, resultados: { '13': 46, '22': 43, indecisos: 130 } }],
    ['sem divulgação', semCampo('divulgada_em')],
    ['sem fonte', semCampo('fonte_url')],
    ['fonte que não é http(s)', { ...quaest, fonte_url: 'javascript:alert(1)' }],
    ['não é objeto', 'Quaest'],
    ['nulo', null],
  ])('descarta item inválido: %s', (_nome, item) => {
    expect(pesquisasParaExibir([item])).toEqual([]);
  });

  it('aceita contratante null (o registro pode não ter) e um item válido entre inválidos', () => {
    expect(pesquisasParaExibir([com({ contratante: null })])).toHaveLength(1);
    expect(pesquisasParaExibir([null, quaest, { ...quaest, id: 'sem-registro', registro: '' }]).map((p) => p.id)).toEqual([quaest.id]);
  });
});

describe('pesquisasDeExemplo (só o playground)', () => {
  it('mantém os itens ficticio:true, mas continua descartando os incompletos', () => {
    expect(pesquisasDeExemplo(exemplos, 99)).toHaveLength(exemplos.length);
    expect(pesquisasDeExemplo([{ ...exemplos[0], registro: 'x' }])).toEqual([]);
  });

  it('a fixture mostra 5 de 6, a mais recente primeiro', () => {
    const mostradas = pesquisasDeExemplo(exemplos);
    expect(exemplos.length).toBeGreaterThan(5);
    expect(mostradas).toHaveLength(5);
    const fins = mostradas.map((p) => p.coleta.fim);
    expect(fins).toEqual([...fins].sort().reverse());
  });
});

describe('linha legal (Res. TSE 23.600, art. 10)', () => {
  it('monta a linha do brief', () => {
    expect(linhaLegal(quaest)).toBe(
      'Quaest · contratada por Genial Investimentos · 2.004 entrevistas · 1 a 4/out · margem ±2 p.p. · confiança 95% · registro BR-01234/2026',
    );
  });

  it('traz os 6 elementos do art. 10: período, margem, confiança, entrevistas, instituto e contratante, registro', () => {
    const linha = linhaLegal(quaest);
    for (const elemento of ['1 a 4/out', '±2 p.p.', '95%', '2.004 entrevistas', 'Quaest', 'Genial Investimentos', 'BR-01234/2026']) {
      expect(linha).toContain(elemento);
    }
  });

  it('sem contratante, fica sem a expressão e com os outros 5 elementos', () => {
    const linha = linhaLegal(com({ contratante: null }));
    expect(linha).not.toContain('contratada');
    expect(linha).not.toContain('null');
    expect(linha).toBe('Quaest · 2.004 entrevistas · 1 a 4/out · margem ±2 p.p. · confiança 95% · registro BR-01234/2026');
  });

  it('escreve os números como o instituto divulgou, em pt-BR: sem inventar casa decimal', () => {
    expect(linhaLegal(com({ margem_pp: 2.5, entrevistas: 5132, confianca_pct: 95.45 }))).toContain(
      '5.132 entrevistas · 1 a 4/out · margem ±2,5 p.p. · confiança 95,45%',
    );
    expect(linhaLegal(com({ margem_pp: 3 }))).toContain('margem ±3 p.p.');
    expect(linhaLegal(com({ entrevistas: 1 }))).toContain('1 entrevista ·');
  });

  it('período de coleta: mesmo mês, meses diferentes e um dia só', () => {
    expect(periodoColeta({ inicio: '2026-10-01', fim: '2026-10-04' })).toBe('1 a 4/out');
    expect(periodoColeta({ inicio: '2026-09-29', fim: '2026-10-07' })).toBe('29/set a 7/out');
    expect(periodoColeta({ inicio: '2026-10-06', fim: '2026-10-06' })).toBe('6/out');
  });

  it('o cabeçalho da linha mostra o fim da coleta', () => {
    expect(fimDaColeta(quaest)).toBe(`${PESQUISA_COLETA_ATE} 4/out`);
  });

  it('coleta encerrada antes do 1º turno (04/10) é avisada', () => {
    const antes = { ...quaest, coleta: { inicio: '2026-10-02', fim: '2026-10-03' } };
    expect(fimDaColeta(antes)).toBe(`${PESQUISA_COLETA_ATE} 3/out, ${PESQUISA_ANTES_1O_TURNO}`);
  });
});

describe('barra: 13 sempre antes do 22', () => {
  it('os segmentos saem 13, brancos e nulos, indecisos, 22, qualquer que seja a ordem dos dados ou quem tem mais', () => {
    const chaves = (p: Pesquisa) => segmentosPesquisa(p).map((s) => s.chave);
    expect(chaves(quaest)).toEqual(['13', 'brancos_nulos', 'indecisos', '22']);
    expect(chaves(com({ resultados: { indecisos: 4, '22': 60, '13': 30 } }))).toEqual(['13', 'indecisos', '22']);
    expect(chaves(com({ resultados: { '22': 51.4, '13': 48.6 } }))).toEqual(['13', '22']);
  });

  it('só entram os resultados que o instituto divulgou, com o valor divulgado', () => {
    expect(segmentosPesquisa(quaest).map((s) => s.pct)).toEqual([46, 7, 4, 43]);
    expect(segmentosPesquisa(com({ resultados: { '13': 44, '22': 41 } }))).toEqual([
      { chave: '13', pct: 44 },
      { chave: '22', pct: 41 },
    ]);
  });

  it('o texto alternativo diz tudo da barra, com o 13 antes do 22 mesmo quando o 22 tem mais', () => {
    expect(textoBarra(quaest)).toBe('Quaest, votos totais: 13, 46%; brancos e nulos, 7%; indecisos, 4%; 22, 43%');
    const valida22 = textoBarra(com({ tipo: 'votos_validos', resultados: { '13': 48.6, '22': 51.4 } }));
    expect(valida22).toBe('Quaest, votos válidos: 13, 48,6%; 22, 51,4%');
    expect(valida22.indexOf('13')).toBeLessThan(valida22.indexOf('22'));
  });
});

describe('vocabulário do bloco', () => {
  it('não diz lidera, eleito, média, tendência nem palavra proibida: pesquisa não é resultado', () => {
    const textos = [
      PESQUISAS_TITULO,
      PESQUISAS_APOIO,
      PESQUISA_COLETA_ATE,
      PESQUISA_FICTICIA,
      PESQUISA_VER_DIVULGACAO,
      ...Object.values(TIPO_PESQUISA),
      ...Object.values(ROTULO_RESULTADO_PESQUISA),
      linhaLegal(quaest),
      textoBarra(quaest),
    ]
      .join(' ')
      .toLowerCase();
    for (const palavra of [...PALAVRAS_PROIBIDAS, 'lidera', 'eleit', 'média', 'media', 'tendência', 'à frente', 'vence']) {
      expect(textos, palavra).not.toContain(palavra);
    }
  });

  it('o apoio e o título são os decididos pelo Romero', () => {
    expect(PESQUISAS_TITULO).toBe('Pesquisas registradas no TSE');
    expect(PESQUISAS_APOIO).toBe('Cada pesquisa como o instituto divulgou. Não é resultado.');
    expect(TIPO_PESQUISA).toEqual({ votos_totais: 'votos totais', votos_validos: 'votos válidos' });
  });
});
