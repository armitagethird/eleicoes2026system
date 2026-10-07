import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_FALHOU, CARD_GERANDO, CARD_PNG_BAIXADO_E_COPIADO, CARD_TOQUE_DE_NOVO, cardPngBaixado } from '../lib/copy.ts';
import { compartilharPng, type CardPronto } from './compartilhar-png.ts';

/** Botão mínimo: o fluxo só mexe em atributos. `disabled` grava o uso, porque desabilitar um botão focado tira o foco dele. */
function botaoFalso() {
  const atributos = new Map<string, string>();
  const botao = {
    usouDisabled: false,
    getAttribute: (nome: string) => atributos.get(nome) ?? null,
    setAttribute: (nome: string, valor: string) => void atributos.set(nome, valor),
    removeAttribute: (nome: string) => void atributos.delete(nome),
    atributos,
  };
  Object.defineProperty(botao, 'disabled', {
    set: () => {
      botao.usouDisabled = true;
    },
  });
  return botao;
}

const pronto = (): CardPronto => ({
  arquivo: new File(['png'], 'sao-luis-ma-2turno-2026.png', { type: 'image/png' }),
  texto: 'São Luís: 13 60% x 22 40%',
  textoComLink: 'São Luís: 13 60% x 22 40% placar26.com.br/c/sao-luis-ma',
  url: 'https://placar26.com.br/c/sao-luis-ma',
});

const nomeado = (nome: string) => new DOMException('falhou', nome);

describe('compartilharPng', () => {
  let estado: { textContent: string };
  let clique: ReturnType<typeof vi.fn>;
  let escreverNaAreaDeTransferencia: ReturnType<typeof vi.fn>;
  let compartilhar: ReturnType<typeof vi.fn>;
  let podeCompartilhar: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    estado = { textContent: '' };
    clique = vi.fn();
    escreverNaAreaDeTransferencia = vi.fn().mockResolvedValue(undefined);
    compartilhar = vi.fn().mockResolvedValue(undefined);
    podeCompartilhar = true;
    vi.stubGlobal('navigator', {
      canShare: () => podeCompartilhar,
      share: compartilhar,
      clipboard: { writeText: escreverNaAreaDeTransferencia },
    });
    vi.stubGlobal('document', { createElement: () => ({ click: clique }) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const rodar = (botao: ReturnType<typeof botaoFalso>, preparar: () => Promise<CardPronto> = () => Promise.resolve(pronto())) =>
    compartilharPng(botao as unknown as HTMLElement, estado as unknown as HTMLElement, preparar);

  it('durante o preparo o botão fica aria-disabled e aria-busy, nunca disabled: o foco do teclado fica onde estava', async () => {
    const botao = botaoFalso();
    let terminar: (card: CardPronto) => void = () => undefined;
    const emCurso = rodar(botao, () => new Promise<CardPronto>((resolve) => (terminar = resolve)));

    expect(botao.getAttribute('aria-disabled')).toBe('true');
    expect(botao.getAttribute('aria-busy')).toBe('true');
    expect(estado.textContent).toBe(CARD_GERANDO);

    terminar(pronto());
    await emCurso;
    expect(botao.atributos.size).toBe(0);
    expect(botao.usouDisabled).toBe(false);
  });

  it('toque durante o preparo é ignorado: não prepara de novo nem apaga o aviso', async () => {
    const botao = botaoFalso();
    const preparar = vi.fn(() => new Promise<CardPronto>(() => undefined));
    void rodar(botao, preparar);

    expect(await rodar(botao, preparar)).toBe(false);
    expect(preparar).toHaveBeenCalledOnce();
    expect(estado.textContent).toBe(CARD_GERANDO);
  });

  it('compartilha o arquivo com o texto e o link quando o navegador deixa', async () => {
    const card = pronto();
    expect(await rodar(botaoFalso(), () => Promise.resolve(card))).toBe(true);

    expect(compartilhar).toHaveBeenCalledWith({ files: [card.arquivo], text: card.texto, url: card.url });
    expect(clique).not.toHaveBeenCalled();
    expect(estado.textContent).toBe('');
  });

  it('sem compartilhar arquivo, baixa o PNG e copia o texto com o link', async () => {
    podeCompartilhar = false;
    const card = pronto();
    expect(await rodar(botaoFalso(), () => Promise.resolve(card))).toBe(true);

    expect(clique).toHaveBeenCalledOnce();
    expect(escreverNaAreaDeTransferencia).toHaveBeenCalledWith(card.textoComLink);
    expect(estado.textContent).toBe(CARD_PNG_BAIXADO_E_COPIADO);
  });

  it('sem área de transferência, mostra o texto para copiar à mão', async () => {
    podeCompartilhar = false;
    escreverNaAreaDeTransferencia.mockRejectedValue(nomeado('NotAllowedError'));
    const card = pronto();
    expect(await rodar(botaoFalso(), () => Promise.resolve(card))).toBe(true);

    expect(estado.textContent).toBe(cardPngBaixado(card.textoComLink));
  });

  it('fechar a folha de compartilhar não é erro: limpa o aviso e não conta como compartilhado', async () => {
    compartilhar.mockRejectedValue(nomeado('AbortError'));
    const botao = botaoFalso();

    expect(await rodar(botao)).toBe(false);
    expect(estado.textContent).toBe('');
    expect(botao.atributos.size).toBe(0);
  });

  it('gesto expirado: pede para tocar de novo', async () => {
    compartilhar.mockRejectedValue(nomeado('NotAllowedError'));

    expect(await rodar(botaoFalso())).toBe(false);
    expect(estado.textContent).toBe(CARD_TOQUE_DE_NOVO);
  });

  it('erro de verdade: frase de copy.ts na tela e o detalhe técnico no console', async () => {
    const detalhe = new Error('Canvas 2D indisponível neste navegador.');
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const botao = botaoFalso();

    expect(await rodar(botao, () => Promise.reject(detalhe))).toBe(false);
    expect(estado.textContent).toBe(CARD_FALHOU);
    expect(estado.textContent).not.toContain(detalhe.message);
    expect(console_).toHaveBeenCalledWith(expect.any(String), detalhe);
    expect(botao.atributos.size).toBe(0);
  });
});
