// Minhas cidades: até 5 cidades no localStorage, da mais recente para a mais antiga. Só slug, nome e UF; nunca dado pessoal.
// O que vem do localStorage é entrada não confiável (outra aba, extensão, edição à mão): cada item é revalidado e recriado
// com os três campos, porque o slug vira href e o nome vira texto na home.
import { UFS, type UF } from './contratos.ts';

export interface CidadeSalva {
  slug: string;
  nome: string;
  uf: UF;
}

export const CHAVE_MINHAS_CIDADES = 'minhas-cidades';
export const LIMITE_MINHAS_CIDADES = 5;

/** O pedaço do Storage que importa aqui: o localStorage de verdade ou um falso nos testes. */
export type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAMANHO_MAXIMO = 80;

function cidadeValida(item: unknown): CidadeSalva | null {
  if (typeof item !== 'object' || item === null) return null;
  const { slug, nome, uf } = item as Record<string, unknown>;
  if (typeof slug !== 'string' || typeof nome !== 'string' || typeof uf !== 'string') return null;
  const nomeLimpo = nome.trim();
  const ok = SLUG.test(slug) && slug.length <= TAMANHO_MAXIMO && nomeLimpo !== '' && nomeLimpo.length <= TAMANHO_MAXIMO;
  return ok && UFS.includes(uf as UF) ? { slug, nome: nomeLimpo, uf: uf as UF } : null;
}

/** Lê e saneia a lista. Armazenamento ausente, indisponível ou corrompido dá lista vazia, nunca exceção. */
export function lerCidades(armazenamento: Armazenamento | null): CidadeSalva[] {
  let bruto: unknown;
  try {
    bruto = JSON.parse(armazenamento?.getItem(CHAVE_MINHAS_CIDADES) || 'null');
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];
  const vistas = new Set<string>();
  const lista: CidadeSalva[] = [];
  for (const item of bruto) {
    const cidade = cidadeValida(item);
    if (cidade && !vistas.has(cidade.slug)) {
      vistas.add(cidade.slug);
      lista.push(cidade);
    }
  }
  return lista.slice(0, LIMITE_MINHAS_CIDADES);
}

/** false quando o navegador recusa gravar (cota cheia, modo privado, armazenamento bloqueado). */
export function guardarCidades(armazenamento: Armazenamento | null, lista: readonly CidadeSalva[]): boolean {
  try {
    armazenamento?.setItem(CHAVE_MINHAS_CIDADES, JSON.stringify(lista));
    return armazenamento !== null;
  } catch {
    return false;
  }
}

/** A cidade vai para a frente; se já estava na lista, não duplica; passou de 5, sai a mais antiga. */
export function adicionarCidade(lista: readonly CidadeSalva[], cidade: CidadeSalva): CidadeSalva[] {
  const nova = cidadeValida(cidade);
  if (!nova) return [...lista];
  return [nova, ...lista.filter(({ slug }) => slug !== nova.slug)].slice(0, LIMITE_MINHAS_CIDADES);
}

export function removerCidade(lista: readonly CidadeSalva[], slug: string): CidadeSalva[] {
  return lista.filter((cidade) => cidade.slug !== slug);
}

export function estaSalva(lista: readonly CidadeSalva[], slug: string): boolean {
  return lista.some((cidade) => cidade.slug === slug);
}
