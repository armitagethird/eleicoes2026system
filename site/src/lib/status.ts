export type Modo = 'pre' | 'live' | 'final';

export interface Status {
  v: number;
  modo: Modo;
  inicio: string | null;
  atualizado: string | null;
}

const MODOS: readonly string[] = ['pre', 'live', 'final'];

const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor !== '' ? valor : null);

/**
 * Lê status.json sem lançar: o front tolera campos ausentes. Modo desconhecido vira 'pre'
 * (o modo que não afirma nenhum resultado).
 */
export function parseStatus(bruto: unknown): Status {
  const o = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const modo = typeof o.modo === 'string' && MODOS.includes(o.modo) ? (o.modo as Modo) : 'pre';
  return {
    v: typeof o.v === 'number' ? o.v : 1,
    modo,
    inicio: texto(o.inicio),
    atualizado: texto(o.atualizado),
  };
}
