---
title: Impressão multicabeças
slug: multi-head-printing
order: 65
description: Planeia atribuições de filamentos, recargas das cabeças e exportações 3MF para impressão multicabeças.
---

# Impressão multicabeças

O modo multicabeças reorganiza o empilhamento imprimível escolhido pelo [Auto-paint](auto-paint). Cada região da imagem pode usar um filamento diferente na mesma camada. Várias cabeças mantêm os filamentos disponíveis entre recargas manuais; a análise procura melhores correspondências de cor previstas e planeia as recargas necessárias. Pode haver menos pausas, mas isso não é garantido.

## Requisitos

- Usa **Auto-paint** com pelo menos um filamento na lista e ativa o **Modo multicabeças**.
- Escolhe **2–8 cabeças** e uma **Profundidade da pesquisa**, depois **Criar modelo 3D**. A análise precisa de pelo menos dois filamentos disponíveis para formar uma janela útil.

O modo multicabeças e **Flat Paint** excluem-se mutuamente. Calibra os filamentos que realmente tens; consulta [Teoria da calibração](calibration-theory). O modo, o número de cabeças e a profundidade da pesquisa são guardados entre sessões. Cria novamente o modelo após alterares os dados.

## Sequências e janelas

Uma **sequência** é um bloco contínuo de camadas que usam um único filamento no empilhamento Auto-paint. A sua espessura vem do resultado imprimível do Auto-paint, incluindo calibração e limites de altura, e não apenas da luminosidade da imagem original.

Uma **janela** abrange N sequências consecutivas. N é limitado pelo número de cabeças escolhido, pelos filamentos disponíveis e pelas sequências acima da primeira, que mantém sempre o seu filamento; as cabeças desnecessárias ficam assinaladas como **VAZIA** no plano das cabeças. A análise seleciona janelas úteis sem sobreposição; não agrupa automaticamente todas as sequências. As sequências fora das janelas selecionadas mantêm o filamento planeado e são incluídas no plano das cabeças.

![Sequências de cor agrupadas em janelas de exemplo; as restantes mantêm o filamento planeado.](01_window_run_diagram.svg)

## Escolher filamentos por janela

Com K filamentos distintos numa janela e N posições de sequência, existem **K^N** ordens possíveis, incluindo repetições. A análise compara as misturas previstas através da diferença de cor **ΔE** e atribui uma ordem a cada região de cor da imagem. Uma posição de sequência não é uma cabeça física fixa: o plano associa os filamentos necessários às cabeças.

![Mudar a ordem dos mesmos filamentos altera a mistura prevista; as cores são esquemáticas.](03_beer_lambert_blending.svg)

![As 27 ordens para três filamentos e três posições, com uma tabela que mostra o crescimento de K^N.](05_combo_search_space.svg)

A **Profundidade da pesquisa** controla o limiar de seleção das janelas, quantas podem ser selecionadas e quantas ordens são testadas:

- **Rápido** usa menos iterações de seleção de janelas e um orçamento de combinações menor.
- **Equilibrado** é o compromisso predefinido entre esforço e cobertura.
- **Minucioso** permite mais janelas e um orçamento maior; pode continuar a usar amostragem em espaços de pesquisa grandes.

Dentro do orçamento de cada profundidade, todas as combinações são testadas. Os espaços maiores usam uma amostra limitada e determinística, juntamente com a ordem atual. Entradas idênticas dão resultados repetíveis. Todas as profundidades consideram as mesmas cores da imagem; uma pesquisa mais profunda não garante uma impressão física melhor. Para o agrupamento das cores alvo, consulte [Agrupamento de cores](#color-grouping).

## Agrupamento de cores

Antes da pesquisa, o Kromacut agrupa a paleta nas cores alvo que tentará reproduzir. O controlo **Agrupamento de cores** define como:

- **Por camada (atual)** — as cores associadas à mesma camada de impressão no resultado do Auto-paint são reunidas num único alvo. Tonalidades diferentes podem, por isso, partilhar um alvo. Existe, no máximo, um grupo alvo por camada ocupada.
- **Por cor (tonalidade)** — as tonalidades distintas podem permanecer como alvos separados nas suas camadas de impressão originais. As paletas grandes são reduzidas dentro de um limite de grupos, mantendo pelo menos um grupo por camada ocupada; as cores de camadas diferentes nunca são unidas.

O agrupamento por cor não garante um erro de cor menor nem mais cores impressas. Os resultados dependem da imagem, da calibração dos filamentos, do número de cabeças e das janelas selecionadas. A pesquisa minimiza a diferença de cor CIE76; uma pontuação de pesquisa menor pode ainda assim ter um erro CIEDE2000 maior. A construção pode demorar mais. As cores que pode imprimir continuam limitadas pelos filamentos e pelas suas pilhas físicas.

O agrupamento de cores é guardado assim que o altera, antes da construção. Reconstrua com cada opção e compare as pré-visualizações da sua imagem.

## Plano das cabeças e exportação

Após uma criação bem-sucedida, a pré-visualização mostra a cor simulada atribuída a cada região. **Cores físicas** mostra o filamento real. Abre as **Instruções de impressão** e segue o **Plano das cabeças**:

- Antes de imprimir, carrega cada filamento indicado na respetiva cabeça numerada. Deixa as cabeças assinaladas como **VAZIA** sem utilização.
- Em cada ponto de controlo de camada indicado, recarrega apenas as cabeças assinaladas. As cargas inalteradas são mantidas; nem todos os limites de janela exigem uma pausa.
- Exporta em **3MF** para preservar a geometria distribuída, as cores físicas dos filamentos e as atribuições às cabeças. O ficheiro regista o número de cabeças escolhido como número de extrusores e adiciona marcadores de pausa **M600** nos pontos de mudança do plano. STL não preserva estas atribuições.

![Três cabeças mantêm os filamentos inalterados entre fases; apenas as cargas modificadas exigem recargas manuais.](02_nozzle_swap_schedule.svg)

Usa uma impressora multicabeças compatível. Antes de imprimir, verifica no programa de corte as associações das cabeças, as alturas da primeira camada e das camadas normais e o tratamento das pausas. Um ponto de controlo pode exigir a recarga de várias cabeças.

## Alternativa e reconstrução

Se a análise falhar ou não encontrar uma disposição utilizável que melhore o empilhamento normal, é criado um modelo normal de uma só cabeça com um aviso, a cor inicial e as instruções de mudança originais. Experimenta outros filamentos, outro número de cabeças ou outra profundidade e cria novamente o modelo.

A análise decorre em segundo plano. Sair do painel 3D ou mudar a imagem cancela a análise pendente; cria novamente o modelo para a nova imagem. As instruções e exportações descrevem o modelo criado: volta a criá-lo para aplicar alterações às definições.

A seguir: [Gerar e exportar resultados](generating-exporting-output).
