// Peças de /historico que o build (Historico.astro) e a ilha (historico.ts) montam do mesmo jeito, para o HTML do build e o
// redesenho depois de um filtro ou de uma atualização ao vivo saírem idênticos.
import { AGUARDANDO_SECOES, GRAFICO_AO_VIVO, SEM_DADO, aoVivoAPartir, linhaApuracao, rotuloPontoVazio } from '../../lib/copy.ts';
import { LAYOUTS, renderGrafico, type DadosGrafico } from '../../lib/grafico-linha.ts';
import type { AoVivo, Ponto } from '../../lib/serie-historica.ts';
import type { Modo } from '../../lib/status.ts';

/** Um SVG por largura de layout, todos no HTML: o CSS (container query) mostra só o que cabe no quadro, sem JS. */
export function figuraHtml(dados: DadosGrafico, id: string): string {
  return (Object.keys(LAYOUTS) as Array<keyof typeof LAYOUTS>)
    .map((nome) => `<div class="gl-v gl-v-${nome}">${renderGrafico(dados, LAYOUTS[nome], `${id}-${nome}`)}</div>`)
    .join('');
}

/** O que diz o ponto vazio do 2º turno de 2026: o dia (antes da apuração), "ao vivo" (apuração sem leitura ainda) ou "sem dado". */
export const rotuloVazio = (modo: Modo, inicio: string | null | undefined): string =>
  modo === 'pre' ? rotuloPontoVazio(inicio) : modo === 'live' ? GRAFICO_AO_VIVO : SEM_DADO;

/** A linha embaixo do gráfico: quando o 2º turno de 2026 chega, ou a apuração dele. */
export function linhaHistorico(modo: Modo, inicio: string | null | undefined, vivo: AoVivo | null): string {
  if (modo === 'pre') return aoVivoAPartir(inicio);
  return vivo ? linhaApuracao(vivo.fase, vivo.secoesPct, vivo.atualizado) : AGUARDANDO_SECOES;
}

/** A nota do 17 só faz sentido quando o candidato de Bolsonaro mudou de número entre as eleições da série. */
export const mudouDeNumero = (pontos: readonly Ponto[]): boolean => pontos.some((p) => p.b !== null && p.b.cor === '22' && p.b.n !== 22);
