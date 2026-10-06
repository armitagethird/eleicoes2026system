// Cor fixa por candidato (decisão do Romero, 06/10): a cor é do número de urna, não da posição.
// Fonte única para o card (SVG autossuficiente precisa do hex) e para os componentes (que usam a variável CSS).
// Os hex espelham --cand-13 e --cand-22 de styles/tokens.css.

const POR_NUMERO: Readonly<Record<number, { hex: string; css: string }>> = {
  13: { hex: '#f2464b', css: 'var(--cand-13)' },
  22: { hex: '#6cc4ff', css: 'var(--cand-22)' },
};

// Governador: números sem cor definida ficam neutros até o Romero decidir (pendência no DIRECTION).
const NEUTRAS = [
  { hex: '#f2eee3', css: 'var(--ink)' },
  { hex: '#8b867a', css: 'var(--ink-2)' },
] as const;

/** Cor do candidato pelo número de urna; `coluna` (0 = esquerda) só decide o tom neutro de quem não tem cor. */
export const corCandidato = (n: number, coluna: 0 | 1): { hex: string; css: string } => POR_NUMERO[n] ?? NEUTRAS[coluna];
