// O que sobrou de /rankings (as listas viraram o painel de destaques de /apuracao): o DESTINO compacto da lista de cidades
// de uf/[uf].astro, que importa daqui.
import { ajustarDestino } from '../lib/destino.ts';

// Linha de destino compacta: o nome encosta na coluna pelo eixo wdth. A referência é a coluna do nome a 360 px de tela;
// em cqi o ajuste acompanha a coluna, e o teto em px segura o tamanho nas telas largas.
const LARGURA_REF = 232;
const NOME_MIN = 14;

/** font-size e font-stretch do nome (DESTINO compacto): wdth de 62 a 125 primeiro, tamanho só se não couber. */
export function estiloNome(nome: string, tamMax: number): string {
  const [linha] = ajustarDestino(nome.toLocaleUpperCase('pt-BR'), {
    largura: LARGURA_REF,
    tamMax,
    tamMin: NOME_MIN,
    maxLinhas: 1,
  }).linhas;
  const cqi = Math.round((linha.tamanho / LARGURA_REF) * 10_000) / 100;
  return `font-size:min(${tamMax}px,${cqi}cqi);font-stretch:${linha.wdth}%`;
}
