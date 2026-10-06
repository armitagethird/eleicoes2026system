// Monta o CardData (components/Card.ts) a partir dos contratos. Domínio e @ vêm de lib/site.ts, nunca de componente.
import type { CandidatoCard, CardData, ModoCard } from '../components/Card.ts';
import { SELO_VIROU, seloDoRanking } from './copy.ts';
import type { Candidato, CargoCidade, CargoPlacar, Cidade, Hist, Selo, UF } from './contratos.ts';
import { hora } from './format.ts';
import { SITE_URL, X_HANDLE } from './site.ts';

type Cargo = CardData['cargo'];

const DOMINIO = new URL(SITE_URL).host;

// Um selo por card, do mais raro para o mais comum.
const PRIORIDADE_SELOS: Selo[] = ['maior_virada_br', 'maior_virada_uf', 'mais_dividida_br', 'mais_dividida_uf', 'mais_unanime_br'];

function candidatos(cand: Candidato[] | undefined): [CandidatoCard, CandidatoCard] | null {
  if (!cand || cand.length < 2) return null;
  const [a, b] = [...cand]
    .sort((x, y) => x.n - y.n)
    .slice(0, 2)
    .map(({ n, nome, partido, pct, eleito }) => ({ n, nome, partido, pct, eleito }));
  return [a, b];
}

/** Variação do 13 vs 2022; o contrato traz a dos dois candidatos, e o card precisa de só uma (a outra é o oposto). */
function variacaoDoPrimeiro(cargo: CargoCidade | CargoPlacar, cand: [CandidatoCard, CandidatoCard]): number | undefined {
  const [primeiro, segundo] = cand;
  const v = cargo.variacao_2022 ?? {};
  if (v[primeiro.n] !== undefined) return v[primeiro.n];
  return v[segundo.n] === undefined ? undefined : -v[segundo.n];
}

function seloDa(cidade: Cidade): string | undefined {
  if (cidade.virou) return SELO_VIROU;
  const selo = PRIORIDADE_SELOS.find((s) => cidade.selos?.includes(s));
  return selo && seloDoRanking(selo, cidade.uf);
}

/** null quando o cargo não existe no JSON (governador fora dos sete estados) ou faltam os dois candidatos. */
export function cardDeCidade(cidade: Cidade, hist: Hist | undefined, modo: ModoCard, cargo: Cargo = 'presidente'): CardData | null {
  const dados = cargo === 'governador' ? cidade.governador : cidade.presidente;
  const cand = candidatos(dados?.cand);
  if (!dados || !cand) return null;

  const de2022 = hist?.t2_2022?.pct['13'];
  const variacao = cargo === 'governador' ? undefined : (variacaoDoPrimeiro(dados, cand) ?? (de2022 === undefined ? undefined : cand[0].pct - de2022));
  return {
    modo,
    local: cidade.nome,
    uf: cidade.uf,
    cargo,
    cand,
    variacao,
    diferencaVotos: dados.diferenca_votos,
    secoesPct: cidade.secoes_pct,
    hora: hora(cidade.atualizado),
    selo: cargo === 'presidente' ? seloDa(cidade) : undefined,
    dominio: DOMINIO,
    handle: X_HANDLE,
  };
}

/** UF ou Brasil (/data/br.json, /data/uf/{uf}.json). Sem selo e sem variação no governador. */
export function cardDePlacar(
  placar: { atualizado: string; secoes_pct: number; presidente: CargoPlacar; governador: CargoPlacar | null },
  lugar: { nome: string; uf: UF | 'BR' },
  modo: ModoCard,
  cargo: Cargo = 'presidente',
): CardData | null {
  const dados = cargo === 'governador' ? placar.governador : placar.presidente;
  const cand = candidatos(dados?.cand);
  if (!dados || !cand) return null;

  const [primeiro, segundo] = [...dados.cand].sort((a, b) => a.n - b.n);
  return {
    modo,
    local: lugar.nome,
    uf: lugar.uf,
    cargo,
    cand,
    variacao: cargo === 'governador' ? undefined : variacaoDoPrimeiro(dados, cand),
    diferencaVotos: Math.abs(primeiro.votos - segundo.votos),
    secoesPct: placar.secoes_pct,
    hora: hora(placar.atualizado),
    dominio: DOMINIO,
    handle: X_HANDLE,
  };
}

/** O mesmo card com o palpite do usuário (0 a 100 para o candidato de menor número; o outro é o complemento). */
export function comPalpite(card: CardData, pctPrimeiro: number): CardData {
  const [primeiro, segundo] = card.cand;
  return {
    ...card,
    modo: 'palpite',
    cand: [
      { ...primeiro, pct: pctPrimeiro, eleito: false },
      { ...segundo, pct: 100 - pctPrimeiro, eleito: false },
    ],
    variacao: undefined,
    diferencaVotos: undefined,
    selo: undefined,
  };
}
