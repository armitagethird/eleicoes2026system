# Placar 2026

Site de resultados do 2º turno das eleições de 2026 (25/10), em tempo real, mobile-first, feito por uma pessoa só. O card da cidade é o produto.

**Fonte de verdade: `BRIEF-FRONTEND.md`.** Se algo do brief conflitar com o código ou com o que você descobrir, pare e pergunte. Nunca decida sozinho sobre cor, ordem de candidatos ou vocabulário.

## Regras inegociáveis (brief, seção 4)

- Candidatos sempre na mesma ordem, a do número de urna (13 antes de 22), em todo lugar, independentemente de quem lidera.
- Cor fixa por candidato (decisão do Romero, 06/10): 13 Lula = vermelho `--cand-13`, 22 Flávio = azul claro `--cand-22`, iguais em todo o site, card e mapa; quem lidera se diz em texto ("lidera"), não em cor. Exceção aprovada pelo Romero (06/10): no muro de 28 da home, a sigla da UF fica na cor de quem tem mais votos ali (a placa não é pintada). Tema Brasil leve (06/10): fundo levemente esverdeado; `--verde` e `--amarelo` só em detalhes de marca (faixa, wordmark, favicon); `--accent` (amarelo-ouro) só no selo; nunca em dado de candidato. Vermelho e azul nunca como cor de marca. Nenhum rótulo ideológico.
- Pesquisas (decisão do Romero, 06/10): só as registradas no TSE, cada uma com período, margem de erro, nível de confiança, entrevistas, instituto/contratante e número de registro visíveis (Res. TSE 23.600, art. 10; sem isso a multa vai de R$ 53 mil a R$ 106 mil). Nunca média/agregador, enquete ou odds de apostas (Polymarket é proibido no Brasil). Critério de seleção aprovado (06/10): a pesquisa mais recente de cada um dos institutos mais precisos no 1º turno de 2026 (hoje Gerp, Quaest, PoderData). Dado fictício de pesquisa NUNCA em `src/data/` (divulgar pesquisa falsa é crime): exemplos só no playground.
- Vocabulário só de `src/lib/copy.ts`: "lidera" em parcial; "eleito(a)" somente com `eleito: true` no JSON (nunca inferir de percentual); nunca "venceu", "virada confirmada", "projeção". Todo card traz `parcial · X% das seções · Fonte: TSE · HH:MM`.
- Sem fotos de candidatos: só nome, número e partido em texto.
- Palpite é local (`localStorage`), nunca enviado a servidor, nunca agregado. "Me avisa": consentimento explícito em texto; o POST vai para um endpoint placeholder atrás de feature flag.
- As 28 bandeiras (Brasil + 27 UFs) sempre intactas (Lei 5.700/1971), no mesmo tamanho; o Brasil nunca em destaque.
- Nome, domínio, @ e chave Pix só via `src/lib/site.ts`; nunca em componente ou template.
- Todo número que atualiza usa `tabular-nums` (já global em `base.css`).
- Site 100% estático (Astro `output: 'static'`, sem SSR). Dados ao vivo = JSON em `/data/*`, `fetch` a cada 20 s. Página de cidade com no máximo 50 KB de JS gzip. Sem React, Tailwind, UI kit, libs de gráfico ou autocomplete, 3D. Home: mapa só por UF (muro de 28). `/apuracao` (decisão do Romero, 06/10): mapa municipal real (5.571 polígonos do IBGE, projetados no build, desenhados em canvas, sem lib de mapa). Camadas de dados no formato de `src/lib/camada-mapa.ts`.

Decisões já tomadas: o Brasil tem **5.571** municípios (ler a contagem da fonte, nunca fixar 5.570); `hist.t2_2022` é nullable; o card de governador mostra a margem entre os dois, não variação vs 2022; `PIX_KEY` vazio = bloco Pix oculto.

## Estrutura

```
/site        Astro 7 + Preact. src/{pages,components,lib,styles,data,assets}, scripts/, tests/
/contracts   schemas/ (JSON Schema 2020-12), fixtures/ (geradas), scripts/fixtures.ts
/design      (Fase 1) TOKENS.md, prints
/worker, /renderer   depois; não construir agora
```

## Comandos (em `/site`)

```
npm run dev | build | preview
npm test                      # Vitest: format, copy, status, slug, schemas + fixtures
npm run check                 # astro check
npm run fixtures              # gera contracts/fixtures e copia para public/data (--modo=live|final troca status.json)
npm run fonts | flags         # regeram public/fonts e src/assets/flags (só se mudar a fonte/bandeira)
```

Scripts `.ts` rodam direto no Node 24 (type stripping): só sintaxe apagável (sem `enum`), imports relativos com extensão `.ts`. Sem Python neste projeto.

`site/public/data/` é gerado e fica fora do git: são fixtures fictícias, não podem ir para produção por acidente.

## Commits

Em português, no imperativo, um por item concluído, sem trailer `Co-Authored-By`.
