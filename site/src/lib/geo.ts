import type { EntradaIndice, ResultadoBusca } from './busca.ts';

const PARA_RADIANOS = Math.PI / 180;

/** Termo "hav" da fórmula de haversine; cresce com a distância na esfera, então basta para comparar sem converter em km. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * PARA_RADIANOS;
  const dLon = (lon2 - lon1) * PARA_RADIANOS;
  return Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * PARA_RADIANOS) * Math.cos(lat2 * PARA_RADIANOS) * Math.sin(dLon / 2) ** 2;
}

/** Cidade do índice mais próxima da posição; null se o índice está vazio ou a coordenada não é um número finito. */
export function maisProxima(indice: EntradaIndice[], lat: number, lon: number): ResultadoBusca | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let melhor: EntradaIndice | null = null;
  let menor = Infinity;
  for (const entrada of indice) {
    const distancia = haversine(lat, lon, entrada[3], entrada[4]);
    if (distancia < menor) {
      menor = distancia;
      melhor = entrada;
    }
  }
  return melhor && { slug: melhor[0], nome: melhor[1], uf: melhor[2], eleitores: melhor[5] };
}
