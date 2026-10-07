// CSV do TSE: separador ';', texto entre aspas duplas (aspas internas dobradas), codificação Latin-1, fim de linha CRLF.
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

export function dividirLinha(linha: string): string[] {
  const campos: string[] = [];
  const n = linha.length;
  let i = 0;
  while (i <= n) {
    if (linha[i] === '"') {
      let fim = i + 1;
      for (;;) {
        fim = linha.indexOf('"', fim);
        if (fim < 0) throw new Error(`aspas não fechadas: ${linha.slice(i, i + 60)}`);
        if (linha[fim + 1] !== '"') break;
        fim += 2;
      }
      campos.push(linha.slice(i + 1, fim).replaceAll('""', '"'));
      i = fim + 2;
    } else {
      const fim = linha.indexOf(';', i);
      campos.push(linha.slice(i, fim < 0 ? n : fim));
      i = (fim < 0 ? n : fim) + 1;
    }
  }
  return campos;
}

/** Linhas do CSV só com as colunas pedidas, na ordem em que foram pedidas. Falha se faltar alguma coluna. */
export async function* registros(entrada: Readable, colunas: readonly string[]): AsyncGenerator<string[]> {
  entrada.setEncoding('latin1');
  let indices: number[] | null = null;
  for await (const linha of createInterface({ input: entrada, crlfDelay: Infinity })) {
    if (linha === '') continue;
    const campos = dividirLinha(linha);
    if (!indices) {
      const faltam = colunas.filter((c) => !campos.includes(c));
      if (faltam.length > 0) throw new Error(`colunas ausentes no CSV: ${faltam.join(', ')}`);
      indices = colunas.map((c) => campos.indexOf(c));
      continue;
    }
    yield indices.map((i) => campos[i]);
  }
}
