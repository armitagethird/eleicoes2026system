// Série de uma UF e de todas as cidades dela (por slug) para o filtro de /historico: um arquivo por UF, escrito no build a
// partir das camadas. Importa municipios.json direto (e não lib/dados.ts) para não puxar os 5.571 hist/*.json.
import type { APIRoute, GetStaticPaths } from 'astro';
import { camadasHistoricas } from '../../components/historico/camadas-build.ts';
import { UFS, type Municipio, type UF } from '../../lib/contratos.ts';
import { serieJsonUf } from '../../lib/serie-historica.ts';
import municipiosJson from '../../data/municipios.json';

export const getStaticPaths = (() => UFS.map((uf) => ({ params: { uf: uf.toLowerCase() }, props: { uf } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ uf: UF }> = ({ props }) => Response.json(serieJsonUf(camadasHistoricas(), municipiosJson as Municipio[], props.uf));
