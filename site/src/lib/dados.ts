// Dados embutidos no build (não mudam no dia da eleição). Dados ao vivo vêm de /data/* por fetch, não daqui.
import type { Hist, Municipio, UF } from './contratos.ts';
import municipiosJson from '../data/municipios.json';

export const municipios = municipiosJson as Municipio[];

const histCidades = import.meta.glob<Hist>('../data/hist/*.json', { eager: true, import: 'default' });
const histUfs = import.meta.glob<Hist>('../data/hist-uf/*.json', { eager: true, import: 'default' });
const histBrasil = import.meta.glob<Hist>('../data/hist-br.json', { eager: true, import: 'default' });

export const municipio = (slug: string): Municipio | undefined => municipios.find((m) => m.slug === slug);

export const histCidade = (slug: string): Hist | undefined => histCidades[`../data/hist/${slug}.json`];

export const histUf = (uf: UF): Hist | undefined => histUfs[`../data/hist-uf/${uf.toLowerCase()}.json`];

export const histBr = (): Hist | undefined => histBrasil['../data/hist-br.json'];
