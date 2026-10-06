/**
 * Formatação pt-BR. Regras (testadas em format.test.ts):
 * - milhar com ponto, decimal com vírgula; negativo com o sinal de menos tipográfico (U+2212, presente no subset das fontes);
 * - percentual: 1 casa fixa, sempre (largura estável nos números que atualizam: "0,0%", "61,3%", "100,0%");
 * - arredondamento: metade para longe do zero (0,05 -> 0,1);
 * - pontos percentuais: sinal explícito, 1 casa; singular quando o valor ARREDONDADO, em módulo, é <= 1
 *   ("+0,1 ponto", "+1,0 ponto", "+1,1 pontos"); zero e o que arredonda para zero ficam sem sinal ("0,0 ponto");
 * - votos: singular só para exatamente 1 ("1 voto", "0 votos").
 */

const MENOS = '−';
const SEM_HORA = '--:--';

const formatadores = new Map<string, Intl.NumberFormat>();

function formatador(casas: number, sinal: 'negative' | 'exceptZero'): Intl.NumberFormat {
  const chave = `${casas}${sinal}`;
  let f = formatadores.get(chave);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
      useGrouping: 'always',
      signDisplay: sinal,
    });
    formatadores.set(chave, f);
  }
  return f;
}

const comMenosTipografico = (texto: string): string => texto.replace('-', MENOS);

export function numero(n: number): string {
  return comMenosTipografico(formatador(0, 'negative').format(n));
}

export function percentual(n: number, casas = 1): string {
  return `${comMenosTipografico(formatador(casas, 'negative').format(n))}%`;
}

export function pontos(n: number): string {
  const singular = /^(0,\d|1,0)$/.test(formatador(1, 'negative').format(Math.abs(n)));
  return `${comMenosTipografico(formatador(1, 'exceptZero').format(n))} ${singular ? 'ponto' : 'pontos'}`;
}

export function votos(n: number): string {
  return `${numero(n)} ${n === 1 ? 'voto' : 'votos'}`;
}

const horaBrasilia = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** HH:MM em America/Sao_Paulo. Entrada ausente ou inválida devolve "--:--" (o front tolera campos ausentes). */
export function hora(valor: string | Date | null | undefined): string {
  if (!valor) return SEM_HORA;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? SEM_HORA : horaBrasilia.format(data);
}

/**
 * Tempo até `alvo` em dias, horas e minutos. O minuto arredonda para cima (faltando 30 s, ainda falta "1 min"), para a
 * contagem só chegar a zero no instante do alvo. Depois dele fica em zero; alvo ausente ou inválido devolve null.
 */
export function contagem(alvo: string | null | undefined, agora: Date): { d: number; h: number; min: number } | null {
  const fim = alvo ? new Date(alvo).getTime() : Number.NaN;
  if (Number.isNaN(fim)) return null;
  const minutos = Math.max(0, Math.ceil((fim - agora.getTime()) / 60_000));
  return { d: Math.floor(minutos / 1440), h: Math.floor(minutos / 60) % 24, min: minutos % 60 };
}

const diaBrasilia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long' });

/** "25 de outubro" em America/Sao_Paulo. Entrada ausente ou inválida devolve "". */
export function diaMes(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : diaBrasilia.format(data);
}

/** Hora como se fala, em America/Sao_Paulo: "17h" e "17h30". Entrada ausente ou inválida devolve "". */
export function horaCurta(valor: string | Date | null | undefined): string {
  const [h, min] = hora(valor).split(':');
  if (h === '--') return '';
  return `${Number(h)}h${min === '00' ? '' : min}`;
}
