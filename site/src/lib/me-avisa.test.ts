import { describe, expect, it } from 'vitest';
import { PALAVRAS_PROIBIDAS, meAvisaConsentimento, meAvisaPromessa } from './copy.ts';
import { ME_AVISA } from './flags.ts';
import {
  CHAVE_ME_AVISA,
  endpointSeguro,
  interpretarFormulario,
  jaPediuAviso,
  meAvisaDisponivel,
  registrarPedido,
  validarEmail,
  type EntradaFormulario,
} from './me-avisa.ts';
import type { Armazenamento } from './armazenamento.ts';

const memoria = (conteudo?: string): Armazenamento & { gravado: () => string | null } => {
  let valor = conteudo ?? null;
  return {
    getItem: (chave) => (chave === CHAVE_ME_AVISA ? valor : null),
    setItem: (chave, novo) => {
      if (chave === CHAVE_ME_AVISA) valor = novo;
    },
    gravado: () => valor,
  };
};

const indisponivel: Armazenamento = {
  getItem: () => {
    throw new DOMException('acesso negado', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('sem espaço', 'QuotaExceededError');
  },
};

const entrada = (parcial: Partial<EntradaFormulario> = {}): EntradaFormulario => ({
  email: 'maria.silva@exemplo.com.br',
  consentimento: true,
  isca: '',
  cidade: 'sao-luis-ma',
  ...parcial,
});

describe('validarEmail', () => {
  it.each([
    ['a@b.co'],
    ['maria.silva@exemplo.com.br'],
    ['maria+eleicoes@exemplo.com'],
    ['josé@exemplo.com.br'],
    ['o\'brien@exemplo.org'],
    ['x@sub.dominio.exemplo.com'],
  ])('aceita %s', (email) => {
    expect(validarEmail(email)).toEqual({ ok: true, email });
  });

  it('tira os espaços das pontas e devolve o e-mail limpo', () => {
    expect(validarEmail('  maria@exemplo.com \n')).toEqual({ ok: true, email: 'maria@exemplo.com' });
  });

  it('não mexe nas maiúsculas: quem normaliza é o servidor', () => {
    expect(validarEmail('Maria@Exemplo.com')).toEqual({ ok: true, email: 'Maria@Exemplo.com' });
  });

  it.each([[''], ['   '], ['\n\t']])('vazio (%j) é "vazio"', (email) => {
    expect(validarEmail(email)).toEqual({ ok: false, motivo: 'vazio' });
  });

  it.each([
    ['sem arroba', 'maria.exemplo.com'],
    ['sem domínio', 'maria@'],
    ['sem usuário', '@exemplo.com'],
    ['sem ponto no domínio', 'maria@exemplo'],
    ['duas arrobas', 'maria@@exemplo.com'],
    ['duas arrobas separadas', 'a@b@exemplo.com'],
    ['espaço no meio', 'maria silva@exemplo.com'],
    ['ponto duplo no usuário', 'maria..silva@exemplo.com'],
    ['ponto no começo do usuário', '.maria@exemplo.com'],
    ['ponto no fim do usuário', 'maria.@exemplo.com'],
    ['ponto duplo no domínio', 'maria@exemplo..com'],
    ['ponto no fim do domínio', 'maria@exemplo.com.'],
    ['domínio que começa com ponto', 'maria@.exemplo.com'],
    ['TLD de 1 letra', 'maria@exemplo.c'],
    ['quebra de linha (injeção de cabeçalho)', 'maria@exemplo.com\nbcc:outro@exemplo.com'],
    ['retorno de carro', 'maria@exemplo.com\rbcc:x@y.com'],
    ['caractere de controle', 'mar\u0000ia@exemplo.com'],
    ['vários e-mails', 'a@exemplo.com, b@exemplo.com'],
  ])('recusa %s', (_motivo, email) => {
    expect(validarEmail(email)).toEqual({ ok: false, motivo: 'invalido' });
  });

  it('recusa e-mail com mais de 254 caracteres', () => {
    const longo = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;
    expect(longo.length).toBeGreaterThan(254);
    expect(validarEmail(longo)).toEqual({ ok: false, motivo: 'invalido' });
  });
});

describe('interpretarFormulario', () => {
  it('com tudo certo, monta o pedido com exatamente e-mail, cidade e consentimento, nessa ordem', () => {
    const resultado = interpretarFormulario(entrada());
    expect(resultado.tipo).toBe('enviar');
    if (resultado.tipo !== 'enviar') return;
    expect(JSON.stringify(resultado.pedido)).toBe('{"email":"maria.silva@exemplo.com.br","cidade":"sao-luis-ma","consentimento":true}');
  });

  it('o pedido não leva a isca nem nenhum campo que a entrada tenha a mais', () => {
    const suja = { ...entrada(), telefone: '11999999999', nome: 'Maria', cpf: '000.000.000-00' } as EntradaFormulario;
    const resultado = interpretarFormulario(suja);
    expect(resultado.tipo).toBe('enviar');
    if (resultado.tipo !== 'enviar') return;
    expect(Object.keys(resultado.pedido)).toEqual(['email', 'cidade', 'consentimento']);
  });

  it('usa o e-mail já sem os espaços das pontas', () => {
    const resultado = interpretarFormulario(entrada({ email: '  maria@exemplo.com  ' }));
    expect(resultado).toEqual({ tipo: 'enviar', pedido: { email: 'maria@exemplo.com', cidade: 'sao-luis-ma', consentimento: true } });
  });

  it('sem marcar o consentimento não envia, mesmo com e-mail certo', () => {
    expect(interpretarFormulario(entrada({ consentimento: false }))).toEqual({ tipo: 'invalido', erros: { consentimento: true } });
  });

  it('e-mail vazio e e-mail inválido são erros diferentes', () => {
    expect(interpretarFormulario(entrada({ email: '' }))).toEqual({ tipo: 'invalido', erros: { email: 'vazio' } });
    expect(interpretarFormulario(entrada({ email: 'maria@exemplo' }))).toEqual({ tipo: 'invalido', erros: { email: 'invalido' } });
  });

  it('aponta os dois erros de uma vez', () => {
    expect(interpretarFormulario(entrada({ email: '', consentimento: false }))).toEqual({
      tipo: 'invalido',
      erros: { email: 'vazio', consentimento: true },
    });
  });

  it('isca preenchida é robô, mesmo com o resto certo', () => {
    expect(interpretarFormulario(entrada({ isca: 'http://spam.exemplo' }))).toEqual({ tipo: 'robo' });
  });

  it('isca preenchida ganha de qualquer erro: o robô não descobre o que errou', () => {
    expect(interpretarFormulario(entrada({ isca: 'x', email: '', consentimento: false }))).toEqual({ tipo: 'robo' });
  });

  it('isca só com espaços não é robô (preenchimento automático do navegador)', () => {
    expect(interpretarFormulario(entrada({ isca: '   ' })).tipo).toBe('enviar');
  });
});

describe('endpointSeguro', () => {
  it.each([['https://me-avisa.exemplo.com.br/pedido'], ['https://exemplo.workers.dev/'], ['/api/me-avisa']])('aceita %s', (endpoint) => {
    expect(endpointSeguro(endpoint)).toBe(true);
  });

  it.each([
    ['vazio', ''],
    ['http sem TLS', 'http://exemplo.com/pedido'],
    ['protocolo relativo', '//exemplo.com/pedido'],
    ['barra invertida que o navegador lê como host', '/\\exemplo.com'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/plain,oi'],
    ['ftp', 'ftp://exemplo.com/'],
    ['só o protocolo', 'https://'],
    ['senha na URL', 'https://usuario:senha@exemplo.com/pedido'],
    ['texto solto', 'endereço do servidor'],
    ['relativo sem barra', 'api/me-avisa'],
    ['caminho com espaço', '/api/me avisa'],
  ])('recusa %s', (_motivo, endpoint) => {
    expect(endpointSeguro(endpoint)).toBe(false);
  });
});

describe('meAvisaDisponivel (o formulário só existe com o flag ligado e um endpoint seguro)', () => {
  it('flag desligado: não renderiza, mesmo com endpoint', () => {
    expect(meAvisaDisponivel({ ativo: false, endpoint: 'https://exemplo.com/pedido' })).toBe(false);
  });

  it('flag ligado sem endpoint: não renderiza (coletaria e-mail para lugar nenhum)', () => {
    expect(meAvisaDisponivel({ ativo: true, endpoint: '' })).toBe(false);
  });

  it('flag ligado com endpoint inseguro: não renderiza', () => {
    expect(meAvisaDisponivel({ ativo: true, endpoint: 'http://exemplo.com/pedido' })).toBe(false);
  });

  it('flag ligado com endpoint https: renderiza', () => {
    expect(meAvisaDisponivel({ ativo: true, endpoint: 'https://exemplo.com/pedido' })).toBe(true);
  });

  it('o flag entregue nesta fase está desligado e sem endpoint', () => {
    expect(ME_AVISA).toEqual({ ativo: false, endpoint: '' });
    expect(meAvisaDisponivel(ME_AVISA)).toBe(false);
  });
});

describe('já pedi aviso (a única coisa guardada no aparelho: o slug, nunca o e-mail)', () => {
  it('começa sem nenhum pedido', () => {
    expect(jaPediuAviso(memoria(), 'sao-luis-ma')).toBe(false);
  });

  it('depois de registrar, aquela cidade já tem pedido e as outras não', () => {
    const lugar = memoria();
    expect(registrarPedido(lugar, 'sao-luis-ma')).toBe(true);
    expect(jaPediuAviso(lugar, 'sao-luis-ma')).toBe(true);
    expect(jaPediuAviso(lugar, 'natal-rn')).toBe(false);
  });

  it('o que fica gravado é só a lista de slugs', () => {
    const lugar = memoria();
    registrarPedido(lugar, 'sao-luis-ma');
    registrarPedido(lugar, 'natal-rn');
    expect(lugar.gravado()).toBe('["natal-rn","sao-luis-ma"]');
  });

  it('registrar a mesma cidade duas vezes não duplica', () => {
    const lugar = memoria();
    registrarPedido(lugar, 'sao-luis-ma');
    registrarPedido(lugar, 'sao-luis-ma');
    expect(lugar.gravado()).toBe('["sao-luis-ma"]');
  });

  it('guarda no máximo 50 cidades, descartando as mais antigas', () => {
    const lugar = memoria();
    for (let i = 0; i < 60; i++) registrarPedido(lugar, `cidade-${i}-sp`);
    const guardadas = JSON.parse(lugar.gravado() ?? '[]') as string[];
    expect(guardadas).toHaveLength(50);
    expect(guardadas[0]).toBe('cidade-59-sp');
    expect(jaPediuAviso(lugar, 'cidade-0-sp')).toBe(false);
  });

  it.each([['JSON truncado', '["sao-luis-ma"'], ['objeto', '{"a":1}'], ['número', '7'], ['null', 'null'], ['vazio', '']])(
    'conteúdo corrompido (%s) conta como nenhum pedido e não impede registrar',
    (_nome, bruto) => {
      const lugar = memoria(bruto);
      expect(jaPediuAviso(lugar, 'sao-luis-ma')).toBe(false);
      expect(registrarPedido(lugar, 'sao-luis-ma')).toBe(true);
      expect(lugar.gravado()).toBe('["sao-luis-ma"]');
    },
  );

  it('ignora o que não é texto na lista guardada', () => {
    const lugar = memoria('[1,null,{"email":"x@y.com"},"natal-rn"]');
    expect(jaPediuAviso(lugar, 'natal-rn')).toBe(true);
    registrarPedido(lugar, 'sao-luis-ma');
    expect(lugar.gravado()).toBe('["sao-luis-ma","natal-rn"]');
  });

  it('armazenamento bloqueado: não lança, não há pedido e registrar devolve false', () => {
    expect(jaPediuAviso(indisponivel, 'sao-luis-ma')).toBe(false);
    expect(registrarPedido(indisponivel, 'sao-luis-ma')).toBe(false);
    expect(jaPediuAviso(null, 'sao-luis-ma')).toBe(false);
    expect(registrarPedido(null, 'sao-luis-ma')).toBe(false);
  });
});

describe('textos do me avisa', () => {
  it('a promessa traz os dois envios, com hora e dia do início e o link da cidade', () => {
    expect(meAvisaPromessa('2026-10-25T17:00:00-03:00')).toBe(
      'Dois e-mails, e só dois: um às 17h do dia 25, com o link da sua cidade, e outro com o resultado final.',
    );
  });

  it('sem início conhecido, a promessa não inventa hora', () => {
    const texto = meAvisaPromessa(null);
    expect(texto).toContain('com o link da sua cidade');
    expect(texto).toContain('resultado final');
    expect(texto).not.toMatch(/\d/);
  });

  it('o consentimento diz a cidade, a finalidade restrita e quem usa o e-mail', () => {
    const texto = meAvisaConsentimento('Placar 2026', 'São Luís (MA)');
    expect(texto).toContain('São Luís (MA)');
    expect(texto).toContain('Placar 2026');
    expect(texto).toMatch(/só para isso/);
  });

  it('nenhuma palavra proibida do vocabulário fixo', () => {
    const textos = [meAvisaPromessa('2026-10-25T17:00:00-03:00'), meAvisaConsentimento('Placar 2026', 'Natal (RN)')];
    for (const texto of textos) for (const proibida of PALAVRAS_PROIBIDAS) expect(texto.toLowerCase()).not.toContain(proibida);
  });
});
