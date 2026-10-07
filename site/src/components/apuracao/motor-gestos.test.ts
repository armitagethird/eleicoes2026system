import { afterEach, describe, expect, it, vi } from 'vitest';
import { ligarGestos, type AlvoGestos } from './motor-gestos.ts';

// Só o que ligarGestos toca no elemento: o mapa é sticky no desktop, então a roda sozinha tem de seguir para a página.
function montar() {
  const ouvintes = new Map<string, (e: never) => void>();
  const el = {
    addEventListener: (tipo: string, fn: (e: never) => void) => ouvintes.set(tipo, fn),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
  };
  const alvo = { zoom: vi.fn(() => true), comecar: vi.fn(), terminar: vi.fn() } as unknown as AlvoGestos;
  const desligar = ligarGestos(el as unknown as HTMLElement, alvo);
  const roda = (opcoes: Partial<WheelEvent>) => {
    const preventDefault = vi.fn();
    (ouvintes.get('wheel') as (e: unknown) => void)({ deltaY: -100, deltaMode: 0, clientX: 200, clientY: 200, ctrlKey: false, metaKey: false, preventDefault, ...opcoes });
    return preventDefault;
  };
  return { alvo, roda, desligar };
}

afterEach(() => vi.unstubAllGlobals());

describe('roda do mapa', () => {
  it('a roda sozinha não dá zoom nem prende a rolagem da página', () => {
    vi.stubGlobal('window', globalThis);
    const { alvo, roda, desligar } = montar();
    const impediu = roda({});
    expect(alvo.zoom).not.toHaveBeenCalled();
    expect(impediu).not.toHaveBeenCalled();
    desligar();
  });

  it('ctrl+roda (a pinça do trackpad) e ⌘+roda dão zoom e seguram a página', () => {
    vi.stubGlobal('window', globalThis);
    const { alvo, roda, desligar } = montar();
    expect(roda({ ctrlKey: true })).toHaveBeenCalledOnce();
    expect(roda({ metaKey: true })).toHaveBeenCalledOnce();
    expect(alvo.zoom).toHaveBeenCalledTimes(2);
    desligar();
  });

  it('no limite do zoom, ctrl+roda volta a ser da página', () => {
    vi.stubGlobal('window', globalThis);
    const { alvo, roda, desligar } = montar();
    vi.mocked(alvo.zoom).mockReturnValue(false);
    expect(roda({ ctrlKey: true })).not.toHaveBeenCalled();
    desligar();
  });
});
