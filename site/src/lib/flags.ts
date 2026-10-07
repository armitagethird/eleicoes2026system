// Interruptores de funcionalidade. Mudar o valor aqui é a única forma de ligar uma feature em produção.

export interface FlagMeAvisa {
  ativo: boolean;
  /** Para onde vai o POST do formulário. Precisa ser https (ou um caminho do próprio site): ver endpointSeguro em me-avisa.ts. */
  endpoint: string;
}

/**
 * "Me avisa" (brief, seção 4): coleta e-mail, que é dado pessoal (LGPD). Desligado, o formulário NÃO renderiza.
 * Antes de ligar: endpoint real, política de privacidade publicada e os textos de consentimento aprovados pelo Romero.
 */
export const ME_AVISA: FlagMeAvisa = { ativo: false, endpoint: '' };

/**
 * og:image própria de cada cidade (/og/{slug}.png). Desligado, as cidades usam /og/fallback.png: os PNGs por cidade só existem
 * com o renderizador (Fase 4, SVG -> PNG), e apontar para um arquivo que não existe deixa o preview do link no X sem imagem (404).
 */
export const OG_POR_CIDADE = false;
