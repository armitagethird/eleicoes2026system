import { hora, percentual } from './format.ts';

/**
 * Vocabulário fixo do site (brief, seção 4). Nada de texto de matéria; nenhuma outra palavra de resultado.
 * Proibido em qualquer lugar da interface: "venceu", "virada confirmada", "projeção".
 */
export const PALAVRAS_PROIBIDAS = ['venceu', 'virada confirmada', 'projeção'] as const;

export const AGUARDANDO_SECOES = 'aguardando primeiras seções';

/** "lidera" em parcial; "eleito(a)" SOMENTE quando o JSON traz eleito: true (nunca inferir de percentual). */
export function rotuloPosicao(eleito: boolean, feminino = false): 'lidera' | 'eleito' | 'eleita' {
  if (!eleito) return 'lidera';
  return feminino ? 'eleita' : 'eleito';
}

/** Linha de apuração de todo card: "parcial · 87% das seções · Fonte: TSE · 18:42". */
export function linhaApuracao(
  fase: 'parcial' | 'final',
  secoesPct: number,
  atualizado: string | null | undefined,
): string {
  return `${fase} · ${percentual(secoesPct, 0)} das seções · Fonte: TSE · ${hora(atualizado)}`;
}

/** Falha de rede: o front mantém o último dado e avisa. */
export function semConexao(atualizado: string | null | undefined): string {
  return `sem conexão, mostrando última atualização às ${hora(atualizado)}`;
}
