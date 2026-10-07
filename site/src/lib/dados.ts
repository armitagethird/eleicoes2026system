// Dados embutidos no build (não mudam no dia da eleição). Dados ao vivo vêm de /data/* por fetch, não daqui.
// Só código de servidor (páginas e componentes .astro) importa este módulo: ele lê o disco.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Hist, Municipio, UF } from './contratos.ts';
import municipiosJson from '../data/municipios.json';

export const municipios = municipiosJson as Municipio[];

const histUfs = import.meta.glob<Hist>('../data/hist-uf/*.json', { eager: true, import: 'default' });
const histBrasil = import.meta.glob<Hist>('../data/hist-br.json', { eager: true, import: 'default' });

// O histórico das 5.571 cidades é lido sob demanda, um arquivo por página: importar todos de uma vez (glob eager)
// estoura o limite de arquivos abertos do dev server no Windows (EMFILE). O build e o dev rodam com cwd em /site.
const DIR_HIST = join(process.cwd(), 'src', 'data', 'hist');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const cache = new Map<string, Hist | undefined>();

export function histCidade(slug: string): Hist | undefined {
  if (!SLUG.test(slug)) return undefined;
  if (!cache.has(slug)) {
    try {
      cache.set(slug, JSON.parse(readFileSync(join(DIR_HIST, `${slug}.json`), 'utf8')) as Hist);
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') throw erro;
      cache.set(slug, undefined);
    }
  }
  return cache.get(slug);
}

export const histUf = (uf: UF): Hist | undefined => histUfs[`../data/hist-uf/${uf.toLowerCase()}.json`];

export const histBr = (): Hist | undefined => histBrasil['../data/hist-br.json'];
