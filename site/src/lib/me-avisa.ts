// Lógica pura do "Me avisa" (ilha: components/me-avisa.ts). O e-mail é dado pessoal (LGPD): coleta mínima, nada em query string,
// e o aparelho guarda só "já pedi aviso para esta cidade" (o slug), nunca o e-mail. A validação daqui é conforto de quem digita;
// o servidor valida de novo, porque nada vindo do navegador é confiável.
import type { FlagMeAvisa } from './flags.ts';
import type { Armazenamento } from './minhas-cidades.ts';

export type MotivoEmail = 'vazio' | 'invalido';

export type ResultadoEmail = { ok: true; email: string } | { ok: false; motivo: MotivoEmail };

// Pontos só entre trechos (sem ponto no começo, no fim nem duplo), sem espaço, sem outra arroba, sem caractere de controle
// (a quebra de linha é a porta da injeção de cabeçalho no envio) e TLD de 2+ letras. Não tenta cobrir toda a RFC 5322.
const TRECHO = '[^\\s@.\\p{Cc}]';
const EMAIL = new RegExp(`^${TRECHO}+(?:\\.${TRECHO}+)*@${TRECHO}+(?:\\.${TRECHO}+)*\\.${TRECHO}{2,}$`, 'u');
const EMAIL_TAMANHO_MAXIMO = 254;

export function validarEmail(bruto: string): ResultadoEmail {
  const email = bruto.trim();
  if (email === '') return { ok: false, motivo: 'vazio' };
  return email.length <= EMAIL_TAMANHO_MAXIMO && EMAIL.test(email) ? { ok: true, email } : { ok: false, motivo: 'invalido' };
}

export interface EntradaFormulario {
  email: string;
  consentimento: boolean;
  /** Campo isca, escondido de gente e à vista de robô: preenchido, a entrada é descartada. */
  isca: string;
  /** Slug da cidade (vem do HTML do build, não do usuário). */
  cidade: string;
}

/** O que vai para o servidor, e só isto, nesta ordem. O servidor guarda a hora do aceite. */
export interface PedidoAviso {
  email: string;
  cidade: string;
  consentimento: true;
}

export type ResultadoFormulario =
  | { tipo: 'enviar'; pedido: PedidoAviso }
  /** Isca preenchida: a tela finge sucesso e nada sai do navegador, para o robô não descobrir o que o denunciou. */
  | { tipo: 'robo' }
  | { tipo: 'invalido'; erros: { email?: MotivoEmail; consentimento?: true } };

export function interpretarFormulario({ email, consentimento, isca, cidade }: EntradaFormulario): ResultadoFormulario {
  if (isca.trim() !== '') return { tipo: 'robo' };
  const validado = validarEmail(email);
  if (validado.ok && consentimento) return { tipo: 'enviar', pedido: { email: validado.email, cidade, consentimento: true } };
  return {
    tipo: 'invalido',
    erros: { ...(validado.ok ? {} : { email: validado.motivo }), ...(consentimento ? {} : { consentimento: true as const }) },
  };
}

/** https, ou um caminho do próprio site. Fora disso (http, javascript:, //host, senha na URL, vazio) o e-mail não sai. */
export function endpointSeguro(endpoint: string): boolean {
  if (/^\/(?![/\\])[^\s\\]*$/.test(endpoint)) return true;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** O formulário só renderiza com o flag ligado E um endpoint seguro: ligado sem destino coletaria e-mail para lugar nenhum. */
export const meAvisaDisponivel = ({ ativo, endpoint }: FlagMeAvisa): boolean => ativo && endpointSeguro(endpoint);

export const CHAVE_ME_AVISA = 'me-avisa';
const LIMITE_PEDIDOS = 50;

function lerPedidos(armazenamento: Armazenamento | null): string[] {
  try {
    const bruto: unknown = JSON.parse(armazenamento?.getItem(CHAVE_ME_AVISA) || 'null');
    return Array.isArray(bruto) ? bruto.filter((slug): slug is string => typeof slug === 'string') : [];
  } catch {
    return [];
  }
}

export const jaPediuAviso = (armazenamento: Armazenamento | null, slug: string): boolean => lerPedidos(armazenamento).includes(slug);

/** Marca "já pedi aviso" para a cidade (só o slug). false quando o navegador recusa gravar. */
export function registrarPedido(armazenamento: Armazenamento | null, slug: string): boolean {
  try {
    if (!armazenamento) return false;
    armazenamento.setItem(CHAVE_ME_AVISA, JSON.stringify([slug, ...lerPedidos(armazenamento).filter((s) => s !== slug)].slice(0, LIMITE_PEDIDOS)));
    return true;
  } catch {
    return false;
  }
}
