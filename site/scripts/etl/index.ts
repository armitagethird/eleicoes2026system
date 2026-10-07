// ETL dos dados reais do TSE e do IBGE. Uso: node scripts/etl/index.ts [baixar|agregar|municipios|gerar|tudo]
import { agregar } from './agregar.ts';
import { baixar } from './baixar.ts';
import { gerar } from './gerar.ts';
import { gerarMunicipios } from './municipios.ts';

const passos = { baixar, agregar, municipios: gerarMunicipios, gerar };

const pedido = process.argv[2] ?? 'tudo';
if (pedido === 'tudo') {
  for (const passo of Object.values(passos)) await passo();
} else if (pedido in passos) {
  await passos[pedido as keyof typeof passos]();
} else {
  throw new Error(`passo desconhecido "${pedido}"; use ${[...Object.keys(passos), 'tudo'].join(', ')}`);
}
