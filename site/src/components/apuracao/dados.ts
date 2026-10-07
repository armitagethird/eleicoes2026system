// Rede da /apuracao. Histórico: /mapa/{id}.json, baixado uma vez por aba aberta (o arquivo não muda depois do build, então
// o cache do navegador serve as próximas visitas). Ao vivo: /data/apuracao.json a cada 20 s com If-None-Match, pausando
// com a aba oculta. Quem decide o que fazer com cada leitura é lib/apuracao-dados.ts.
import { lerIndice, mesclarAoVivo, urlCamada, type IdCamada, type Lugar } from '../../lib/apuracao-dados.ts';
import { lerCamada, type Camada } from '../../lib/camada-mapa.ts';
import { parseStatus, type Status } from '../../lib/status.ts';

export const INTERVALO = 20_000;

async function pedirJson(url: string, init?: RequestInit): Promise<unknown> {
  const resposta = await fetch(url, init);
  if (!resposta.ok) throw new Error(`${url} respondeu ${resposta.status}`);
  return resposta.json();
}

const camadas = new Map<IdCamada, Promise<Camada>>();

/** Uma camada histórica, um pedido só por sessão; se falhar, o próximo pedido tenta de novo. */
export function carregarHistorica(id: Exclude<IdCamada, 'ao-vivo'>): Promise<Camada> {
  let pedido = camadas.get(id);
  if (!pedido) {
    pedido = pedirJson(urlCamada(id), { cache: 'force-cache' }).then((bruto) => {
      const camada = lerCamada(bruto);
      if (!camada) throw new Error(`${urlCamada(id)} não tem o formato de camada`);
      return camada;
    });
    pedido.catch(() => camadas.delete(id));
    camadas.set(id, pedido);
  }
  return pedido;
}

let indice: Promise<Map<number, Lugar>> | null = null;

/** Índice IBGE -> slug, nome e UF (gerado no build); baixado só quando a página precisa de um nome. */
export function carregarIndice(): Promise<Map<number, Lugar>> {
  if (!indice) {
    indice = pedirJson('/mapa/municipios.json').then(lerIndice);
    indice.catch(() => (indice = null));
  }
  return indice;
}

export const lerStatus = async (): Promise<Status> => parseStatus(await pedirJson('/data/status.json', { cache: 'no-store' }));

export interface AoVivo {
  /** Pede agora (fora do ritmo dos 20 s), por exemplo ao abrir a aba do ao vivo. */
  agora(): void;
  parar(): void;
}

/**
 * Lê o ao vivo a cada 20 s enquanto a aba do navegador está visível. A cada leitura chama `aoLer` com a camada vigente
 * (nunca uma mais velha que a anterior) e se a última leitura falhou. Para sozinho quando `continuar` devolve false.
 */
export function vigiarAoVivo(aoLer: (camada: Camada | null, falhou: boolean) => void, continuar: () => boolean): AoVivo {
  let etag: string | null = null;
  let atual: Camada | null = null;
  let timer: number | undefined;
  let emCurso = false;
  let parado = false;

  const ler = async (): Promise<void> => {
    if (emCurso || parado) return;
    emCurso = true;
    clearTimeout(timer);
    let falhou = false;
    try {
      // no-store: o navegador não guarda nem revalida por conta própria, então o 304 chega aqui e o ETag é o nosso.
      const resposta = await fetch(urlCamada('ao-vivo'), { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {} });
      if (resposta.status !== 304) {
        if (!resposta.ok) throw new Error(`${urlCamada('ao-vivo')} respondeu ${resposta.status}`);
        const nova = lerCamada(await resposta.json());
        if (!nova) throw new Error(`${urlCamada('ao-vivo')} não tem o formato de camada`);
        atual = mesclarAoVivo(atual, nova);
        etag = resposta.headers.get('ETag');
      }
    } catch {
      // Falha de rede: o que está na tela fica, com o aviso de sem conexão; o próximo ciclo tenta de novo.
      falhou = true;
    } finally {
      emCurso = false;
    }
    aoLer(atual, falhou);
    if (continuar() && !document.hidden && !parado) timer = window.setTimeout(ler, INTERVALO);
  };

  const aoMudarVisibilidade = (): void => {
    clearTimeout(timer);
    if (!document.hidden) void ler();
  };
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  void ler();

  return {
    agora: () => void ler(),
    parar: () => {
      parado = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    },
  };
}
