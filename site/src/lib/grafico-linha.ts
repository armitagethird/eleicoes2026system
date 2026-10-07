// Gráfico de linha de /historico: 1º e 2º turno de 2018, 2022 e 2026 (% dos votos válidos). Função pura que devolve o SVG
// como string, sem DOM nem biblioteca: o build o escreve no HTML (zero JS na primeira pintura) e a ilha o redesenha com a
// mesma função quando o filtro muda. Linguagem DESTINO: linhas grossas, cada ponto uma plaquinha com o valor e o nome de
// quem era candidato naquela eleição, rótulo direto no fim das linhas (sem legenda). A cor vem do campo `cor` do ponto
// (lib/cores.ts), nunca do número de urna: em 2018 o 17 veste o azul claro. Todo texto sai em caixa-alta (o 900 da página só
// carrega o subset de caixa-alta).
import { GRAFICO_OUTROS, SEM_DADO, TABELA_HISTORICO, apuracaoCard, tituloGraficoAnos, turnoDaCamada } from './copy.ts';
import { corCandidato } from './cores.ts';
import { ALTURAS, larguraTexto } from './destino.ts';
import { percentual } from './format.ts';
import { normalizarAnos, pontosDaSelecao, type Ano, type Lado, type Ponto } from './serie-historica.ts';

export interface DadosGrafico {
  /** Os seis pontos do eixo X, na ordem (lib/serie-historica.ts): todas as eleições do lugar, mesmo as que não estão à vista. */
  pontos: readonly Ponto[];
  /**
   * As eleições à vista (padrão e vazio: todas). O eixo X mostra só os turnos delas, mas a escala Y e os nomes curtos vêm de
   * todos os `pontos`: ligar ou desligar uma eleição nunca mexe na altura de um valor, para os desenhos serem comparáveis.
   */
  anos?: readonly Ano[];
  /** Nome do lugar, para o <title> e a descrição: "Brasil", "São Luís (MA)". */
  lugar: string;
  /** O que o ponto vazio do 2º turno de 2026 diz enquanto não há ao vivo: "25 out". */
  vazio: string;
  /** Nomes de todos os candidatos da série, mesmo os de eleições sem dado neste lugar: o nome curto não pode mudar de uma cidade para outra. */
  nomes?: readonly string[];
}

/** Medidas em unidades do viewBox, que são px CSS quando o SVG ocupa a largura do layout (o CSS o escala a partir daí). */
export interface Layout {
  largura: number;
  altura: number;
  /** x do centro da 1ª coluna. */
  esq: number;
  /** Espaço entre o centro da última coluna e a borda: o rótulo direto do fim das linhas mora aqui. */
  dir: number;
  /** y do valor máximo do eixo; acima fica a folga das pilhas plaquinha + nome. */
  topo: number;
  /** Altura da faixa de baixo: valores de "outros", turnos e anos. */
  rodape: number;
  fonte: number;
  fonteAno: number;
  wdth: number;
  traco: number;
  marca: number;
  plaqH: number;
  plaqPad: number;
  /** "1º" em vez de "1º TURNO" (colunas estreitas). */
  turnoCurto: boolean;
  /** "JAIR 17" em vez de "JAIR". */
  numeroNoNome: boolean;
}

// Três layouts, cada um escalado só entre 1x e ~1,5x pelo CSS (container query em components/historico): o texto nunca
// encolhe abaixo de 13 px.
export const LAYOUTS = {
  compacto: { largura: 328, altura: 440, esq: 48, dir: 80, topo: 44, rodape: 86, fonte: 13, fonteAno: 22, wdth: 62, traco: 4, marca: 8, plaqH: 18, plaqPad: 5, turnoCurto: true, numeroNoNome: false },
  medio: { largura: 520, altura: 470, esq: 62, dir: 118, topo: 50, rodape: 92, fonte: 14, fonteAno: 24, wdth: 75, traco: 5, marca: 10, plaqH: 20, plaqPad: 6, turnoCurto: true, numeroNoNome: false },
  largo: { largura: 760, altura: 520, esq: 76, dir: 150, topo: 56, rodape: 98, fonte: 16, fonteAno: 28, wdth: 87.5, traco: 6, marca: 12, plaqH: 24, plaqPad: 7, turnoCurto: false, numeroNoNome: true },
} as const satisfies Record<string, Layout>;

const ENTIDADES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (texto: string): string => texto.replace(/[&<>"']/g, (c) => ENTIDADES[c]);
const r = (n: number): number => Math.round(n * 10) / 10;
const maiusculo = (texto: string): string => texto.toLocaleUpperCase('pt-BR');
const semSinal = (pct: number): string => percentual(pct).replace('%', '');

const FOLGA = 3;
const HALO = ' paint-order="stroke" stroke="var(--bg)" stroke-width="3" stroke-linejoin="round"';

/** Eixo Y de 0 até um múltiplo de 10 que cobre os dados, nunca abaixo de 60 (o 50% precisa de folga em cima). */
export function dominioY(valores: readonly number[]): { max: number; passo: number } {
  const max = Math.min(100, Math.ceil(Math.max(60, ...valores) / 10) * 10);
  return { max, passo: max <= 70 ? 10 : 20 };
}

/**
 * Afasta caixas verticais que se encostam: cada item quer ficar com o centro em `y` e tem altura `h`. Devolve os centros, na
 * mesma ordem, sem sobreposição (com `folga` entre as caixas) e dentro de [min, max]. Quem não se encosta não se mexe; quem
 * se encosta cede por igual.
 */
export function afastar(itens: ReadonlyArray<{ y: number; h: number }>, folga: number, min: number, max: number): number[] {
  const ys = itens.map((item) => item.y);
  const ordem = itens.map((_, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
  for (let volta = 0; volta < 60; volta++) {
    let mexeu = false;
    for (let k = 1; k < ordem.length; k++) {
      const [i, j] = [ordem[k - 1], ordem[k]];
      const falta = (itens[i].h + itens[j].h) / 2 + folga - (ys[j] - ys[i]);
      if (falta > 0.01) {
        ys[i] -= falta / 2;
        ys[j] += falta / 2;
        mexeu = true;
      }
    }
    for (const [i, item] of itens.entries()) ys[i] = Math.min(max - item.h / 2, Math.max(min + item.h / 2, ys[i]));
    if (!mexeu) break;
  }
  return ys;
}

/**
 * Nome curto de cada candidato da série, pelo nome completo: o sobrenome ("Haddad"), ou o primeiro nome quando dois
 * candidatos dividem o sobrenome ("Jair" e "Flávio" Bolsonaro).
 */
export function nomesCurtos(pontos: readonly Ponto[], conhecidos: readonly string[] = []): Map<string, string> {
  const nomes = new Set<string>(conhecidos);
  for (const p of pontos) for (const lado of [p.a, p.b]) if (lado) nomes.add(lado.nome);
  const partes = (nome: string): string[] => nome.trim().split(/\s+/);
  const sobrenome = (nome: string): string => partes(nome).at(-1) ?? nome;
  return new Map(
    [...nomes].map((nome) => {
      const dividido = [...nomes].some((outro) => outro !== nome && sobrenome(outro) === sobrenome(nome));
      return [nome, partes(nome).length === 1 ? nome : dividido ? partes(nome)[0] : sobrenome(nome)];
    }),
  );
}

type LadoId = 'a' | 'b';
const LADOS: readonly LadoId[] = ['a', 'b'];
const corDe = (lado: Lado, id: LadoId): string => corCandidato(lado.cor ? Number(lado.cor) : 0, id === 'a' ? 0 : 1).css;

function descricaoDoPonto(p: Ponto, vazio: string): string {
  const quando = turnoDaCamada(p.id);
  if (!p.a && !p.b) return `${quando}: ${p.id === '2026-t2' ? vazio : SEM_DADO}`;
  const partes = [p.a, p.b].flatMap((lado) => (lado ? [`${lado.nome} ${percentual(lado.pct)}`] : []));
  if (p.outros) partes.push(`${GRAFICO_OUTROS} ${percentual(p.outros)}`);
  const fase = p.aoVivo ? ` (${apuracaoCard(p.aoVivo.fase, p.aoVivo.secoesPct)})` : '';
  return `${quando}${fase}: ${partes.join('; ')}`;
}

export function renderGrafico({ pontos: todos, anos, lugar, vazio, nomes: conhecidos }: DadosGrafico, L: Layout, id: string): string {
  // Escala e nomes curtos vêm de todas as eleições do lugar; o eixo X, só das que estão à vista (duas colunas por eleição).
  const valores = todos.flatMap((p) => [p.a?.pct, p.b?.pct, p.outros]).filter((v): v is number => typeof v === 'number');
  const { max, passo } = dominioY(valores);
  const escolhidas = normalizarAnos(anos);
  const pontos = pontosDaSelecao(todos, escolhidas);
  const base = L.altura - L.rodape;
  const y = (v: number): number => base - (v / max) * (base - L.topo);
  const cap = ALTURAS.cap * L.fonte;
  const nomes = nomesCurtos(todos, conhecidos);

  const larguraPlaq = (texto: string, pad = L.plaqPad): number => Math.ceil(Math.max(L.plaqH, larguraTexto(texto, L.wdth, L.fonte) + 2 * pad));
  const textoCentro = (cx: number, cy: number, conteudo: string, fill: string, ancora = 'middle', extra = ''): string =>
    `<text x="${r(cx)}" y="${r(cy + cap / 2)}" text-anchor="${ancora}" fill="${fill}"${extra}>${esc(conteudo)}</text>`;
  const plaq = (cx: number, cy: number, w: number, fill: string, extra = ''): string =>
    `<rect class="gl-plaq" x="${r(cx - w / 2)}" y="${r(cy - L.plaqH / 2)}" width="${w}" height="${L.plaqH}" fill="${fill}"${extra}/>`;

  // Pilha de cada ponto: marca no valor, plaquinha encostada nela e o nome do lado de fora. Quem tem mais votos na coluna
  // leva a pilha para cima e o outro para baixo, então as duas nunca se sobrepõem; se a pilha de baixo não cabe acima do
  // eixo X (lado quase em zero), ela sobe.
  const pilhaCima = L.marca / 2 + L.plaqH + FOLGA + ALTURAS.acento * L.fonte;
  const pilhaBaixo = L.marca / 2 + L.plaqH + FOLGA + cap;
  const rotuloNome = (lado: Lado): string => maiusculo(`${nomes.get(lado.nome) ?? lado.nome}${L.numeroNoNome ? ` ${lado.n}` : ''}`);

  const colunas = pontos.map((p, i) => {
    const doLado = LADOS.flatMap((lado) => {
      const dado = p[lado];
      return dado ? [{ lado, dado, y: y(dado.pct) }] : [];
    });
    const porAltura = [...doLado].sort((m, n) => m.y - n.y || (m.lado === 'a' ? -1 : 1));
    return porAltura.map((item, k) => {
      const cabeBaixo = item.y + pilhaBaixo + 2 <= base;
      // A pilha de baixo esconderia o topo da coluna de "outros": sobe, se acima dela há lugar até a marca do outro lado.
      const cobreOutros = p.outros !== null && y(p.outros) < item.y + pilhaBaixo + 2;
      const cimaLivre = item.y - pilhaCima >= porAltura[0].y + L.marca / 2 + 2;
      return { ...item, i, p, baixo: k === 1 && cabeBaixo && !(cobreOutros && cimaLivre) };
    });
  });
  // Na ordem de leitura: coluna a coluna, o do PT (A) antes do de Bolsonaro (B), esteja a pilha em cima ou embaixo.
  const pilhas = colunas.flat().sort((m, n) => m.i - n.i || (m.lado === 'a' ? -1 : 1));

  // O rótulo direto do fim de cada linha ("13 HADDAD") nasce ao lado do último ponto e nunca passa da borda: se o último ponto
  // é de um nome comprido e não cabe na margem direita do layout, a margem cresce (só quando o rótulo já passaria da borda).
  const fins = LADOS.flatMap((lado) => {
    const ultimo = pilhas.filter((s) => s.lado === lado).at(-1);
    return ultimo ? [ultimo] : [];
  });
  const recuoFim = (f: (typeof fins)[number]): number => Math.max(L.marca / 2, larguraPlaq(semSinal(f.dado.pct)) / 2) + 4;
  const nomeFim = (f: (typeof fins)[number]): string => maiusculo(nomes.get(f.dado.nome) ?? f.dado.nome);
  const larguraFim = (f: (typeof fins)[number]): number => recuoFim(f) + larguraPlaq(String(f.dado.n)) + 4 + larguraTexto(nomeFim(f), L.wdth, L.fonte) + 2;
  const dir = Math.max(L.dir, ...fins.filter((f) => f.i === pontos.length - 1).map(larguraFim));
  const dx = (L.largura - dir - L.esq) / Math.max(1, pontos.length - 1);
  // Meia largura das réguas dos anos e das marcas de 50%: com poucas colunas o espaço cresce, a régua não vira um trilho de ponta a ponta.
  const meiaRegua = Math.min(dx * 0.4, L.esq * 0.6);
  const x = (i: number): number => L.esq + i * dx;

  // ---- fundo: grade, divisórias de ano, marcas de 50% nos 2º turnos, colunas de "outros" ----
  const ticks = Array.from({ length: Math.floor(max / passo) + 1 }, (_, k) => k * passo);
  if (50 % passo) ticks.push(50);
  // Borda direita dos rótulos do eixo Y: a largura de "100%", o maior deles.
  const xEixo = Math.ceil(larguraTexto('100%', L.wdth, L.fonte)) + 2;
  const grade = ticks
    .filter((v) => v > 0 && v !== 50)
    .map((v) => `M${r(xEixo + 6)} ${r(y(v))}H${L.largura}`)
    .join('');
  const eixoY = ticks
    .filter((v) => v > 0)
    .map((v) => textoCentro(xEixo, y(v), `${v}%`, v === 50 ? 'var(--ink)' : 'var(--ink-2)', 'end'))
    .join('');
  const divisorias = pontos.map((p, i) => (pontos[i + 1] && pontos[i + 1].ano !== p.ano ? `M${r((x(i) + x(i + 1)) / 2)} ${L.topo}V${r(base)}` : '')).join('');
  const marcas50 = pontos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.turno === 2)
    .map(({ p, i }) => `<path class="gl-meta" data-id="${p.id}" d="M${r(x(i) - meiaRegua * 0.85)} ${r(y(50))}H${r(x(i) + meiaRegua * 0.85)}" stroke="var(--ink)" stroke-width="4"/>`)
    .join('');
  const larguraBarra = L.marca + 2;
  const comOutros = pontos.map((p, i) => ({ p, i })).filter(({ p }) => p.outros);
  const colunasOutros = comOutros
    .map(({ p, i }) => {
      const topoBarra = y(p.outros ?? 0);
      return (
        `<rect class="gl-outros" data-id="${p.id}" data-pct="${p.outros}" x="${r(x(i) - larguraBarra / 2)}" y="${r(topoBarra)}" width="${larguraBarra}" height="${r(base - topoBarra)}" fill="var(--surface-1)" stroke="var(--ink-2)" stroke-width="2"/>` +
        textoCentro(x(i), base + L.fonte / 2 + 6, semSinal(p.outros ?? 0), 'var(--ink-2)', 'middle', HALO)
      );
    })
    .join('');
  const ultimaOutros = comOutros.at(-1);
  const rotuloOutros = ultimaOutros
    ? textoCentro(x(ultimaOutros.i) + larguraBarra / 2 + 5, y(ultimaOutros.p.outros ?? 0), maiusculo(GRAFICO_OUTROS), 'var(--ink-2)', 'start', HALO)
    : '';

  // ---- linhas: um trecho por sequência de pontos seguidos; um ponto que falta quebra a linha, nunca é inventado ----
  const linhas = LADOS.map((lado) => {
    const presentes = pontos.map((p, i) => (p[lado] ? i : -1)).filter((i) => i >= 0);
    const trechos: number[][] = [];
    for (const i of presentes) {
      const ultimo = trechos.at(-1);
      if (ultimo && ultimo.at(-1) === i - 1) ultimo.push(i);
      else trechos.push([i]);
    }
    return trechos
      .filter((t) => t.length > 1)
      .map((t) => {
        const cor = corDe(pontos[t[0]][lado] as Lado, lado);
        const d = t.map((i, k) => `${k ? 'L' : 'M'}${r(x(i))} ${r(y((pontos[i][lado] as Lado).pct))}`).join(' ');
        return `<path class="gl-linha" data-serie="${lado}" data-cor="${(pontos[t[0]][lado] as Lado).cor ?? ''}" d="${d}" fill="none" stroke="${cor}" stroke-width="${L.traco}" stroke-linejoin="round" stroke-linecap="round"/>`;
      })
      .join('');
  }).join('');

  // ---- pontos ----
  const desenhoPontos = pilhas
    .map(({ lado, dado, y: vy, i, p, baixo }) => {
      const cor = corDe(dado, lado);
      const texto = semSinal(dado.pct);
      const w = larguraPlaq(texto);
      const topoPlaq = baixo ? vy + L.marca / 2 : vy - L.marca / 2 - L.plaqH;
      const cy = topoPlaq + L.plaqH / 2;
      const parcial = p.aoVivo?.fase === 'parcial';
      const yNome = baixo ? topoPlaq + L.plaqH + FOLGA + cap : topoPlaq - FOLGA;
      // Nome comprido na 1ª coluna (HADDAD 13) não pode invadir os rótulos do eixo Y: encosta neles em vez de centrar.
      const nomeCompleto = rotuloNome(dado);
      const xNome = Math.max(x(i), xEixo + 4 + larguraTexto(nomeCompleto, L.wdth, L.fonte) / 2);
      const dica = `${dado.nome} (${dado.n}${dado.partido ? `, ${dado.partido}` : ''}): ${percentual(dado.pct)} · ${turnoDaCamada(p.id)}`;
      return (
        `<g class="gl-ponto" data-id="${p.id}" data-lado="${lado}" data-cor="${dado.cor ?? ''}"${p.aoVivo ? ` data-fase="${p.aoVivo.fase}"` : ''}>` +
        `<title>${esc(dica)}</title>` +
        `<rect class="gl-marca" data-id="${p.id}" data-lado="${lado}" data-pct="${dado.pct}" x="${r(x(i) - L.marca / 2)}" y="${r(vy - L.marca / 2)}" width="${L.marca}" height="${L.marca}" fill="${cor}" stroke="var(--bg)" stroke-width="2"/>` +
        (parcial ? plaq(x(i), cy, w, 'var(--bg)', ` stroke="${cor}" stroke-width="2"`) : plaq(x(i), cy, w, cor)) +
        textoCentro(x(i), cy, texto, parcial ? cor : 'var(--bg)') +
        `<text x="${r(xNome)}" y="${r(yNome)}" text-anchor="middle" fill="${cor}"${HALO}>${esc(nomeCompleto)}</text>` +
        `</g>`
      );
    })
    .join('');

  // ---- fim das linhas: número + nome direto ao lado do último ponto; o ponto vazio de 2026 entra no mesmo afastamento ----
  const sem2026 = pontos.findIndex((p) => p.id === '2026-t2' && !p.a && !p.b);
  const textoVazio = maiusculo(vazio);
  const larguraVazio = larguraPlaq(textoVazio, 3);
  const itens = [
    ...fins.map((f) => ({ y: f.y, h: L.plaqH })),
    ...(sem2026 >= 0 ? [{ y: y(50), h: L.plaqH }] : []),
  ];
  const ys = afastar(itens, 4, 2, base - 2);
  const desenhoFins = fins
    .map((f, k) => {
      const cor = corDe(f.dado, f.lado);
      const numero = String(f.dado.n);
      const wNumero = larguraPlaq(numero);
      const inicio = x(f.i) + recuoFim(f);
      const cy = ys[k];
      const ligacao =
        Math.abs(cy - f.y) > 1.5
          ? `<path d="M${r(x(f.i) + L.marca / 2)} ${r(f.y)}L${r(inicio - 1)} ${r(cy)}" fill="none" stroke="${cor}" stroke-width="2"/>`
          : '';
      return (
        `<g class="gl-fim" data-lado="${f.lado}">${ligacao}` +
        plaq(inicio + wNumero / 2, cy, wNumero, cor) +
        textoCentro(inicio + wNumero / 2, cy, numero, 'var(--bg)') +
        textoCentro(inicio + wNumero + 4, cy, nomeFim(f), cor, 'start', HALO) +
        `</g>`
      );
    })
    .join('');
  const desenhoVazio =
    sem2026 >= 0
      ? `<g class="gl-vazio">${plaq(x(sem2026), ys[fins.length], larguraVazio, 'var(--bg)', ' stroke="var(--ink-2)" stroke-width="2"')}${textoCentro(x(sem2026), ys[fins.length], textoVazio, 'var(--ink-2)')}</g>`
      : '';

  const semDado = pontos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.id !== '2026-t2' && !p.a && !p.b)
    .map(({ i }) => {
      const [primeira, segunda] = maiusculo(SEM_DADO).split(' ');
      const meio = (L.topo + base) / 2;
      return `<g class="gl-semdado">${textoCentro(x(i), meio - L.fonte * 0.7, primeira, 'var(--ink-2)', 'middle', HALO)}${textoCentro(x(i), meio + L.fonte * 0.7, segunda ?? '', 'var(--ink-2)', 'middle', HALO)}</g>`;
    })
    .join('');

  // ---- eixo X: turno em cima, régua e ano embaixo ----
  const yTurno = base + 2 * L.fonte + 14;
  const yRegua = yTurno + 12;
  // "1º" nas colunas estreitas; com poucas eleições à vista as colunas se afastam e cabe "1º TURNO".
  const turnoCurto = L.turnoCurto && dx < larguraTexto('2º TURNO', L.wdth, L.fonte) + 12;
  const turnos = pontos
    .map((p, i) => textoCentro(x(i), yTurno - cap / 2, turnoCurto ? `${p.turno}º` : `${p.turno}º TURNO`, 'var(--ink-2)'))
    .join('');
  const reguasAno = pontos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.turno === 1)
    .map(({ p, i }) => {
      const [de, ate] = [x(i) - meiaRegua, x(i + 1) + meiaRegua];
      return `<path class="gl-ano" d="M${r(de)} ${r(yRegua)}H${r(ate)}" stroke="var(--ink)" stroke-width="4"/><text x="${r((de + ate) / 2)}" y="${r(yRegua + 8 + ALTURAS.cap * L.fonteAno)}" font-size="${L.fonteAno}" text-anchor="middle" fill="var(--ink)">${p.ano}</text>`;
    })
    .join('');

  const desc = pontos.map((p) => descricaoDoPonto(p, vazio)).join('. ');
  return (
    `<svg class="gl" role="img" aria-labelledby="${id}-t ${id}-d" viewBox="0 0 ${L.largura} ${L.altura}" width="${L.largura}" height="${L.altura}" font-size="${L.fonte}" style="font-family:var(--font-display);font-weight:900;font-stretch:${L.wdth}%">` +
    `<title id="${id}-t">${esc(tituloGraficoAnos(lugar, escolhidas))}</title><desc id="${id}-d">${esc(desc)}</desc>` +
    `<path d="${grade}" stroke="var(--surface-2)" stroke-width="2" fill="none"/>` +
    `<path d="${divisorias}" stroke="var(--surface-2)" stroke-width="2" fill="none"/>` +
    `<path d="M${r(xEixo + 6)} ${r(y(50))}H${L.largura}" stroke="var(--ink-2)" stroke-width="2" fill="none"/>` +
    `<path d="M${r(xEixo + 6)} ${r(base)}H${L.largura}" stroke="var(--ink-2)" stroke-width="2" fill="none"/>` +
    eixoY +
    marcas50 +
    colunasOutros +
    linhas +
    desenhoPontos +
    rotuloOutros +
    desenhoFins +
    desenhoVazio +
    semDado +
    turnos +
    reguasAno +
    `</svg>`
  );
}

/** Tabela alternativa ao gráfico: os mesmos números, uma linha por turno das eleições à vista, para quem não vê o SVG. */
export function renderTabela({ pontos: todos, anos, lugar, vazio }: DadosGrafico): string {
  const escolhidas = normalizarAnos(anos);
  const celula = (lado: Lado | null, id: LadoId): string =>
    lado
      ? `<td><strong style="color:${corDe(lado, id)}">${percentual(lado.pct)}</strong><span>${esc(lado.nome)} (${lado.n})</span></td>`
      : '';
  const linhas = pontosDaSelecao(todos, escolhidas).map((p) => {
    const fase = p.aoVivo ? `<small class="gl-fase"> ${esc(apuracaoCard(p.aoVivo.fase, p.aoVivo.secoesPct))}</small>` : '';
    const cabeca = `<th scope="row">${esc(turnoDaCamada(p.id))}${fase}</th>`;
    if (!p.a && !p.b) return `<tr>${cabeca}<td colspan="3">${esc(p.id === '2026-t2' ? vazio : SEM_DADO)}</td></tr>`;
    const outros = p.outros ? `<td><strong>${percentual(p.outros)}</strong></td>` : '<td>—</td>';
    return `<tr>${cabeca}${celula(p.a, 'a')}${celula(p.b, 'b')}${outros}</tr>`;
  });
  const { eleicao, a, b, outros } = TABELA_HISTORICO;
  return (
    `<table class="gl-tabela"><caption class="sr-only">${esc(tituloGraficoAnos(lugar, escolhidas))}</caption>` +
    `<thead><tr><th scope="col">${eleicao}</th><th scope="col">${a}</th><th scope="col">${b}</th><th scope="col">${outros}</th></tr></thead>` +
    `<tbody>${linhas.join('')}</tbody></table>`
  );
}
