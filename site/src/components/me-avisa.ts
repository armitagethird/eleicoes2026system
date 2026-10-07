// Ilha do formulário Me avisa (MeAvisa.astro). Só é carregada quando o formulário existe (flag ligado).
// O e-mail é dado pessoal: sai do navegador uma única vez, no corpo de um POST (nunca em query string), sem cookies, e depois do
// envio some do campo. O aparelho guarda só "já pedi aviso para esta cidade" (o slug). Os textos vêm prontos do HTML (data-msg-*).
import { armazenamentoLocal } from '../lib/armazenamento.ts';
import { interpretarFormulario, jaPediuAviso, registrarPedido, validarEmail } from '../lib/me-avisa.ts';

const TEMPO_LIMITE_MS = 10_000;

/** Falha cedo e dizendo o quê: o HTML é nosso, então um gancho ausente é bug de componente, não caso de uso. */
function achar<T extends HTMLElement>(raiz: ParentNode, seletor: string): T {
  const elemento = raiz.querySelector<T>(seletor);
  if (!elemento) throw new Error(`Me avisa: falta ${seletor} no HTML do formulário`);
  return elemento;
}

function iniciar(raiz: HTMLElement): void {
  const { cidade, endpoint, msgVazio, msgInvalido, msgConsentimento, msgFalha } = raiz.dataset;
  if (!cidade || !endpoint) throw new Error('Me avisa: faltam data-cidade e data-endpoint no HTML do formulário');
  const form = achar<HTMLFormElement>(raiz, 'form');
  const email = achar<HTMLInputElement>(raiz, '[data-email]');
  const caixa = achar<HTMLInputElement>(raiz, '[data-consentimento]');
  const isca = achar<HTMLInputElement>(raiz, '[data-isca]');
  const erroEmail = achar(raiz, '[data-erro-email]');
  const erroCaixa = achar(raiz, '[data-erro-consentimento]');
  const aviso = achar(raiz, '[data-aviso]');
  const enviar = achar<HTMLButtonElement>(raiz, '[data-enviar]');
  const enviado = achar(raiz, '[data-enviado]');
  const emailEcoado = achar(raiz, '[data-ok-email]');
  const outro = achar(raiz, '[data-outro]');

  // Com JS a validação é nossa (mensagens no lugar certo); sem JS vale a nativa dos atributos required e type=email.
  form.noValidate = true;

  // aria-disabled, não disabled: um botão desabilitado perde o foco, e na falha o teclado ficaria sem lugar. O toque repetido
  // durante o envio morre no submit (estado "enviando").
  const estado = (novo: 'pronto' | 'enviando' | 'enviado' | 'falhou' | 'ja-pediu'): void => {
    raiz.dataset.estado = novo;
    if (novo === 'enviando') enviar.setAttribute('aria-disabled', 'true');
    else enviar.removeAttribute('aria-disabled');
    form.toggleAttribute('aria-busy', novo === 'enviando');
  };

  const erro = (campo: HTMLInputElement, lugar: HTMLElement, texto: string | undefined): void => {
    lugar.textContent = texto ?? '';
    lugar.hidden = texto === undefined;
    if (texto === undefined) campo.removeAttribute('aria-invalid');
    else campo.setAttribute('aria-invalid', 'true');
  };

  const concluir = (enderecoDigitado: string): void => {
    emailEcoado.textContent = enderecoDigitado;
    form.reset();
    estado('enviado');
    enviado.focus();
  };

  if (jaPediuAviso(armazenamentoLocal(), cidade)) estado('ja-pediu');

  outro.addEventListener('click', () => {
    estado('pronto');
    email.focus();
  });

  // O erro some assim que o campo é corrigido; só o envio volta a acusar.
  email.addEventListener('input', () => {
    if (validarEmail(email.value).ok) erro(email, erroEmail, undefined);
  });
  caixa.addEventListener('change', () => {
    if (caixa.checked) erro(caixa, erroCaixa, undefined);
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (raiz.dataset.estado === 'enviando') return;

    const resultado = interpretarFormulario({ email: email.value, consentimento: caixa.checked, isca: isca.value, cidade });
    aviso.textContent = '';
    if (resultado.tipo === 'invalido') {
      const { erros } = resultado;
      erro(email, erroEmail, erros.email && (erros.email === 'vazio' ? msgVazio : msgInvalido));
      erro(caixa, erroCaixa, erros.consentimento && msgConsentimento);
      (erros.email ? email : caixa).focus();
      return;
    }
    erro(email, erroEmail, undefined);
    erro(caixa, erroCaixa, undefined);
    // Robô: a tela agradece como se tivesse enviado, mas nada sai do navegador e nada é registrado.
    if (resultado.tipo === 'robo') return concluir(email.value.trim());

    estado('enviando');
    try {
      const resposta = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultado.pedido),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      if (!resposta.ok) throw new Error(`O endpoint respondeu ${resposta.status}`);
      registrarPedido(armazenamentoLocal(), cidade);
      concluir(resultado.pedido.email);
    } catch {
      estado('falhou');
      aviso.textContent = msgFalha ?? '';
    }
  });
}

for (const raiz of document.querySelectorAll<HTMLElement>('[data-me-avisa]')) iniciar(raiz);
