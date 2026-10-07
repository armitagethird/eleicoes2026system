// A parte da lógica ao vivo que o carregador (components/AoVivoCarga.astro) usa em TODA página pre: o nome do evento de modo, o
// que anunciar e quando conferir o status.json de novo. Fica à parte de ao-vivo.ts (que puxa vocabulário e formatação) para o
// carregador não custar mais que uns poucos bytes. ao-vivo.ts reexporta tudo daqui.
import type { Modo } from './status.ts';

/**
 * Evento que diz o modo à página: document.dispatchEvent(new CustomEvent(EVENTO_MODO, { detail: { modo } })), na primeira leitura
 * de status.json e a cada mudança. É o contrato com as outras ilhas (o Palpite escuta); quem não o recebe lê status.json sozinho.
 */
export const EVENTO_MODO = 'aovivo:modo';

/** O modo a anunciar no evento: o lido, na primeira leitura (anunciado = null) e a cada mudança; senão null (nada a dizer). */
export function modoParaAnunciar(anunciado: Modo | null, lido: Modo): Modo | null {
  return lido === anunciado ? null : lido;
}

const ANTES_DO_INICIO_MS = 5 * 60_000;
const UM_MINUTO_MS = 60_000;
const UM_DIA_MS = 24 * 3_600_000;
const ESPALHA_PRE_MS = 30_000;

/**
 * Em pre, quando conferir o status.json de novo (a apuração começa sem recarregar a página). Longe do início, só 5 minutos antes
 * dele (no máximo 24 h, o limite do setTimeout); daí em diante, a cada minuto. O jitter espalha quem acordou junto.
 */
export function esperaPre(inicio: string | null, agora: number, aleatorio: () => number = Math.random): number | null {
  const fim = inicio === null ? Number.NaN : Date.parse(inicio);
  if (Number.isNaN(fim)) return null;
  const falta = fim - agora;
  const base = falta > ANTES_DO_INICIO_MS ? Math.min(falta - ANTES_DO_INICIO_MS, UM_DIA_MS) : UM_MINUTO_MS;
  return base + aleatorio() * ESPALHA_PRE_MS;
}
