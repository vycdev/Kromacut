---
title: Carregar imagens
slug: loading-images
order: 30
description: Importe, recorte, redimensione e retoque os píxeis antes de se tornarem regiões impressas.
---

# Carregar imagens

Em **2D**, prepara a imagem que o modelo 3D vai usar. As alterações de cor afetam as cores-alvo; as edições de píxeis afetam formas e detalhes da impressão.

## Escolher uma origem

Clique em **Escolher ficheiro** na barra da pré-visualização ou arraste uma imagem para a vista 2D. Só é carregado o primeiro ficheiro largado. Use um formato que o navegador ou a vista web de ambiente de trabalho consiga descodificar; PNG é útil para transparência. Revele primeiro ficheiros RAW da câmara e exporte um formato normal.

O Kromacut começa com o logótipo como exemplo. Carregar outra imagem substitui a imagem de trabalho. Não a publica nem transfere uma origem a partir de uma ligação web colada.

## Examinar sem alterar a imagem

| Controlo | Efeito |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Roda do rato | Amplia em torno do ponteiro. Só altera a vista, não a resolução nem o tamanho de impressão. |
| Arrastar com botão esquerdo | Desloca quando não há ferramenta de retoque ativa. |
| Arrastar com botão central | Desloca mesmo com uma ferramenta ativa. |
| Alternar xadrez | Mostra um padrão atrás dos píxeis transparentes. O padrão não faz parte da imagem nem da impressão. |
| Indicador de tamanho | Mostra dimensões em píxeis e, durante o recorte, as dimensões propostas. |

A vista mantém os bordos nítidos dos píxeis em vez de os suavizar. Amplie para encontrar píxeis isolados e detalhes estreitos.

## Recortar, redimensionar ou mudar o tamanho de impressão?

![Recortar remove parte da imagem, redimensionar reduz a resolução e Tamanho do píxel altera a escala física de cada píxel.](30_crop_resize_scale.svg)

_As dimensões esquemáticas ilustram a relação, não um tamanho recomendado._

### Recortar

Clique em **Recortar**, arraste a seleção ou as pegas dos cantos e bordos e escolha **Guardar recorte**. **Cancelar recorte** deixa a imagem intacta. Guardar conserva o retângulo à resolução dos píxeis da imagem.

Recorte margens indesejadas antes de reduzir cores para não competirem com o motivo pela paleta. O recorte é retangular; use transparência para fundos irregulares.

### Redimensionar imagem

A **Escala** vai de **1% a 100%**, com **50%** por predefinição. **Atual** e **Após redimensionar** mostram dimensões antes de confirmar. Clique em **Aplicar** para reduzir. 100%, ou um valor que arredonde às mesmas dimensões, não faz nada. A seta repõe a percentagem, não a imagem.

O redimensionamento usa suavização, podendo introduzir cores misturadas nos contornos e transparência parcial. Redimensione antes de quantizar ou reduza novamente as cores depois. Aplicações repetidas reduzem a imagem já reduzida: duas a 50% deixam 25% da largura e altura originais. Use Anular para recuperar detalhe em vez de tentar ampliar aqui.

### Tamanho físico em 3D

**Tamanho do píxel (XY)** é milímetros por píxel, não resolução. Uma imagem opaca de 1000 píxeis de largura a 0,1 mm/píxel mede 100 mm. Reduzir para 500 píxeis com a mesma definição dá 50 mm. Alterar para 0,2 mm/píxel repõe 100 mm, mas não o detalhe perdido. As margens exteriores totalmente transparentes não contam para a área do modelo.

Reduzir dimensões em píxeis diminui processamento e geometria. Alterar apenas o tamanho do píxel não remove píxeis. Consulte [Modo 3D](3d-mode) para a escala física.

## Retocar píxeis

**Pincel**, **Borracha**, **Preencher**, **Texto** e **Escolher cor da imagem** usam píxeis de bordos nítidos sem antialiasing. Uma cor personalizada ainda pode acrescentar uma cor à paleta; bordos nítidos evitam misturas involuntárias nos contornos.

![O pincel acrescenta píxeis de cor exata, a borracha remove por transparência, o preenchimento muda uma zona ligada e o texto torna-se píxeis nítidos.](31_pixel_tools.svg)

| Ferramenta ou campo | Funcionamento | Efeito na impressão |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Pincel | Arraste para pintar píxeis opacos. Diâmetro de 1 a 64 píxeis, predefinição 4. | Repara contornos, liga zonas ou engrossa detalhes. O cursor mostra a área. |
| Borracha | Usa o mesmo tamanho, mas escreve píxeis totalmente transparentes. | Remove material, podendo criar buracos ou separar peças. |
| Preencher | Substitui a região clicada com RGB e alfa exatos. Ligações por bordos, não diagonais. | Recolore uma região ligada, não todas as ocorrências. Não existe tolerância fotográfica de cor. |
| Escolher cor da imagem | Recolhe um píxel de origem não transparente e muda para Pincel. | Reutiliza a cor subjacente, não o efeito de um ajuste por aplicar. |
| Cor da ferramenta | Escolha nas Cores da imagem, use o conta-gotas ou introduza seis dígitos hexadecimais. Fechar confirma. | Define a cor opaca de Pincel, Preencher ou Texto. |
| Tamanho do texto | Fonte de 6 a 128 píxeis, predefinição 24. | Texto maior deixa detalhes maiores à mesma escala física; não é um valor em milímetros. |

### Colocar texto

Selecione Texto, clique na imagem e escreva. Enter acrescenta uma linha. Arraste a pega acima da caixa para mover ou a da direita para ajustar a mudança de linha. Tamanho e cor atualizam o rascunho.

Clique na confirmação ou prima **Ctrl+Enter** (**Command+Enter** no macOS) para aplicar. Clicar noutro ponto ou mudar de ferramenta também confirma. X ou **Escape** descarta o rascunho; outro Escape sai da ferramenta. O texto aplicado torna-se píxeis, não um objeto editável.

Cada traço alterado, preenchimento ou colocação de texto é um passo do histórico. Um traço de um píxel a 0,1 mm/píxel tem apenas 0,1 mm de largura, por grande que pareça ampliado. Examine letras estreitas no laminador.

## Remover um fundo

Não há seleção automática do motivo nem remoção por IA. Para um fundo uniforme, abra a amostra em Cores da imagem, torne-a transparente e aplique. Isto remove todas as correspondências exatas, incluindo píxeis do motivo. Use Borracha para remoção local e xadrez para verificar o contorno.

Não use **Eliminar** na amostra: remapeia cores em vez de tornar píxeis transparentes. Consulte [Cores da imagem](reducing-colors#image-colors).

## Anular, transferir e limpar

**Anular** e **Refazer** percorrem alterações confirmadas: carregamento, recorte, redimensionamento, incorporação de ajustes, quantização, limpeza, edições de amostras e retoques. Não são histórico de todas as definições ou movimentos de controlos. Uma nova edição elimina o caminho de refazer. O histórico pertence à sessão atual, por isso guarde a imagem se precisar dela depois.

**Transferir imagem** guarda a imagem de trabalho subjacente como PNG à resolução dos píxeis. Exclui zoom, xadrez, pegas de recorte e rascunhos de texto. Confirme o texto e **Aplique os ajustes** primeiro para os incluir. No ambiente de trabalho abre uma janela de gravação; no navegador segue as definições de transferência.

**Remover imagem** limpa a área, não as definições. Não conte com reversibilidade: não acrescenta a imagem removida como novo passo de Anular. Transfira uma cópia antes se a quiser preservar.

Seguinte: [Ajustes de imagem](image-adjustments).
