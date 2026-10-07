// Série do Brasil para o gráfico de /historico: [A, B, outros] de cada eleição, escrita no build a partir das camadas.
import type { APIRoute } from 'astro';
import { camadasHistoricas } from '../../components/historico/camadas-build.ts';
import { serieJsonBrasil } from '../../lib/serie-historica.ts';

export const GET: APIRoute = () => Response.json(serieJsonBrasil(camadasHistoricas()));
