// Fotos oficiais de candidatura do TSE para o 13 e o 22 (src/assets/candidatos, geradas por `npm run fotos`; fonte e
// tratamento em src/assets/candidatos/README.md). Só nos placares do site, nunca no card compartilhado.
// Os arquivos disponíveis vêm dos nomes ({n}-{altura}.webp): o diretório é a fonte de verdade, e número sem foto devolve null.

// no-inline: o Vite embute em data: URI o que pesa menos de 4 KB, e as duas fotos pequenas cairiam nisso; como arquivo elas
// ganham cache imutável e saem do HTML. (O Vite só aceita o objeto de opções literal.)
const arquivos = import.meta.glob<string>('../assets/candidatos/*.webp', { eager: true, query: '?url&no-inline', import: 'default' });

// Nome de urna para o alt. Vale só para a eleição de 2026: o 22 de 2022 era Jair Bolsonaro, então quem monta placar de outro
// ano não pede foto. Os números 13 e 22 de governador também são outros candidatos: só presidente pede foto.
const NOMES: Readonly<Record<number, string>> = { 13: 'Lula', 22: 'Flávio Bolsonaro' };

/** Altura da caixa em px CSS (1x). O 2x é o dobro. */
export const ALTURA_FOTO = 56;
/** Largura / altura da caixa; a mesma de scripts/build-fotos.ts (o teste confere contra os arquivos). */
export const RAZAO_FOTO = 4 / 5;

export interface Foto {
  src: string;
  srcset: string;
  width: number;
  height: number;
  alt: string;
}

/** Foto do candidato pelo número de urna na altura pedida (1x e 2x), ou null se não houver (zero quebra). */
export function fotoCandidato(n: number, altura: number = ALTURA_FOTO): Foto | null {
  const um = arquivos[`../assets/candidatos/${n}-${altura}.webp`];
  const dois = arquivos[`../assets/candidatos/${n}-${altura * 2}.webp`];
  if (!NOMES[n] || !um || !dois) return null;
  return {
    src: um,
    srcset: `${um} 1x, ${dois} 2x`,
    width: Math.round(altura * RAZAO_FOTO),
    height: altura,
    alt: `Foto oficial de ${NOMES[n]} (TSE)`,
  };
}
