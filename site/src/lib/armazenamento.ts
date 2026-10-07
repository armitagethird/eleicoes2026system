// O localStorage com cuidado: só o acesso já pode lançar (modo privado, cookies bloqueados). O site inteiro pede o armazenamento
// aqui e trata null, em vez de cada ilha repetir o try/catch.

/** O pedaço do Storage que o site usa: o localStorage de verdade ou um falso nos testes. */
export type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage, ou null quando não existe ou nem o acesso é permitido. */
export function armazenamentoLocal(): Armazenamento | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
