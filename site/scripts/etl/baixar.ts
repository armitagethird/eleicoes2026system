// Baixa as fontes para site/.builds/etl-cache e registra a procedência (tamanho, SHA-256, ETag e Last-Modified do servidor)
// em src/data/fontes.json. Um arquivo é baixado de novo quando o ETag do servidor mudou: os arquivos de 2026 do TSE são
// regerados enquanto a apuração é conferida.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { CACHE, DIR_DADOS, FONTES, type Fonte } from './fontes.ts';

export interface Procedencia {
  arquivo: string;
  url: string;
  uso: string;
  bytes: number;
  sha256: string;
  /** Contagem de municípios que a fonte lista (só fontes em JSON). */
  municipios: number | null;
  etag: string | null;
  last_modified: string | null;
}

const CAMINHO_PROCEDENCIA = join(DIR_DADOS, 'fontes.json');

async function sha256(caminho: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(caminho), hash);
  return hash.digest('hex');
}

/** Cabeçalhos do servidor via GET com Range (o HEAD do CDN do TSE às vezes devolve Content-Length errado). `total` é null quando o servidor ignora Range. */
async function cabecalhos(url: string): Promise<{ etag: string | null; lastModified: string | null; total: number | null }> {
  const resposta = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  await resposta.body?.cancel();
  if (!resposta.ok) throw new Error(`${url}: HTTP ${resposta.status}`);
  const total = /\/(\d+)$/.exec(resposta.headers.get('content-range') ?? '')?.[1];
  return { etag: resposta.headers.get('etag'), lastModified: resposta.headers.get('last-modified'), total: total ? Number(total) : null };
}

async function baixarArquivo(url: string, destino: string): Promise<void> {
  const resposta = await fetch(url);
  if (!resposta.ok || !resposta.body) throw new Error(`${url}: HTTP ${resposta.status}`);
  const parcial = `${destino}.parte`;
  await pipeline(Readable.fromWeb(resposta.body as ReadableStream), createWriteStream(parcial));
  await rename(parcial, destino);
}

async function procedenciaAnterior(): Promise<Map<string, Procedencia>> {
  if (!existsSync(CAMINHO_PROCEDENCIA)) return new Map();
  const lista = JSON.parse(await readFile(CAMINHO_PROCEDENCIA, 'utf8')) as Procedencia[];
  return new Map(lista.map((p) => [p.arquivo, p]));
}

async function obter(fonte: Fonte, anterior: Procedencia | undefined): Promise<Procedencia> {
  const destino = join(CACHE, fonte.arquivo);
  const servidor = await cabecalhos(fonte.url);
  // Sem Content-Range (API em JSON) baixa sempre; com ele, o arquivo local vale se tem o tamanho do servidor e o mesmo ETag da última vez.
  const atual =
    existsSync(destino) &&
    servidor.total !== null &&
    (await stat(destino)).size === servidor.total &&
    (anterior === undefined || anterior.etag === servidor.etag);
  if (!atual) {
    console.log(`baixando ${fonte.arquivo}`);
    await baixarArquivo(fonte.url, destino);
  }
  return {
    arquivo: fonte.arquivo,
    url: fonte.url,
    uso: fonte.uso,
    bytes: (await stat(destino)).size,
    sha256: atual && anterior ? anterior.sha256 : await sha256(destino),
    municipios: fonte.municipios ? fonte.municipios(JSON.parse(await readFile(destino, 'utf8')) as never) : null,
    etag: servidor.etag,
    last_modified: servidor.lastModified,
  };
}

export async function baixar(): Promise<void> {
  await mkdir(CACHE, { recursive: true });
  const anteriores = await procedenciaAnterior();
  const procedencias: Procedencia[] = [];
  for (const fonte of FONTES) procedencias.push(await obter(fonte, anteriores.get(fonte.arquivo)));
  await writeFile(CAMINHO_PROCEDENCIA, `${JSON.stringify(procedencias, null, 2)}\n`);
  console.log(`${procedencias.length} fontes em ${CACHE}; procedência em src/data/fontes.json`);
}
