// Índice dos municípios da /apuracao: código IBGE -> slug, nome, UF e eleitores, gerado no build a partir de municipios.json.
// Liga o polígono do mapa (IBGE) à página da cidade (slug) e alimenta a busca (lib/busca.ts ordena por eleitores).
// Importa o JSON direto (e não lib/dados.ts) para não puxar os 5.571 hist/*.json para este endpoint.
import type { APIRoute } from 'astro';
import { linhasIndice } from '../../lib/apuracao-dados.ts';
import type { Municipio } from '../../lib/contratos.ts';
import municipiosJson from '../../data/municipios.json';

export const GET: APIRoute = () => Response.json(linhasIndice(municipiosJson as Municipio[]));
