---
title: Visão geral
slug: overview
order: 10
description: O que faz o Kromacut e como se articulam os principais fluxos de trabalho.
---

# Visão geral

O Kromacut transforma uma imagem plana numa impressão 3D com camadas de cor empilhadas. A ideia central é simples: as cores da imagem tornam-se camadas físicas, e a ordem e altura dessas camadas definem o plano de impressão.

Use o Kromacut para uma impressão ao estilo HueForge, um relevo de litofania a cores ou uma peça decorativa em camadas cuja imagem final é criada pelas trocas de filamento.

## Fluxo principal

A maioria dos projetos segue o mesmo percurso:

1. [Carregue ou importe uma imagem](loading-images).
2. [Reduza as cores](reducing-colors) até obter uma paleta imprimível na pré-visualização.
3. [Remova o pontilhamento ou limpe](dedithering-cleanup) píxeis isolados se a imagem tiver ruído.
4. Passe ao [modo 3D](3d-mode) e escolha Manual ou Pintura automática.
5. [Gere e exporte](generating-exporting-output) um ficheiro STL ou 3MF e siga as instruções de impressão.

## Duas formas de pintar

O Kromacut tem dois fluxos de impressão no modo 3D.

| Fluxo | Quando utilizar | O que controla |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Manual | Pretende controlar diretamente cada cor da imagem. | Ordem das cores, espessuras por cor, definições de impressão e trocas. |
| Pintura automática | Pretende que o Kromacut planeie o empilhamento físico. | Cores dos filamentos, distâncias de ocultação, altura máxima e opções do otimizador. |

O modo Manual parte das cores no painel **Cores da imagem**. A pintura automática parte dos filamentos reais e das suas **distâncias de ocultação (HD)**, gerando depois camadas imprimíveis para a imagem.

## O que vê na aplicação

Use 2D para preparar a imagem e 3D para planear as camadas físicas. Os guias seguintes seguem essa distinção.

## Guias ilustrados

Comece pela tarefa que pretende realizar. Cada guia explica os controlos, as interações e as consequências para a impressão física. Os diagramas são exemplos esquemáticos, não previsões de cor calibradas. Clique numa ilustração ou ative-a pelo teclado para a abrir em tamanho completo.

| Tarefa | Guia |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Definir dimensões, alturas de camada e ordem manual das cores | [Modo 3D](3d-mode) |
| Escolher filamentos, otimizar misturas e examinar detalhes imprimíveis | [Pintura automática](auto-paint) |
| Criar uma placa plana multimaterial com a face para cima ou para baixo | [Pintura plana](flat-paint) |
| Medir HD, comparar provas de paleta ou fotografar uma matriz | [Fluxos de calibração](calibration-workflows) |
| Preparar a silhueta e retocar píxeis | [Carregar imagens](loading-images) |
| Ajustar tons e cores e incorporar o resultado | [Ajustes de imagem](image-adjustments) |
| Reduzir cores e gerir paletas | [Redução de cores](reducing-colors) |
| Remover pontos sem confundir limpeza 2D com pontilhamento de altura | [Remoção de pontilhamento e limpeza](dedithering-cleanup) |
| Verificar o empilhamento final e transferi-lo para um laminador | [Geração e exportação](generating-exporting-output) |

## Disposição da área de trabalho

A área de trabalho tem três zonas principais:

- O cabeçalho contém documentação, controlos de tema e ligações da comunidade.
- O painel esquerdo contém os controlos do modo atual.
    - Em **2D**, mostra ajustes, remoção de pontilhamento, quantização, paletas personalizadas e cores detetadas.
    - Em **3D**, mostra definições de impressão, controlos manuais, de pintura automática e instruções de impressão.
- A pré-visualização principal mostra a imagem 2D ou o modelo 3D.

> Sugestão: as definições 3D não regeneram o modelo automaticamente. Depois de alterar definições de impressão, espessuras manuais ou opções de pintura automática, clique em **Gerar modelo 3D**.

## Um bom primeiro projeto

Comece com uma imagem de alto contraste, um motivo claro e pouco detalhe no fundo. Reduza-a a 4–16 cores e use Manual se já conhecer a ordem das camadas, ou Pintura automática se tiver distâncias de ocultação calibradas.

---

Seguinte: [Início rápido](quick-start).
