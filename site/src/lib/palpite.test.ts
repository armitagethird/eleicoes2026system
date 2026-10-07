import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { desenharCard } from '../components/palpite-card.ts';
import type { CardData } from '../components/Card.ts';
import { PALAVRAS_PROIBIDAS, PALPITE_LOCAL, PALPITE_NAO_E_ENQUETE, erroDoPalpite, erroPalpiteCard, palpiteFalado, palpitePergunta, textoPalpite } from './copy.ts';
import {
  PALPITE_INICIAL,
  PALPITE_MAX,
  PALPITE_MIN,
  PALPITE_PASSO,
  complemento,
  erroEmPontos,
  gravarPalpite,
  lerPalpite,
  limitarPalpite,
  type Armazenamento,
} from './palpite.ts';

/** Armazenamento de verdade em memória: o mesmo contrato de getItem/setItem do localStorage. */
function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
}

describe('o slider', () => {
  it('vai de 0 a 100 para o 13, em passos de 1', () => {
    expect([PALPITE_MIN, PALPITE_MAX, PALPITE_PASSO]).toEqual([0, 100, 1]);
    expect(PALPITE_INICIAL).toBe(50);
  });

  it('limita e arredonda o valor ao passo', () => {
    expect(limitarPalpite(-5)).toBe(0);
    expect(limitarPalpite(140)).toBe(100);
    expect(limitarPalpite(60.4)).toBe(60);
    expect(limitarPalpite(60.5)).toBe(61);
    expect(limitarPalpite(Number.NaN)).toBe(PALPITE_INICIAL);
  });

  it('o 22 é o complemento do 13 e os dois somam 100', () => {
    expect(complemento(60)).toBe(40);
    expect(complemento(0)).toBe(100);
    expect(complemento(100)).toBe(0);
    for (let p = PALPITE_MIN; p <= PALPITE_MAX; p += PALPITE_PASSO) expect(p + complemento(p)).toBe(100);
  });
});

describe('palpite no armazenamento local', () => {
  it('grava e lê por cidade, sem misturar cidades', () => {
    const a = memoria();
    expect(gravarPalpite('sao-luis-ma', 61, a)).toBe(true);
    expect(gravarPalpite('natal-rn', 38, a)).toBe(true);
    expect(lerPalpite('sao-luis-ma', a)).toBe(61);
    expect(lerPalpite('natal-rn', a)).toBe(38);
    expect(lerPalpite('recife-pe', a)).toBeNull();
  });

  it('aceita as pontas 0 e 100', () => {
    const a = memoria();
    gravarPalpite('una-mg', 0, a);
    gravarPalpite('jau-sp', 100, a);
    expect(lerPalpite('una-mg', a)).toBe(0);
    expect(lerPalpite('jau-sp', a)).toBe(100);
  });

  it('valor adulterado ou corrompido vira "sem palpite"', () => {
    const a = memoria();
    for (const lixo of ['', 'abc', '101', '-1', '60.5', 'NaN', '{"p":60}', ' ']) {
      a.dados.set('palpite:x-ma', lixo);
      expect(lerPalpite('x-ma', a), `valor ${JSON.stringify(lixo)}`).toBeNull();
    }
  });

  it('localStorage que lança (modo privado, cota) não derruba nada', () => {
    const quebrado: Armazenamento = {
      getItem: () => {
        throw new DOMException('negado', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('cheio', 'QuotaExceededError');
      },
    };
    expect(lerPalpite('x-ma', quebrado)).toBeNull();
    expect(gravarPalpite('x-ma', 50, quebrado)).toBe(false);
  });

  it('sem localStorage (null ou inexistente no ambiente) também não derruba', () => {
    expect(lerPalpite('x-ma', null)).toBeNull();
    expect(gravarPalpite('x-ma', 50, null)).toBe(false);
    // Node não tem localStorage: o padrão tem de tolerar a ausência em vez de lançar ReferenceError.
    expect(lerPalpite('x-ma')).toBeNull();
    expect(gravarPalpite('x-ma', 50)).toBe(false);
  });

  it('acessar window.localStorage que lança (cookies bloqueados) é tolerado', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('negado', 'SecurityError');
      },
    });
    try {
      expect(lerPalpite('x-ma')).toBeNull();
      expect(gravarPalpite('x-ma', 50)).toBe(false);
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});

describe('erro do palpite em final', () => {
  it('é a distância, em pontos, entre o palpite do 13 e o resultado do 13', () => {
    expect(erroEmPontos(60, 58.4)).toBeCloseTo(1.6, 10);
    expect(erroEmPontos(58.4, 60)).toBeCloseTo(1.6, 10);
    expect(erroEmPontos(55, 55)).toBe(0);
    expect(erroEmPontos(0, 100)).toBe(100);
  });

  it('a frase usa o pontos() do format.ts, com singular e plural corretos', () => {
    expect(erroDoPalpite(1.6)).toBe('você errou por 1,6 pontos');
    expect(erroDoPalpite(12.34)).toBe('você errou por 12,3 pontos');
    expect(erroDoPalpite(1.04)).toBe('você errou por 1,0 ponto');
    expect(erroDoPalpite(0.5)).toBe('você errou por 0,5 ponto');
    expect(erroDoPalpite(1.1)).toBe('você errou por 1,1 pontos');
    expect(erroDoPalpite(100)).toBe('você errou por 100,0 pontos');
  });

  it('erro que arredonda para 0,0 não vira "errou por 0,0 ponto"', () => {
    expect(erroDoPalpite(0)).toBe('você acertou o resultado');
    expect(erroDoPalpite(0.04)).toBe('você acertou o resultado');
    expect(erroDoPalpite(0.05)).toBe('você errou por 0,1 ponto');
  });

  it('o card recebe a frase em partes (texto, número, texto), com o mesmo singular e plural', () => {
    expect(erroPalpiteCard(2.6)).toEqual({ antes: 'você errou por', numero: '2,6', depois: 'pontos' });
    expect(erroPalpiteCard(1.04)).toEqual({ antes: 'você errou por', numero: '1,0', depois: 'ponto' });
    expect(erroPalpiteCard(0.5)).toEqual({ antes: 'você errou por', numero: '0,5', depois: 'ponto' });
    expect(erroPalpiteCard(0.04)).toEqual({ antes: 'você acertou o resultado', numero: '', depois: '' });
  });

  it('as partes e a frase inteira dizem a mesma coisa', () => {
    for (const erro of [0, 0.04, 0.05, 0.5, 1.04, 1.1, 2.6, 12.34, 100]) {
      const { antes, numero, depois } = erroPalpiteCard(erro);
      expect([antes, numero, depois].filter(Boolean).join(' '), String(erro)).toBe(erroDoPalpite(erro));
    }
  });
});

describe('o card do palpite na página', () => {
  const card: CardData = {
    modo: 'parcial',
    local: 'São Luís',
    uf: 'MA',
    cargo: 'presidente',
    cand: [
      { n: 13, nome: 'Lula', partido: 'PT', pct: 0 },
      { n: 22, nome: 'Flávio Bolsonaro', partido: 'PL', pct: 0 },
    ],
    secoesPct: 0,
    hora: '17:00',
    dominio: 'dominio.test',
    handle: '@conta',
  };
  const desenhar = (erro?: number): string => {
    const figura = { innerHTML: '' } as HTMLElement;
    desenharCard(figura, { card, pct13: 61, erro });
    return figura.innerHTML;
  };

  it('em pre (sem erro) o card mostra a diferença entre os dois palpites', () => {
    const svg = desenhar();
    expect(svg).toContain('DIFERENÇA DE');
    expect(svg).not.toContain('VOCÊ ERROU');
  });

  it('em final (com erro) o card diz "você errou por X pontos" e segue sendo o card do palpite', () => {
    const svg = desenhar(2.6);
    expect(svg).toContain('VOCÊ ERROU POR');
    expect(svg).toContain('>2,6<');
    expect(svg).not.toContain('DIFERENÇA DE');
    expect(svg).toContain('SEU PALPITE');
    expect(svg).toContain('PALPITE · NÃO É RESULTADO');
  });
});

describe('textos do palpite', () => {
  it('o texto do compartilhamento põe o 13 antes do 22, com os números do card', () => {
    const cand = [
      { n: 22, nome: 'Flávio Bolsonaro', pct: 40 },
      { n: 13, nome: 'Lula', pct: 60 },
    ];
    expect(textoPalpite({ local: 'São Luís', cand })).toBe('Meu palpite para São Luís: Lula 60,0% × Flávio Bolsonaro 40,0% · não é resultado');
    expect(textoPalpite({ local: 'São Luís', cand }, 'dominio.com.br/c/sao-luis-ma')).toBe(
      'Meu palpite para São Luís: Lula 60,0% × Flávio Bolsonaro 40,0% · não é resultado · dominio.com.br/c/sao-luis-ma',
    );
  });

  it('em final o texto traz o erro, em primeira pessoa', () => {
    const cand = [
      { n: 13, nome: 'Lula', pct: 60 },
      { n: 22, nome: 'Flávio Bolsonaro', pct: 40 },
    ];
    expect(textoPalpite({ local: 'São Luís', cand, erro: 1.6 })).toBe('Meu palpite para São Luís: Lula 60,0% × Flávio Bolsonaro 40,0% · errei por 1,6 pontos');
    expect(textoPalpite({ local: 'São Luís', cand, erro: 0 })).toBe('Meu palpite para São Luís: Lula 60,0% × Flávio Bolsonaro 40,0% · acertei o resultado');
  });

  it('o valor falado do slider diz os dois candidatos, 13 primeiro', () => {
    expect(palpiteFalado('Lula', 'Flávio Bolsonaro', 60)).toBe('13 Lula, 60,0%; 22 Flávio Bolsonaro, 40,0%');
    expect(palpiteFalado('Lula', 'Flávio Bolsonaro', 0)).toBe('13 Lula, 0,0%; 22 Flávio Bolsonaro, 100,0%');
  });

  it('a pergunta fala de votos válidos e do 13', () => {
    expect(palpitePergunta('São Luís', 'MA')).toBe('Quanto o 13 terá dos votos válidos em São Luís (MA)?');
  });

  it('a interface diz, em texto curto e neutro, que o palpite fica só no aparelho e que não é enquete', () => {
    expect(PALPITE_LOCAL).toContain('só neste aparelho');
    expect(PALPITE_NAO_E_ENQUETE).toContain('Não é enquete');
    expect(PALPITE_NAO_E_ENQUETE).toContain('nada é enviado');
    for (const frase of [PALPITE_LOCAL, PALPITE_NAO_E_ENQUETE]) expect(frase.length).toBeLessThan(60);
  });

  it('nenhum texto usa palavra proibida', () => {
    const textos = [
      PALPITE_LOCAL,
      PALPITE_NAO_E_ENQUETE,
      palpitePergunta('São Luís', 'MA'),
      erroDoPalpite(1.6),
      erroDoPalpite(0),
      palpiteFalado('Lula', 'Flávio Bolsonaro', 60),
      textoPalpite({ local: 'São Luís', cand: [{ n: 13, nome: 'Lula', pct: 60 }, { n: 22, nome: 'Flávio Bolsonaro', pct: 40 }], erro: 2 }),
    ]
      .join(' ')
      .toLowerCase();
    for (const palavra of PALAVRAS_PROIBIDAS) expect(textos).not.toContain(palavra);
  });
});

// Regra de ouro do palpite (brief, seção 4): fica no aparelho, nunca vai a servidor, nunca vira agregado. Enquete é proibida no
// período eleitoral. Estes arquivos só podem LER de /data/* (status.json e o JSON da cidade); nada que escreva ou envie.
describe('o palpite nunca sai do aparelho', () => {
  const ARQUIVOS = ['../lib/palpite.ts', '../components/Palpite.ts', '../components/palpite-card.ts'] as const;
  const fonte = (caminho: string): string => readFileSync(new URL(caminho, import.meta.url), 'utf8');

  it.each(ARQUIVOS)('%s só faz fetch de /data/*, sem corpo nem método de escrita', (caminho) => {
    const codigo = fonte(caminho);
    const chamadas = [...codigo.matchAll(/\bfetch\(/g)].length;
    const dados = [...codigo.matchAll(/\bfetch\(\s*[`'"]\/data\//g)].length;
    expect(dados, 'todo fetch tem de começar com uma string literal "/data/"').toBe(chamadas);
    for (const proibido of [/sendBeacon/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /\bmethod\s*:/, /\bbody\s*:/, /\bPOST\b/, /\bPUT\b/]) {
      expect(codigo).not.toMatch(proibido);
    }
  });
});
