// Leitor mínimo de ZIP em streaming (sem dependência e sem depender de unzip/tar, que variam entre Git Bash e PowerShell).
// Cobre o que o portal do TSE publica: método 8 (deflate) ou 0 (stored), sem criptografia, com tamanhos ZIP64 por entrada.
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_ENTRADA = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;
const TAM_EOCD = 22;
const MAX_COMENTARIO = 0xffff;

export interface EntradaZip {
  nome: string;
  metodo: number;
  tamComprimido: number;
  offsetLocal: number;
}

async function lerBytes(caminho: string, posicao: number, tamanho: number): Promise<Buffer> {
  const arquivo = await open(caminho, 'r');
  try {
    const { buffer, bytesRead } = await arquivo.read(Buffer.alloc(tamanho), 0, tamanho, posicao);
    return buffer.subarray(0, bytesRead);
  } finally {
    await arquivo.close();
  }
}

async function tamanhoDoArquivo(caminho: string): Promise<number> {
  const arquivo = await open(caminho, 'r');
  try {
    return (await arquivo.stat()).size;
  } finally {
    await arquivo.close();
  }
}

export async function listarZip(caminho: string): Promise<EntradaZip[]> {
  const total = await tamanhoDoArquivo(caminho);
  const tamCauda = Math.min(total, TAM_EOCD + MAX_COMENTARIO);
  const cauda = await lerBytes(caminho, total - tamCauda, tamCauda);
  let eocd = -1;
  for (let i = cauda.length - TAM_EOCD; i >= 0; i--) {
    if (cauda.readUInt32LE(i) === ASSINATURA_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${caminho}: não é um ZIP (fim do diretório central não encontrado)`);

  const quantidade = cauda.readUInt16LE(eocd + 10);
  const tamDiretorio = cauda.readUInt32LE(eocd + 12);
  const offsetDiretorio = cauda.readUInt32LE(eocd + 16);
  if (quantidade === 0xffff || tamDiretorio === 0xffffffff || offsetDiretorio === 0xffffffff) {
    throw new Error(`${caminho}: diretório central ZIP64 não suportado`);
  }

  const diretorio = await lerBytes(caminho, offsetDiretorio, tamDiretorio);
  const entradas: EntradaZip[] = [];
  let p = 0;
  for (let i = 0; i < quantidade; i++) {
    if (diretorio.readUInt32LE(p) !== ASSINATURA_ENTRADA) throw new Error(`${caminho}: diretório central corrompido`);
    const metodo = diretorio.readUInt16LE(p + 10);
    let tamComprimido = diretorio.readUInt32LE(p + 20);
    const tamOriginal = diretorio.readUInt32LE(p + 24);
    const tamNome = diretorio.readUInt16LE(p + 28);
    const tamExtra = diretorio.readUInt16LE(p + 30);
    const tamComentario = diretorio.readUInt16LE(p + 32);
    let offsetLocal = diretorio.readUInt32LE(p + 42);
    // Entradas grandes (o CSV de 4 GB de 2018) trazem os tamanhos em 64 bits no campo extra 0x0001, só dos campos que valem 0xFFFFFFFF.
    for (let e = p + 46 + tamNome, fimExtra = e + tamExtra; e + 4 <= fimExtra; e += 4 + diretorio.readUInt16LE(e + 2)) {
      if (diretorio.readUInt16LE(e) !== 0x0001) continue;
      let q = e + 4;
      if (tamOriginal === 0xffffffff) q += 8;
      if (tamComprimido === 0xffffffff) {
        tamComprimido = Number(diretorio.readBigUInt64LE(q));
        q += 8;
      }
      if (offsetLocal === 0xffffffff) offsetLocal = Number(diretorio.readBigUInt64LE(q));
    }
    entradas.push({ nome: diretorio.toString('utf8', p + 46, p + 46 + tamNome), metodo, tamComprimido, offsetLocal });
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return entradas;
}

/** Abre uma entrada do ZIP como fluxo de bytes já descomprimido. */
export async function abrirEntrada(caminho: string, nome: string): Promise<Readable> {
  const entrada = (await listarZip(caminho)).find((e) => e.nome === nome);
  if (!entrada) throw new Error(`${caminho}: entrada ${nome} não existe`);
  if (entrada.metodo !== 0 && entrada.metodo !== 8) throw new Error(`${caminho}: método de compressão ${entrada.metodo} não suportado`);

  const local = await lerBytes(caminho, entrada.offsetLocal, 30);
  if (local.readUInt32LE(0) !== ASSINATURA_LOCAL) throw new Error(`${caminho}: cabeçalho local de ${nome} corrompido`);
  const inicio = entrada.offsetLocal + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);

  const bruto = createReadStream(caminho, { start: inicio, end: inicio + entrada.tamComprimido - 1 });
  if (entrada.metodo === 0) return bruto;
  const saida = bruto.pipe(createInflateRaw());
  bruto.on('error', (erro) => saida.destroy(erro));
  return saida;
}
