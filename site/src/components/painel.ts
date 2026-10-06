// Ilha do Painel (modo pre): contagem regressiva até status.inicio, recalculada no cliente e virada a cada minuto.
import { contagemFalada } from '../lib/copy.ts';
import { atualizarFlap, montarFlap } from '../lib/flap.ts';
import { contagem } from '../lib/format.ts';

const UNIDADES = ['min', 'h', 'd'] as const; // da direita para a esquerda, como a placa vira
const PASSO_ENTRADA_MS = 120;

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

function iniciar(painel: HTMLElement): void {
  const placas = UNIDADES.map((u) => painel.querySelector<HTMLElement>(`[data-painel-unidade="${u}"]`)).filter(
    (p): p is HTMLElement => p !== null,
  );
  const falado = painel.querySelector<HTMLElement>('[data-painel-falado]');
  if (!falado || placas.length !== UNIDADES.length) return;
  for (const placa of placas) montarFlap(placa);

  // Na entrada as placas saem de "--" (nenhum número), então dá para escalonar os grupos da direita para a esquerda
  // sem nunca compor um valor falso. Depois disso, os grupos viram juntos.
  const atualizar = (entrada: boolean): void => {
    const c = contagem(painel.dataset.inicio, new Date());
    if (!c) return;
    const valores = [c.min, c.h, c.d];
    placas.forEach((placa, i) => {
      const virar = () => atualizarFlap(placa, doisDigitos(valores[i]));
      if (entrada) setTimeout(virar, i * PASSO_ENTRADA_MS);
      else virar();
    });
    falado.textContent = contagemFalada(c);
  };

  // Acorda logo depois da virada do minuto (o alvo cai em minuto cheio, então a contagem muda junto com o relógio).
  const agendar = (): void => {
    setTimeout(() => {
      atualizar(false);
      agendar();
    }, 60_000 - (Date.now() % 60_000) + 50);
  };

  atualizar(true);
  agendar();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizar(false);
  });
}

for (const painel of document.querySelectorAll<HTMLElement>('[data-painel]')) iniciar(painel);
