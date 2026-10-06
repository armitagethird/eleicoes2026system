const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Variação vs 2022 do candidato `n`, em pontos. O contrato (variacao2022) aceita só uma das chaves: a do outro candidato
 * é o espelho com sinal trocado, o que o card e o mapa já fazem. Sem nenhuma chave válida, undefined.
 */
export function variacaoDe(variacao: Record<string, number> | undefined, n: number, outro: number): number | undefined {
  const propria = variacao?.[String(n)];
  if (finito(propria)) return propria;
  const doOutro = variacao?.[String(outro)];
  return finito(doOutro) ? -doOutro : undefined;
}
