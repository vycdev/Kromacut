---
title: Modo 3D
slug: 3d-mode
order: 60
description: Dimensões físicas, empilhamentos manuais de cor, malhas e controlos de pré-visualização.
---

# Modo 3D

O modo 3D transforma cores em camadas físicas. Prepare a imagem em 2D, escolha dimensões e método de impressão e clique em **Gerar modelo 3D**. Alterar uma definição não regenera automaticamente o modelo mostrado.

Use **Manual** para escolher ordem e espessuras. Use **Pintura automática** para prever misturas dos filamentos reais e encontrar um empilhamento. Nenhum controla a impressora: exporte e verifique no laminador.

## Definições de impressão 3D

| Controlo | Efeito no modelo | O que verificar |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Tamanho do píxel (XY)** | Milímetros por píxel nas duas direções horizontais. | O indicador **Modelo** estima largura, altura e profundidade antes da geração. |
| **Altura de camada** | Passo vertical normal de alturas e trocas. | Corresponda ao laminador. Camadas menores dão alturas mais finas, não extrusões mais estreitas. |
| **Altura da primeira camada** | Primeiro passo acima da placa. | Corresponda separadamente. A primeira cor deve ter pelo menos a maior das alturas normal e inicial. |
| **Largura de linha efetiva** | Extrusão usada nas verificações de detalhe e pontilhamento de altura. | Corresponda à linha prevista no laminador, não ao bico nem ao píxel. Não muda o perfil da impressora. |
| **Malha suavizada** | Transforma fronteiras em degraus em contornos ligados suaves. | Muda geometria exportada, não só luz. Não acrescenta detalhe nem passa a ferro a superfície. |
| **Repor** | Repõe 0,1 mm/píxel, camadas de 0,12 mm, primeira de 0,2 mm, largura de 0,42 mm e suavização desligada. | Também repõe espessuras manuais mínimas, preservando a ordem. |

### O tamanho do píxel não é o do bico

Uma imagem de 1000 píxeis de largura a **0,1 mm/píxel** produz cerca de **100 mm**. A **0,2 mm/píxel**, mede cerca de **200 mm** com os mesmos píxeis. Margens exteriores transparentes não contam.

![A mesma grelha cresce fisicamente quando aumenta o píxel; redimensionar a imagem muda o número de píxeis.](10_physical_size.svg)

_Esquema. Tamanho XY, resolução e largura de extrusão são controlos separados._

Para manter 100 mm com 2000 píxeis, use **0,05 mm/píxel**. Mais píxeis descrevem contornos mais finos, mas continua a existir limite de extrusão. Defina **Largura de linha efetiva** em **Definições de impressão 3D** e use a [vista de detalhe imprimível](auto-paint#printable-detail).

Aumentar o píxel não reduz a contagem nem torna a malha intrinsecamente mais barata. Para aligeirar, redimensione ou recorte em [2D](loading-images), ou simplifique a paleta.

### Largura de linha efetiva

Copie a largura de extrusão prevista para **Largura de linha efetiva**. Aceita 0,1–2 mm. Repor **Definições de impressão 3D** recupera 0,42 mm e os restantes valores. Editar não muda o perfil da impressora.

A pintura automática usa-a para avisos, limpeza opcional de pontos e blocos de pontilhamento. Os controlos de inspeção/omissão ficam em [Pintura automática](auto-paint#printable-detail). Avisos não significam que o detalhe será removido ou não possa imprimir.

### Alturas de camada e fronteiras válidas

Com **primeira camada de 0,20 mm** e **normais de 0,08 mm**, os topos ficam a 0,20, 0,28, 0,36 e 0,44 mm, não 0,08, 0,16, 0,24 e 0,32 mm. O Kromacut reconcilia espessuras com esta grelha.

Mudar **Altura de camada** repõe espessuras manuais no novo passo e aplica o mínimo da primeira cor. Mudar **Altura da primeira camada** repõe a primeira cor no novo mínimo. Defina antes de afinar e reveja o plano se mudar.

Os campos aceitam gamas amplas: 0,01–10 mm/píxel para tamanho, 0,01–10 mm para camada e 0–10 mm para primeira. São limites de entrada, não recomendações; a primeira cor respeita sempre o mínimo físico. Use valores suportados por bico, material e laminador. Uma altura mais fina muda receitas disponíveis, não torna a calibração antiga automaticamente compatível.

## Modo Manual

**Espessuras de cor** lista as **Cores da imagem** não transparentes. Cada linha tem pega, amostra, controlo de espessura e leitura em mm. O valor é a espessura da sequência, não a altura absoluta do topo. Pode abranger várias camadas do laminador.

![Três sequências formam alturas acumuladas; aumentar uma inferior eleva todas as superfícies seguintes.](11_manual_layers.svg)

_Corte esquemático. Uma superfície posterior contém as sequências anteriores por baixo._

Por exemplo, preto **0,20 mm**, vermelho **0,16 mm** e branco **0,08 mm**, com camadas de 0,08 mm: regiões pretas terminam a 0,20 mm, vermelhas a 0,36 mm e brancas a 0,44 mm. Vermelho começa na camada 2 e branco na 4. Confirme instruções e interpretação do laminador antes de imprimir.

### Reordenar cores

Arraste linhas de cima para baixo pela ordem de impressão. A primeira começa na placa. As seguintes imprimem sobre anteriores só onde necessário, formando relevo. Mover uma cor muda suporte, altura de superfície e trocas. Ao passar para primeiro lugar, sobe ao mínimo inicial se preciso.

Vista e exportação manuais usam cores da imagem, não o modelo HD. Vermelho fino sobre preto pode imprimir mais escuro que a amostra, mesmo que a vista seja vermelha. Escolha materiais e espessuras em conformidade.

### Ajustar e repor espessuras

Arraste e solte para confirmar. Sequências posteriores avançam por **Altura de camada**. A primeira parte do mínimo e acrescenta passos normais. Aumentar uma inferior eleva todas as superfícies e trocas seguintes, não apenas zonas onde a cor continua visível.

Repor **Espessuras de cor** ordena do escuro ao claro por luminância e atribui mínimos. Difere de repor **Definições de impressão 3D**, que também altera parâmetros físicos mas preserva a ordem.

Controlos manuais e instruções suportam **64 cores**. Reduza paletas maiores em 2D. Píxeis totalmente transparentes não criam material, não um suporte branco. Ilhas opacas desligadas permanecem peças separadas salvo se a imagem as ligar.

## Malha suavizada

Desligada, os contornos seguem a grelha quadrada. Ligada, fronteiras conectadas tornam-se geometria suavizada e soldada. A diferença é exportada, não um filtro visual.

Suaviza os contornos do modelo na pré-visualização e nas exportações. Média mantém a suavização original. Reconstrua para aplicar.

| Intensidade | Utilização |
| --- | --- |
| **Nenhuma** | Pixel art, contornos exatos da grelha ou geração mais rápida. |
| **Mínima** | Limpeza ligeira dos cantos irregulares. |
| **Média** | O resultado familiar da opção anteriormente ativada. |
| **Intensa** | Suavização mais forte dos contornos e degraus restantes, com o mesmo limite de deslocação de Média. |

A deslocação mantém-se abaixo de meio píxel. Reconstrua o modelo e verifique a pré-visualização no slicer. As definições antigas ligada/desligada passam a Média/Nenhuma.

![Contornos diagonais escalonados e suavizados comparados na mesma grelha.](12_smooth_boundaries.svg)

_Comparação esquemática, não simulação do laminador._

Use para curvas ou diagonais demasiado escalonadas. Deixe desligada para arte de píxeis intencional ou bordos de grelha exatos. Nenhuma escolha repara detalhes demasiado pequenos nem inventa resolução ausente.

A suavização está inativa na [Pintura plana](flat-paint). Ativá-la desliga Pintura plana, que usa construção de placa completa.

## Pintura automática

Aceita cores reais e **Distância de ocultação (HD)**, prevê misturas e mapeia cores para alturas imprimíveis. Consulte [Controlos de pintura automática](auto-paint) para filamentos, correspondência, detalhe e confiança.

## Calibrar a distância de ocultação

**Calibrar**, sob os filamentos, abre **Distância de ocultação**, **Prova de paleta** e **Matriz de empilhamentos**. Siga [Fluxos de calibração](calibration-workflows) para impressão/registo ou [Teoria da calibração](calibration-theory) para o modelo ótico.

## Perfis de filamentos

Guardam conjuntos nomeados e evidências compatíveis. Edições por guardar não regressam automaticamente ao perfil selecionado. Consulte [Filamentos e perfis](auto-paint#filament-profiles) e [Ficheiros de perfil](settings-and-controls#filament-profile-files).

### Modelos de perfil

São referências de fornecedores só de leitura, não medições das bobinas. Carregue, ajuste, calibre e **Guarde como novo perfil**. Consulte [Modelos de perfil](auto-paint#templates).

## Altura máxima

O limite encurta transições em fronteiras válidas, mas não remove a fundação opaca. Consulte [Altura máxima](auto-paint#max-height), incluindo a ressalva do suporte transparente.

## Detalhe imprimível

Defina **Largura de linha efetiva** nas **Definições de impressão 3D** e use **Abrir pré-visualização** para regiões finas. **Omitir pontos isolados de cor** substitui opcionalmente cores usadas só em pontos pequenos fechados, mantendo linhas e detalhes ligados. Avisos e contagens reais de omissão aparecem separados. Consulte [Detalhe imprimível](auto-paint#printable-detail).

## Correspondência de cor melhorada

Procura ordens com repetições, distinção de cores ou pontilhamento espacial. São compromissos entre cobertura, espessura, trocas e cálculo. Consulte [Correspondência de cor melhorada](auto-paint#enhanced-color-matching).

## Pintura plana

Crie placa multimaterial em vez de relevo, de face para baixo com suporte ou para cima sem ele. Leia [Pintura plana](flat-paint) antes de exportar, pois direção de observação e atribuições importam.

## Definições do otimizador

**Algoritmo**, **Prioridade regional**, **Detalhe de transição** e **Semente** ajustam correspondência, não velocidade de impressão. Consulte [Definições do otimizador](auto-paint#optimizer-settings).

## Zonas de transição e confiança

Zonas descrevem sequências físicas; confiança descreve evidência e limitações, não exatidão medida. Consulte [Ler o resultado](auto-paint#transition-zones-and-confidence).

## Prova de paleta

Compare uma amostra impressa com cores escolhidas e registe candidatos correspondentes. Consulte [Fluxos de calibração](calibration-workflows#palette-proof-compare-artwork-colors).

## Matriz de empilhamentos

Fotografe uma placa de receitas guardada, verifique alinhamento e guarde cores medidas para empilhamentos compatíveis. Consulte [Fluxos de calibração](calibration-workflows#stack-matrix-photograph-known-recipes).

## Controlos de pré-visualização

Arraste com o botão principal para rodar, use roda para ampliar e botão secundário para deslocar. A câmara nunca altera dimensões físicas.

| Controlo | Utilidade | Efeito na impressão |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Cor fiel** | Comparar amostras sem iluminação de cena nem mapeamento tonal cinematográfico. | Só vista. Depende do modelo e ecrã; não valida calibração. |
| **Sombreado** | Examinar relevo iluminado e forma. | Só vista; a luz muda a cor aparente. |
| **Transparente** | Ver camadas sobrepostas. | Só vista; não torna o filamento transparente. |
| **Aramado** | Examinar arestas coloridas por camada. | Só vista; não são trajetórias de extrusão. |
| **Cores da pré-visualização** | Alternar misturas simuladas e cores físicas. | Só vista. Exportações mantêm materiais reais. |
| **Alternar câmara** | Perspetiva com profundidade ou alinhamento ortográfico sem encurtamento. | Só vista. A posição mantém-se. |
| **Anular / Refazer** | Percorrer histórico partilhado da imagem. | Não anula campos 3D nem filamentos. Regenere após mudar imagem. |
| **Transferir** | Exportar STL ou 3MF gerado. | Usa o último modelo, não definições laterais por aplicar. |

Modo de vista e escolha simulada/física são recordados. **Cores da pré-visualização** só aparece para um modelo automático gerado.

## Pré-visualização de camadas

Arraste as pegas inferior e superior da barra para isolar alturas. As posições encaixam na grelha de camadas. Passe sobre segmentos para informação de início ou troca.

![As pegas ocultam camadas para inspeção, mas a exportação mantém o modelo completo.](19_preview_only.svg)

_Esquema. Ocultar no ecrã nunca elimina da exportação._

A pintura plana tem faixa simples, pois vários materiais ocupam uma camada. Rode por baixo da disposição predefinida para ver a imagem.

Um cálculo falhado pode deixar a geração anterior visível. Não o considere prova de sucesso das novas definições. As instruções usam o instantâneo gerado quando existe. Resolva o erro, regenere, examine e exporte.

Seguinte: [Controlos de pintura automática](auto-paint), [Pintura plana](flat-paint) ou [Geração e exportação](generating-exporting-output).
