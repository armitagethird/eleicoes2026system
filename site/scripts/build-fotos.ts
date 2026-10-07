// Gera as fotos de candidatura do 13 e do 22 (src/assets/candidatos/{n}-{altura}.webp) a partir dos arquivos oficiais do
// TSE (Portal de Dados Abertos, licença CC-BY). Fonte e crédito em src/assets/candidatos/README.md.
//   1. Baixa (se ainda não estiver em .builds/fotos-cache, fora do git) o ZIP de fotos de candidatos a presidente e o ZIP
//      do cadastro de candidatos 2026.
//   2. Acha cada candidato no cadastro por número de urna, cargo PRESIDENTE e ano 2026, e CONFERE o nome de urna e o
//      partido: se o TSE trocar algo, o script para em vez de gerar a foto da pessoa errada. O SQ_CANDIDATO do cadastro
//      é o nome do arquivo da foto (FBR{SQ}_div.jpg).
//   3. Trata os dois do MESMO jeito: o mesmo recorte (a largura inteira do quadro oficial, que já enquadra rosto e
//      ombros, centrado, e só as bordas de baixo saem para chegar a 4:5), o mesmo tamanho e a mesma compressão.
//      Nenhum ajuste de cor, brilho, contraste ou nitidez: as cores ficam como na foto oficial.
// Os dois ZIPs são lidos direto por um leitor mínimo (sem unzip, tar ou PowerShell). Rodar: npm run fotos
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import sharp from 'sharp';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(SITE, '.builds', 'fotos-cache');
const DESTINO = join(SITE, 'src', 'assets', 'candidatos');

const ZIP_FOTOS = 'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_BR_div.zip';
const ZIP_CADASTRO = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip';
const CSV_PRESIDENCIA = 'consulta_cand_2026_BR.csv';

// Candidatos à presidência com foto no site. nomeUrna e partido são a conferência contra o cadastro do TSE.
const CANDIDATOS = [
  { n: 13, nomeUrna: 'LULA', partido: 'PT' },
  { n: 22, nomeUrna: 'FLAVIO BOLSONARO', partido: 'PL' },
];

// Caixa de exibição: altura em px CSS (cada uma sai em 1x e em 2x) e proporção largura/altura. A proporção e a largura
// (round(altura * RAZAO)) são as mesmas de lib/fotos.ts, que o teste lib/fotos.test.ts confere contra os arquivos.
const ALTURAS = [56];
const RAZAO = 4 / 5;
const DENSIDADES = [1, 2];
const WEBP = { quality: 90, effort: 6 };
const LIMITE_2X_BYTES = 8 * 1024;

async function baixar(url: string): Promise<Buffer> {
  const arquivo = join(CACHE, url.slice(url.lastIndexOf('/') + 1));
  if (!existsSync(arquivo)) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
    await mkdir(CACHE, { recursive: true });
    await writeFile(arquivo, Buffer.from(await resposta.arrayBuffer()));
    console.log(`baixado ${url} em ${new Date().toISOString()}`);
  }
  return readFile(arquivo);
}

/** Leitor mínimo de ZIP (diretório central; entradas guardadas ou deflate): nome -> conteúdo. */
function lerZip(zip: Buffer): Map<string, Buffer> {
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error('ZIP sem diretório central');
  const entradas = new Map<string, Buffer>();
  let posicao = zip.readUInt32LE(fim + 16);
  for (let i = 0, total = zip.readUInt16LE(fim + 10); i < total; i++) {
    if (zip.readUInt32LE(posicao) !== 0x02014b50) throw new Error('ZIP: entrada do diretório central inválida');
    const metodo = zip.readUInt16LE(posicao + 10);
    const comprimido = zip.readUInt32LE(posicao + 20);
    const nome = zip.toString('utf8', posicao + 46, posicao + 46 + zip.readUInt16LE(posicao + 28));
    const local = zip.readUInt32LE(posicao + 42);
    posicao += 46 + zip.readUInt16LE(posicao + 28) + zip.readUInt16LE(posicao + 30) + zip.readUInt16LE(posicao + 32);
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const dados = zip.subarray(inicio, inicio + comprimido);
    if (metodo !== 0 && metodo !== 8) throw new Error(`ZIP: método de compressão ${metodo} não suportado (${nome})`);
    entradas.set(nome, metodo === 0 ? dados : inflateRawSync(dados));
  }
  return entradas;
}

/** CSV do TSE: separador ";", textos entre aspas. */
function linhasCsv(texto: string): Array<Record<string, string>> {
  const registros = texto
    .split(/\r?\n/)
    .filter(Boolean)
    .map((linha) => {
      const campos: string[] = [];
      let atual = '';
      let aspas = false;
      for (const c of linha) {
        if (c === '"') aspas = !aspas;
        else if (c === ';' && !aspas) {
          campos.push(atual);
          atual = '';
        } else atual += c;
      }
      return [...campos, atual];
    });
  const [cabecalho, ...dados] = registros;
  return dados.map((campos) => Object.fromEntries(cabecalho.map((nome, i) => [nome, campos[i]])));
}

const cadastro = lerZip(await baixar(ZIP_CADASTRO));
const fotos = lerZip(await baixar(ZIP_FOTOS));
const csv = cadastro.get(CSV_PRESIDENCIA);
if (!csv) throw new Error(`${CSV_PRESIDENCIA} não está em ${ZIP_CADASTRO}`);
const candidatos = linhasCsv(new TextDecoder('latin1').decode(csv));

await mkdir(DESTINO, { recursive: true });
const fontes: Array<{ n: number; sq: string; arquivo: string; jpeg: Buffer }> = [];
for (const { n, nomeUrna, partido } of CANDIDATOS) {
  const achados = candidatos.filter(
    (c) => c.ANO_ELEICAO === '2026' && c.DS_CARGO === 'PRESIDENTE' && c.SG_UE === 'BR' && c.NR_TURNO === '1' && c.NR_CANDIDATO === String(n),
  );
  if (achados.length !== 1) throw new Error(`Esperava 1 candidato a presidente com o número ${n} em 2026, achei ${achados.length}`);
  const [c] = achados;
  if (c.NM_URNA_CANDIDATO !== nomeUrna || c.SG_PARTIDO !== partido) {
    throw new Error(`O ${n} no cadastro do TSE é "${c.NM_URNA_CANDIDATO}" (${c.SG_PARTIDO}), esperava "${nomeUrna}" (${partido})`);
  }
  const arquivo = `FBR${c.SQ_CANDIDATO}_div.jpg`;
  const jpeg = fotos.get(arquivo);
  if (!jpeg) throw new Error(`${arquivo} (SQ_CANDIDATO ${c.SQ_CANDIDATO}, ${n} ${nomeUrna}) não está em ${ZIP_FOTOS}`);
  fontes.push({ n, sq: c.SQ_CANDIDATO, arquivo, jpeg });
}

// Mesmo recorte para os dois só vale se os dois quadros oficiais têm o mesmo tamanho.
const medidas = await Promise.all(fontes.map(async ({ jpeg }) => sharp(jpeg).metadata()));
const { width: larguraFonte = 0, height: alturaFonte = 0 } = medidas[0];
if (medidas.some((m) => m.width !== larguraFonte || m.height !== alturaFonte)) {
  throw new Error(`Os quadros oficiais têm tamanhos diferentes (${medidas.map((m) => `${m.width}x${m.height}`).join(' e ')}): o recorte não seria igual`);
}
const alturaCorte = Math.round(larguraFonte / RAZAO);
if (alturaCorte > alturaFonte) throw new Error(`O quadro ${larguraFonte}x${alturaFonte} é mais largo que ${RAZAO}: o recorte vertical não cabe`);
const corte = { left: 0, top: 0, width: larguraFonte, height: alturaCorte };

console.log(`fonte ${larguraFonte}x${alturaFonte}, recorte ${corte.width}x${corte.height} a partir do topo (largura inteira)`);
const kb = (bytes: number) => (bytes / 1024).toFixed(2);
for (const { n, sq, arquivo, jpeg } of fontes) {
  const origem = createHash('sha256').update(jpeg).digest('hex');
  console.log(`${n}  SQ_CANDIDATO ${sq}  ${arquivo}  sha256 ${origem.slice(0, 16)}  ${kb(jpeg.length)} KB`);
  for (const altura of ALTURAS) {
    for (const densidade of DENSIDADES) {
      const largura = Math.round(altura * RAZAO * densidade);
      const px = Math.round(altura * densidade);
      const webp = await sharp(jpeg).extract(corte).resize(largura, px, { fit: 'fill', kernel: 'lanczos3' }).webp(WEBP).toBuffer();
      if (densidade === 2 && webp.length > LIMITE_2X_BYTES) throw new Error(`${n}-${px}.webp pesa ${kb(webp.length)} KB, acima de ${kb(LIMITE_2X_BYTES)} KB`);
      await writeFile(join(DESTINO, `${n}-${px}.webp`), webp);
      console.log(`    ${n}-${px}.webp  ${largura}x${px}  ${kb(webp.length)} KB`);
    }
  }
}
