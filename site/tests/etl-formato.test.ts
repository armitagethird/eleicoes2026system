// ETL: leitura de ZIP e CSV, soma por município e cálculo das linhas. Dados sintéticos, sem rede e sem os zips do TSE.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { deflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { agregadoVazio, somarDetalhe, somarVotos } from '../scripts/etl/agregar.ts';
import { acumular, calcularLinha, comparecimentoPct, montarCamada, montarHist, percentual, serializarCamada } from '../scripts/etl/camada.ts';
import { dividirLinha, registros } from '../scripts/etl/csv.ts';
import type { Eleicao } from '../scripts/etl/fontes.ts';
import { abrirEntrada, listarZip } from '../scripts/etl/zip.ts';
import { lerCamada } from '../src/lib/camada-mapa.ts';

const ler = async (fluxo: Readable): Promise<string> => {
  const partes: Buffer[] = [];
  for await (const parte of fluxo) partes.push(parte as Buffer);
  return Buffer.concat(partes).toString('utf8');
};

const csv = (...linhas: string[]) => Readable.from([Buffer.from(`${linhas.join('\r\n')}\r\n`, 'latin1')]);

describe('csv do TSE', () => {
  it('divide campos entre aspas, números, vazios e aspas dobradas', () => {
    expect(dividirLinha('"a";"b c";12;"d;e";;"x ""y"" z"')).toEqual(['a', 'b c', '12', 'd;e', '', 'x "y" z']);
  });

  it('campo vazio no fim da linha conta', () => {
    expect(dividirLinha('"a";')).toEqual(['a', '']);
  });

  it('aspas sem fechar são erro, não dado silenciosamente cortado', () => {
    expect(() => dividirLinha('"a;b')).toThrow(/aspas/);
  });

  it('lê Latin-1 e devolve só as colunas pedidas, na ordem pedida', async () => {
    const linhas = await Array.fromAsync(registros(csv('"X";"NM";"QT"', '"1";"SÃO LUÍS";5', '"2";"CAPIXABA";7'), ['QT', 'NM']));
    expect(linhas).toEqual([['5', 'SÃO LUÍS'], ['7', 'CAPIXABA']]);
  });

  it('falha, dizendo qual, quando falta uma coluna', async () => {
    await expect(Array.fromAsync(registros(csv('"A";"B"', '1;2'), ['A', 'C']))).rejects.toThrow(/C/);
  });
});

describe('leitor de zip', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'etl-zip-'));
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));

  interface Item {
    nome: string;
    dados: Buffer;
    deflate: boolean;
    zip64?: boolean;
  }

  /** Monta um ZIP à mão (o CRC não é conferido pelo leitor). */
  function montarZip(itens: Item[]): Buffer {
    const locais: Buffer[] = [];
    const centrais: Buffer[] = [];
    let offset = 0;
    for (const { nome, dados, deflate, zip64 } of itens) {
      const corpo = deflate ? deflateRawSync(dados) : dados;
      const nomeBytes = Buffer.from(nome);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(deflate ? 8 : 0, 8);
      local.writeUInt32LE(corpo.length, 18);
      local.writeUInt32LE(dados.length, 22);
      local.writeUInt16LE(nomeBytes.length, 26);
      locais.push(local, nomeBytes, corpo);

      const extra = Buffer.alloc(zip64 ? 28 : 0);
      if (zip64) {
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(24, 2);
        extra.writeBigUInt64LE(BigInt(dados.length), 4);
        extra.writeBigUInt64LE(BigInt(corpo.length), 12);
        extra.writeBigUInt64LE(BigInt(offset), 20);
      }
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(deflate ? 8 : 0, 10);
      central.writeUInt32LE(zip64 ? 0xffffffff : corpo.length, 20);
      central.writeUInt32LE(zip64 ? 0xffffffff : dados.length, 24);
      central.writeUInt16LE(nomeBytes.length, 28);
      central.writeUInt16LE(extra.length, 30);
      central.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
      centrais.push(central, nomeBytes, extra);
      offset += 30 + nomeBytes.length + corpo.length;
    }
    const diretorio = Buffer.concat(centrais);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(itens.length, 8);
    fim.writeUInt16LE(itens.length, 10);
    fim.writeUInt32LE(diretorio.length, 12);
    fim.writeUInt32LE(offset, 16);
    return Buffer.concat([...locais, diretorio, fim]);
  }

  const grande = Buffer.from('linha de teste do TSE;'.repeat(5000));
  const caminho = join(pasta, 'teste.zip');
  writeFileSync(
    caminho,
    montarZip([
      { nome: 'a.csv', dados: Buffer.from('um;dois\r\n'), deflate: false },
      { nome: 'grande.csv', dados: grande, deflate: true },
      { nome: 'tamanhos64.csv', dados: Buffer.from('zip64\r\n'), deflate: true, zip64: true },
    ]),
  );

  it('lista as entradas', async () => {
    expect((await listarZip(caminho)).map((e) => e.nome)).toEqual(['a.csv', 'grande.csv', 'tamanhos64.csv']);
  });

  it('abre entrada guardada, comprimida e com tamanhos em 64 bits', async () => {
    expect(await ler(await abrirEntrada(caminho, 'a.csv'))).toBe('um;dois\r\n');
    expect(await ler(await abrirEntrada(caminho, 'grande.csv'))).toBe(grande.toString());
    expect(await ler(await abrirEntrada(caminho, 'tamanhos64.csv'))).toBe('zip64\r\n');
  });

  it('entrada que não existe e arquivo que não é zip são erro com o nome do arquivo', async () => {
    await expect(abrirEntrada(caminho, 'nao-existe.csv')).rejects.toThrow(/nao-existe/);
    const texto = join(pasta, 'texto.zip');
    writeFileSync(texto, 'isto não é um zip');
    await expect(listarZip(texto)).rejects.toThrow(/texto\.zip/);
  });
});

const VOTOS_ZONA = ['"NR_TURNO"', '"CD_CARGO"', '"SG_UF"', '"CD_MUNICIPIO"', '"NM_MUNICIPIO"', '"NR_CANDIDATO"', '"QT_VOTOS_NOMINAIS_VALIDOS"', '"DT_GERACAO"', '"HH_GERACAO"'].join(';');
const VOTOS_SECAO = ['"NR_TURNO"', '"CD_CARGO"', '"SG_UF"', '"CD_MUNICIPIO"', '"NM_MUNICIPIO"', '"NR_VOTAVEL"', '"QT_VOTOS"', '"DT_GERACAO"', '"HH_GERACAO"'].join(';');
const linhaVoto = (turno: number, cargo: number, uf: string, cod: number, nome: string, numero: number, votos: number) =>
  `${turno};${cargo};"${uf}";${cod};"${nome}";${numero};${votos};"05/10/2026";"14:03:29"`;

describe('agregar votos', () => {
  const munzona = { turno: 1 as const, votos: { zip: '', entrada: '', formato: 'munzona' as const } };
  const secao = { turno: 1 as const, votos: { zip: '', entrada: '', formato: 'secao' as const }, nulosTecnicos: ['28'] };

  it('soma por município só do presidente e do turno pedido; o código perde os zeros à esquerda', async () => {
    const agregado = agregadoVazio('x');
    await somarVotos(
      csv(
        VOTOS_ZONA,
        linhaVoto(1, 1, 'MA', 9210, 'SÃO LUÍS', 13, 100),
        linhaVoto(1, 1, 'MA', 9210, 'SÃO LUÍS', 13, 50),
        linhaVoto(1, 1, 'MA', 9210, 'SÃO LUÍS', 22, 70),
        linhaVoto(2, 1, 'MA', 9210, 'SÃO LUÍS', 13, 999),
        linhaVoto(1, 3, 'MA', 9210, 'SÃO LUÍS', 13, 999),
      ),
      munzona,
      agregado,
    );
    expect(agregado.municipios['9210']).toMatchObject({ uf: 'MA', nome: 'SÃO LUÍS', votos: { '13': 150, '22': 70 } });
    expect(agregado.atualizado).toBe('2026-10-05T14:03:29-03:00');
  });

  it('por seção, branco (95), nulo (96), anulado em separado (97) e nulo técnico não contam como voto válido', async () => {
    const agregado = agregadoVazio('x');
    await somarVotos(
      csv(
        VOTOS_SECAO,
        linhaVoto(1, 1, 'SP', 71072, 'SÃO PAULO', 13, 10),
        linhaVoto(1, 1, 'SP', 71072, 'SÃO PAULO', 22, 20),
        linhaVoto(1, 1, 'SP', 71072, 'SÃO PAULO', 28, 3),
        linhaVoto(1, 1, 'SP', 71072, 'SÃO PAULO', 95, 4),
        linhaVoto(1, 1, 'SP', 71072, 'SÃO PAULO', 96, 5),
        linhaVoto(1, 1, 'SP', 71072, 'SÃO PAULO', 97, 6),
      ),
      secao,
      agregado,
    );
    expect(agregado.municipios['71072']?.votos).toEqual({ '13': 10, '22': 20 });
  });

  it('quantidade que não é inteiro não negativo é erro', async () => {
    await expect(somarVotos(csv(VOTOS_SECAO, linhaVoto(1, 1, 'SP', 1, 'X', 13, -1)), secao, agregadoVazio('x'))).rejects.toThrow(/votos/);
  });

  it('detalhe soma eleitorado e comparecimento das zonas do município', async () => {
    const agregado = agregadoVazio('x');
    const cabecalho = ['"NR_TURNO"', '"CD_CARGO"', '"SG_UF"', '"CD_MUNICIPIO"', '"NM_MUNICIPIO"', '"QT_APTOS"', '"QT_COMPARECIMENTO"'].join(';');
    await somarDetalhe(
      csv(cabecalho, '1;1;"MA";9210;"SÃO LUÍS";1000;800', '1;1;"MA";9210;"SÃO LUÍS";500;400', '2;1;"MA";9210;"SÃO LUÍS";1;1'),
      { turno: 1 },
      agregado,
    );
    expect(agregado.municipios['9210']).toMatchObject({ aptos: 1500, comparecimento: 1200 });
  });
});

describe('linha da camada', () => {
  it('arredonda como o site do TSE: 2243 de 3189 é 70,34', () => {
    expect(percentual(2243, 3189)).toBe(70.34);
    expect(percentual(1, 8)).toBe(12.5);
    expect(percentual(5, 800)).toBe(0.63);
  });

  it('2º turno: soma exatamente 100, sem "outros" e sem líder de fora', () => {
    expect(calcularLinha({ '13': 60345999, '22': 58206354 }, 13, 22)).toEqual([50.9, 49.1, 0, 0, 100]);
    // 1/800 e 799/800: os dois arredondariam para cima (0,13 e 99,88) e somariam 100,01
    expect(calcularLinha({ '13': 1, '22': 799 }, 13, 22)).toEqual([0.13, 99.87, 0, 0, 100]);
  });

  it('1º turno: A, B e o resto; o líder de fora só aparece quando passa os dois', () => {
    expect(calcularLinha({ '13': 40, '22': 35, '12': 25 }, 13, 22)).toEqual([40, 35, 25, 0, 100]);
    expect(calcularLinha({ '13': 30, '22': 20, '12': 50 }, 13, 22)).toEqual([30, 20, 50, 12, 100]);
    expect(calcularLinha({ '13': 30, '22': 30, '12': 30, '45': 10 }, 13, 22)).toEqual([30, 30, 40, 0, 100]);
  });

  it('em 2018 o B é o 17 e a cor vem do campo, não do número', () => {
    expect(calcularLinha({ '13': 29, '17': 46, '12': 25 }, 13, 17)).toEqual([29, 46, 25, 0, 100]);
  });

  it('sem voto válido não há linha (nada de 0/0 inventado)', () => {
    expect(calcularLinha({}, 13, 22)).toBeNull();
    expect(calcularLinha({ '13': 0, '22': 0 }, 13, 22)).toBeNull();
  });

  it('acumular soma por candidato', () => {
    const total: Record<string, number> = { '13': 1 };
    acumular(total, { '13': 2, '22': 3 });
    expect(total).toEqual({ '13': 3, '22': 3 });
  });

  it('comparecimento em 2 casas', () => {
    expect(comparecimentoPct({ aptos: 156454011, comparecimento: 124252796 })).toBe(79.42);
  });
});

describe('camada e hist', () => {
  const eleicao: Eleicao = {
    id: '2022-t2',
    rotulo: '2º turno 2022',
    turno: 2,
    candidatos: [
      { n: 13, nome: 'Lula', partido: 'PT', cor: '13' },
      { n: 22, nome: 'Jair Bolsonaro', partido: 'PL', cor: '22' },
    ],
    votos: { zip: '', entrada: '', formato: 'munzona' },
    detalhe: { zip: '', entrada: '', formato: 'munzona' },
  };
  const agregado = {
    id: '2022-t2',
    atualizado: '2026-10-04T03:16:54-03:00',
    municipios: {
      '9210': { uf: 'MA', nome: 'SÃO LUÍS', votos: { '13': 60, '22': 40 }, aptos: 200, comparecimento: 150 },
      '71072': { uf: 'SP', nome: 'SÃO PAULO', votos: { '13': 40, '22': 60 }, aptos: 300, comparecimento: 240 },
      '29254': { uf: 'ZZ', nome: 'ABIDJÃ', votos: { '13': 10, '22': 10 }, aptos: 30, comparecimento: 20 },
      '73709': { uf: 'MT', nome: 'BOA ESPERANÇA DO NORTE', votos: {}, aptos: 0, comparecimento: 0 },
    },
  };
  const ibge = new Map([[9210, 2111300], [71072, 3550308], [73709, 5101837]]);
  const camada = montarCamada(eleicao, agregado, ibge);

  it('o Brasil inclui o exterior; as UFs e os municípios não', () => {
    expect(camada.br).toEqual([50, 50, 0, 0, 100]);
    expect(Object.keys(camada.ufs)).toEqual(['MA', 'SP']);
    expect(camada.municipios).toEqual([[2111300, 60, 40, 0, 0, 100], [3550308, 40, 60, 0, 0, 100]]);
  });

  it('município sem voto fica de fora em vez de virar 0/0', () => {
    expect(camada.municipios.some(([codigo]) => codigo === 5101837)).toBe(false);
  });

  it('município com voto e sem código IBGE derruba a geração', () => {
    expect(() => montarCamada(eleicao, agregado, new Map([[9210, 2111300]]))).toThrow(/SÃO PAULO/);
  });

  it('o arquivo tem um município por linha e é lido pelo front sem perder nenhuma linha', () => {
    const texto = serializarCamada(camada);
    expect(texto.trim().split('\n')).toHaveLength(1 + 2 + 1);
    const lida = lerCamada(JSON.parse(texto));
    expect(lida?.municipios.size).toBe(2);
    expect(lida?.candidatos.map((c) => c.cor)).toEqual(['13', '22']);
    expect(lida?.br?.a).toBe(50);
  });

  it('hist: município sem 2022 fica com t2_2022 null', () => {
    const t1 = { votos: { '13': 25, '22': 70, '12': 5 }, aptos: 100, comparecimento: 75 };
    expect(montarHist(undefined, t1)).toEqual({
      t2_2022: null,
      t1_2026: { pct: { '13': 25, '22': 70, outros: 5 }, comparecimento_pct: 75 },
    });
    expect(montarHist({ votos: {}, aptos: 0, comparecimento: 0 }, t1).t2_2022).toBeNull();
    expect(montarHist({ votos: { '13': 51, '22': 49 }, aptos: 200, comparecimento: 100 }, t1).t2_2022).toEqual({
      pct: { '13': 51, '22': 49 },
      comparecimento_pct: 50,
    });
  });

  it('hist sem votos em 2026 é erro', () => {
    expect(() => montarHist(undefined, { votos: {}, aptos: 10, comparecimento: 5 })).toThrow();
  });
});
