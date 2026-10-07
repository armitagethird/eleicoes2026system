import { afterEach, describe, expect, it, vi } from 'vitest';
import { armazenamentoLocal } from './armazenamento.ts';

describe('armazenamentoLocal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('devolve o localStorage quando existe', () => {
    const local = { getItem: () => null, setItem: () => undefined };
    vi.stubGlobal('localStorage', local);

    expect(armazenamentoLocal()).toBe(local);
  });

  it('devolve null quando o navegador não tem localStorage', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(armazenamentoLocal()).toBeNull();
  });

  it('devolve null, sem lançar, quando só o acesso já é proibido (modo privado, cookies bloqueados)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Acesso negado', 'SecurityError');
      },
    });
    try {
      expect(armazenamentoLocal()).toBeNull();
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
