// Só no build (importa node:fs): lê as camadas históricas de public/mapa, que o ETL gera (npm run etl). O astro build roda
// em /site, como em components/apuracao/Apuracao.astro. Uma leitura por processo de build, para os 28 JSON e a página.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerCamada, type Camada } from '../../lib/camada-mapa.ts';
import { IDS_HIST, type IdHist } from '../../lib/serie-historica.ts';

let lidas: Record<IdHist, Camada> | null = null;

export function camadasHistoricas(): Record<IdHist, Camada> {
  lidas ??= Object.fromEntries(
    IDS_HIST.map((id) => {
      const arquivo = join(process.cwd(), 'public', 'mapa', `${id}.json`);
      const camada = lerCamada(JSON.parse(readFileSync(arquivo, 'utf8')));
      if (!camada) throw new Error(`/historico: ${arquivo} não tem o formato de camada (rode npm run etl)`);
      return [id, camada];
    }),
  ) as Record<IdHist, Camada>;
  return lidas;
}
