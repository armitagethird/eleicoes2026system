// Soma os CSV do TSE por município (código do TSE) e grava um agregado por eleição em CACHE/agregado/{id}.json.
// Só presidente. Voto válido = voto em candidato (branco e nulo ficam de fora), como no relatório de totalização.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { registros } from './csv.ts';
import { CACHE, ELEICOES, type Eleicao } from './fontes.ts';
import { abrirEntrada } from './zip.ts';

export interface AgregadoMunicipio {
  uf: string;
  nome: string;
  /** Votos válidos por número de urna. */
  votos: Record<string, number>;
  aptos: number;
  comparecimento: number;
}

export interface Agregado {
  id: string;
  /** Data e hora de geração do arquivo no TSE (horário de Brasília). */
  atualizado: string;
  /** Chave: código do município no TSE, sem zeros à esquerda. Exterior tem uf "ZZ". */
  municipios: Record<string, AgregadoMunicipio>;
}

const PRESIDENTE = '1';
// Na votação por seção, branco (95), nulo (96) e anulado apurado em separado (97) vêm como "votável"; no por zona só há candidato.
const NAO_CANDIDATO = new Set(['95', '96', '97']);

export const agregadoVazio = (id: string): Agregado => ({ id, atualizado: '', municipios: {} });

const quantidade = (texto: string, coluna: string): number => {
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${coluna} inválida: "${texto}"`);
  return n;
};

function municipioDe(agregado: Agregado, codigo: string, uf: string, nome: string): AgregadoMunicipio {
  const chave = String(Number(codigo));
  return (agregado.municipios[chave] ??= { uf, nome, votos: {}, aptos: 0, comparecimento: 0 });
}

/** "05/10/2026" + "14:03:29" -> "2026-10-05T14:03:29-03:00". */
const isoBrasilia = (data: string, hora: string): string => {
  const [dia, mes, ano] = data.split('/');
  return `${ano}-${mes}-${dia}T${hora}-03:00`;
};

export async function somarVotos(entrada: Readable, eleicao: Pick<Eleicao, 'turno' | 'votos' | 'nulosTecnicos'>, agregado: Agregado): Promise<void> {
  const secao = eleicao.votos.formato === 'secao';
  const colunas = ['NR_TURNO', 'CD_CARGO', 'SG_UF', 'CD_MUNICIPIO', 'NM_MUNICIPIO', secao ? 'NR_VOTAVEL' : 'NR_CANDIDATO', secao ? 'QT_VOTOS' : 'QT_VOTOS_NOMINAIS_VALIDOS', 'DT_GERACAO', 'HH_GERACAO'];
  const fora = new Set([...(secao ? NAO_CANDIDATO : []), ...(eleicao.nulosTecnicos ?? [])]);
  for await (const [turno, cargo, uf, codigo, nome, numero, votos, data, hora] of registros(entrada, colunas)) {
    if (turno !== String(eleicao.turno) || cargo !== PRESIDENTE || fora.has(numero)) continue;
    agregado.atualizado ||= isoBrasilia(data, hora);
    const m = municipioDe(agregado, codigo, uf, nome);
    m.votos[numero] = (m.votos[numero] ?? 0) + quantidade(votos, 'votos');
  }
}

export async function somarDetalhe(entrada: Readable, eleicao: Pick<Eleicao, 'turno'>, agregado: Agregado): Promise<void> {
  const colunas = ['NR_TURNO', 'CD_CARGO', 'SG_UF', 'CD_MUNICIPIO', 'NM_MUNICIPIO', 'QT_APTOS', 'QT_COMPARECIMENTO'];
  for await (const [turno, cargo, uf, codigo, nome, aptos, comparecimento] of registros(entrada, colunas)) {
    if (turno !== String(eleicao.turno) || cargo !== PRESIDENTE) continue;
    const m = municipioDe(agregado, codigo, uf, nome);
    m.aptos += quantidade(aptos, 'aptos');
    m.comparecimento += quantidade(comparecimento, 'comparecimento');
  }
}

export const caminhoAgregado = (id: string): string => join(CACHE, 'agregado', `${id}.json`);

export async function agregar(): Promise<void> {
  await mkdir(join(CACHE, 'agregado'), { recursive: true });
  for (const eleicao of ELEICOES) {
    const agregado = agregadoVazio(eleicao.id);
    await somarVotos(await abrirEntrada(join(CACHE, eleicao.votos.zip), eleicao.votos.entrada), eleicao, agregado);
    await somarDetalhe(await abrirEntrada(join(CACHE, eleicao.detalhe.zip), eleicao.detalhe.entrada), eleicao, agregado);
    await writeFile(caminhoAgregado(eleicao.id), `${JSON.stringify(agregado)}\n`);
    const lista = Object.values(agregado.municipios);
    const validos = lista.reduce((soma, m) => soma + Object.values(m.votos).reduce((a, b) => a + b, 0), 0);
    console.log(`${eleicao.id}: ${lista.length} municípios (com Exterior), ${validos} votos válidos, gerado no TSE em ${agregado.atualizado}`);
  }
}
