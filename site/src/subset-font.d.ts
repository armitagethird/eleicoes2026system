// subset-font 2.9 não publica tipos (o @types/subset-font é da 2.3 e não cobre variationAxes/keepFeatures).
declare module 'subset-font' {
  interface Opcoes {
    targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype';
    keepFeatures?: string[];
    variationAxes?: Record<string, number | { min?: number; max?: number; default?: number }>;
    preserveNameIds?: number[];
    noHinting?: boolean;
    dropTables?: string[];
  }
  export default function subsetFont(fonte: Uint8Array, texto: string, opcoes?: Opcoes): Promise<Buffer>;
}
