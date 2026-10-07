# Fotos de candidatura (13 e 22)

Fotos oficiais de candidatura do TSE para os dois candidatos do 2º turno de 2026 à presidência, usadas só nos placares do site (home, UF, cidade e painel da apuração), com o crédito **Foto: TSE**. Nunca no card compartilhado (decisão do Romero, 06/10/2026; brief, seção 4). Gerado por `npm run fotos`; não editar à mão.

## Fonte

Portal de Dados Abertos do TSE, conjunto de dados **Candidatos - 2026** (https://dadosabertos.tse.jus.br/dataset/candidatos-2026), licença Creative Commons Atribuição (CC-BY); o crédito "Foto: TSE" é a atribuição. Baixado em **06/10/2026, 23:23 (UTC-3)**.

| Arquivo | URL exata | Atualizado pelo TSE em | SHA-256 |
|---|---|---|---|
| Fotos de candidatos, presidente (`foto_cand2026_BR_div.zip`, 294 KB) | https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_BR_div.zip | 06/10/2026 06:18 GMT | `e0fb3f9bb7373457437706d01243bc6b518b4bad78234dac29fe0e7494bbb8cc` |
| Cadastro de candidatos (`consulta_cand_2026.zip`, 3,2 MB; usado `consulta_cand_2026_BR.csv`) | https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip | 05/10/2026 16:42 GMT (CSV gerado em 05/10/2026 10:14) | `78458909d860748f54b3e07e9ab197e1e0a2b3226a0f8d051b615225d7fcc62f` |

O `leiame.pdf` do ZIP de fotos explica o nome do arquivo: `FBR{SQ_CANDIDATO}_div.jpg`, em que `div` significa foto divulgável (a que a candidata ou o candidato enviou ao TSE) e o SQ é a chave do cadastro.

| Número | Cargo, ano | Nome de urna no TSE | Partido | SQ_CANDIDATO | Foto no ZIP | SHA-256 da foto original |
|---|---|---|---|---|---|---|
| 13 | PRESIDENTE, 2026 | LULA (LUIZ INÁCIO LULA DA SILVA) | PT | 280002542548 | `FBR280002542548_div.jpg` | `7355fb81cb690d57fe915539390218a85cc5710e5ccf98de01df167e7ccfefc4` |
| 22 | PRESIDENTE, 2026 | FLAVIO BOLSONARO (FLAVIO NANTES BOLSONARO) | PL | 280002551544 | `FBR280002551544_div.jpg` | `ace3990fdc7ec22b49acc1a60880ddb1c8bb1bc0cf0a593a3bb9cc9406eac78d` |

O script acha cada candidato no cadastro por número de urna, cargo PRESIDENTE e ano 2026, confere nome de urna e partido (se o TSE mudar algo, para sem gerar nada) e só então abre a foto do SQ encontrado. Os ZIPs ficam em `site/.builds/fotos-cache/`, fora do git, e o script os baixa de novo se faltarem.

## Tratamento (igual para os dois)

- **Recorte:** a largura inteira do quadro oficial (161 × 225 px, que já enquadra rosto e ombros, centrado) e só a borda de baixo sai, para chegar a 4:5 (161 × 201 px, a partir do topo). O script para se os dois quadros não tiverem o mesmo tamanho.
- **Tamanho:** caixa de 45 × 56 px (1x) e 90 × 112 px (2x), reamostragem Lanczos.
- **Compressão:** WebP com qualidade 90 e esforço 6, os mesmos parâmetros para os dois.
- **Cor:** nenhum ajuste de cor, brilho, contraste ou nitidez. As cores ficam como na foto oficial.

## Arquivos

`{número}-{altura}.webp`: a altura é a da caixa em px CSS (56, 1x) ou o dobro dela (112, 2x). A largura é `round(altura × 4/5)`.

| Arquivo | Dimensão | Peso |
|---|---|---|
| `13-56.webp` | 45 × 56 | 1,27 KB |
| `13-112.webp` | 90 × 112 | 2,89 KB |
| `22-56.webp` | 45 × 56 | 1,22 KB |
| `22-112.webp` | 90 × 112 | 2,74 KB |

Meta: até 8 KB por arquivo 2x (o script falha acima disso).
