// Índice de busca e de geolocalização, servido em /busca.json e lido por lib/busca.ts e lib/geo.ts.
// Importa o JSON direto (e não lib/dados.ts) para não puxar os 5.571 hist/*.json para este endpoint.
import type { APIRoute } from 'astro';
import type { EntradaIndice } from '../lib/busca.ts';
import type { Municipio } from '../lib/contratos.ts';
import municipiosJson from '../data/municipios.json';

// 2 casas (~1 km) bastam para achar a sede mais próxima e tiram ~20% do gzip do índice (5.571 linhas).
const grau = (valor: number) => Math.round(valor * 100) / 100;

const indice: EntradaIndice[] = (municipiosJson as Municipio[])
  .map((m): EntradaIndice => [m.slug, m.nome, m.uf, grau(m.lat), grau(m.lon), m.eleitores])
  .sort((a, b) => b[5] - a[5] || a[0].localeCompare(b[0]));

export const GET: APIRoute = () => Response.json(indice);
