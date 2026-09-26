---
title: Início rápido
slug: quick-start
order: 20
description: Uma primeira utilização prática, da imagem à exportação.
---

# Início rápido

Este guia percorre um projeto habitual, do carregamento da imagem à exportação.

## Carregar ou importar uma imagem

Use o botão de carregamento na barra da pré-visualização ou arraste uma imagem para a vista 2D.

Depois, use a roda do rato para ampliar e arraste a pré-visualização para a deslocar. Se houver transparência, o botão de xadrez ajuda a distinguir as zonas transparentes.

## Ajustar a imagem

Em **2D**, use **Ajustes** antes de reduzir cores. Exposição, contraste, altas luzes, sombras, brancos, pretos, saturação, vivacidade, matiz, temperatura, tonalidade e claridade podem alterar as cores encontradas pelas ferramentas de paleta.

Clique em **Aplicar** no painel Ajustes para incorporar os ajustes atuais na imagem antes de reduzir cores, gerar geometria 3D ou transferir. Os ajustes em direto são apenas uma pré-visualização, não uma atualização da imagem de origem. Consulte [Ajustes de imagem](image-adjustments) para exemplos antes/depois e comportamento de reposição.

## Redimensionar se necessário

Se a imagem for muito maior do que o detalhe a imprimir, use **Redimensionar imagem** para a reduzir por percentagem antes de reduzir cores. Isto diminui as dimensões reais em píxeis, podendo acelerar a geração 3D e facilitar o dimensionamento físico.

## Reduzir cores

Em **Definições de quantização**:

1. Deixe **Paleta** em **Auto**, salvo se já tiver uma paleta específica em mente.
2. Comece com **Número de cores** em **16**. Diminua para menos regiões de origem ou aumente se faltar detalhe. Na pintura automática, este número não corresponde a bobinas nem a trocas.
3. Deixe **Algoritmo** na opção predefinida **K-means**. É o ponto de partida recomendado para a maioria das imagens.
4. Clique em **Aplicar**.

Examine o resultado em **Cores da imagem**. Clique numa amostra para editar ou eliminar da paleta. Eliminar remapeia os píxeis para cores restantes; use Borracha ou alfa zero (totalmente transparente) para retirar píxeis da silhueta.

## Remover pontilhamento ou limpar

Se a redução deixar pontos isolados, use **Remover pontilhamento** como passagem de limpeza. É particularmente útil porque píxeis soltos na imagem 2D podem tornar-se pequenos elementos geométricos individuais em 3D.

Comece com **Peso** e **Passagens** predefinidos e clique em **Aplicar**. Aumente as passagens apenas se uma deixar demasiados píxeis isolados.

## Ativar o modo 3D

Clique em **3D**. Defina primeiro os parâmetros básicos:

- **Tamanho do píxel (XY)** controla a largura e profundidade físicas de cada píxel.
- **Altura de camada** deve corresponder à que pretende usar no laminador.
- **Altura da primeira camada** deve corresponder à definição do laminador.
- **Malha suavizada** pode suavizar fronteiras ligadas de cor para uma geometria mais lisa.

## Escolher Manual ou Pintura automática

Use **Manual** para controlar diretamente as cores reduzidas. Este modo usa as amostras de **Cores da imagem**: arraste-as para a ordem de impressão desejada e use cada controlo deslizante para decidir a espessura contribuída. É uma boa primeira opção se já souber a ordem ou trabalhar com uma paleta pequena e simples.

Use **Pintura automática** para o Kromacut planear o empilhamento físico. Parte dos filamentos reais em vez das amostras reduzidas e usa a cor e a **Distância de ocultação (HD)** de cada um — a profundidade a que oculta o que está por baixo — para estimar o aspeto das camadas empilhadas.

Numa primeira utilização:

1. Adicione os filamentos que realmente pretende usar.
2. Defina a cor de cada um com a maior exatidão possível.
3. Defina a **HD**. A estimativa da varinha serve para experimentar e pode converter uma TD convencional (≈10 vezes a HD); distâncias calibradas costumam dar melhores resultados.
4. Deixe inicialmente **Altura máxima** em **Auto**.
5. Ative **Correspondência de cor melhorada** se o primeiro resultado falhar cores importantes ou quiser procurar uma ordem melhor de filamentos.

Após o cálculo, verifique zonas de transição e detalhes de confiança antes de exportar. Baixa confiança costuma indicar falta de uma cor útil, necessidade de calibrar HD ou uma altura máxima demasiado restritiva.

## Gerar e exportar

Clique em **Gerar modelo 3D**. Quando aparecer, use **Pré-visualização de camadas** para examinar a construção de baixo para cima.

Abra o menu de transferência e escolha **Transferir STL** ou **Transferir 3MF**. Copie depois as **Instruções de impressão** para ter a cor inicial, camadas de troca e definições recomendadas do laminador.

Seguinte: [Modo 3D](3d-mode), [Pintura automática](auto-paint) ou [Geração e exportação](generating-exporting-output#before-you-export).
