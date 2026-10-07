// A falha ao gerar ou compartilhar o card: o detalhe técnico vai para o console (é de quem mantém o site) e a tela diz só o que a
// pessoa pode fazer (copy.CARD_FALHOU), nunca a mensagem crua do navegador.
import { CARD_FALHOU } from '../lib/copy.ts';

export function avisarFalha(lugar: Element, erro: unknown): void {
  console.error('Falha ao gerar o card:', erro);
  lugar.textContent = CARD_FALHOU;
}
