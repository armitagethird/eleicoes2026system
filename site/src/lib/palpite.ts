// Palpite (BRIEF, seção 4 e Fase 3): lógica pura. O palpite é LOCAL: fica em localStorage, nunca vai a servidor, nunca vira
// agregado (enquete é proibida no período eleitoral). Este módulo não faz requisição nenhuma.
import { armazenamentoLocal, type Armazenamento } from './armazenamento.ts';

/** O slider vai de 0 a 100 para o 13, em passos de 1; o 22 é o complemento. */
export const PALPITE_MIN = 0;
export const PALPITE_MAX = 100;
export const PALPITE_PASSO = 1;
export const PALPITE_INICIAL = 50;

const chave = (slug: string): string => `palpite:${slug}`;

/** Valor do slider: inteiro entre 0 e 100. Lixo (NaN) volta ao ponto de partida. */
export function limitarPalpite(valor: number): number {
  if (Number.isNaN(valor)) return PALPITE_INICIAL;
  return Math.min(PALPITE_MAX, Math.max(PALPITE_MIN, Math.round(valor)));
}

/** O 22 é o que sobra do 13. */
export const complemento = (pct13: number): number => PALPITE_MAX - pct13;

/** Em final: a distância, em pontos, entre o palpite do 13 e o resultado do 13. */
export const erroEmPontos = (palpite13: number, resultado13: number): number => Math.abs(palpite13 - resultado13);

/** Palpite salvo da cidade, ou null: sem palpite, sem armazenamento ou valor que não é inteiro de 0 a 100. */
export function lerPalpite(slug: string, armazenamento: Armazenamento | null = armazenamentoLocal()): number | null {
  try {
    const bruto = armazenamento?.getItem(chave(slug));
    if (!bruto || !/^\d{1,3}$/.test(bruto)) return null;
    const valor = Number(bruto);
    return valor <= PALPITE_MAX ? valor : null;
  } catch {
    return null;
  }
}

/** Grava o palpite do 13. Devolve false quando não deu para gravar (o card sai igual; só não fica salvo). */
export function gravarPalpite(slug: string, pct13: number, armazenamento: Armazenamento | null = armazenamentoLocal()): boolean {
  try {
    if (!armazenamento) return false;
    armazenamento.setItem(chave(slug), String(pct13));
    return true;
  } catch {
    return false;
  }
}
