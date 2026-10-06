/** Slug de município: `nome-uf` sem acento, minúsculo, hífens; apóstrofo é removido ("d'Oeste" -> "doeste"). */
export function slugMunicipio(nome: string, uf: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’´`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${uf.toLowerCase()}`;
}
