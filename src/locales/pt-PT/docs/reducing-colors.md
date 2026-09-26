---
title: Redução de cores
slug: reducing-colors
order: 40
description: Compreenda a redução em duas etapas, as paletas fixas e a diferença entre recolorir e tornar transparente.
---

# Redução de cores

A quantização substitui muitas cores por um conjunto menor, simplificando regiões usadas em Manual e Pintura automática 3D. Uma paleta 2D contém cores-alvo da imagem, não um perfil de filamentos nem previsões medidas da impressão.

Recorte e redimensione primeiro. Se alterou os [ajustes de imagem](image-adjustments), clique em Aplicar nesse painel antes de quantizar.

## O processo em duas etapas

![O peso do algoritmo limita a paleta intermédia; Número de cores ou uma paleta fixa controla a segunda etapa.](34_quantization_pipeline.svg)

**Peso do algoritmo** e **Número de cores** fazem coisas diferentes. K-means com peso 128 agrupa primeiro a origem em até 128 cores. Auto com número 16 funde depois esse resultado até um máximo de 16. O peso não é percentagem, opacidade nem número de filamentos.

| Campo ou ação | Significado |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paleta: Auto | Encontra cores dependentes da imagem e limita o número. |
| Paleta: integrada, fornecedor ou personalizada | Mapeia a imagem intermédia para cores ativadas da paleta. Nem todas têm de aparecer. |
| Número de cores | Limite final de Auto: 2–256, predefinição 16. Desativado com paleta fixa. |
| Peso do algoritmo | Orçamento intermédio: 2–256, predefinição 128. Mais costuma conservar detalhe intermédio, não necessariamente melhorar o resultado final. |
| Algoritmo | Método da primeira redução. Predefinição: K-means. |
| Aplicar | Processa a imagem subjacente e cria um passo de Anular. Mudar uma definição só não recolore. |
| Seta de reposição | Repõe Auto, 16 cores, peso 128 e K-means. Não restaura uma imagem anterior. |

O resultado pode ter menos cores do que pedido. Aumentar o alvo após reduzir não recupera cores perdidas: **Anule** primeiro para comparar alternativas na mesma origem.

A quantização preserva píxeis totalmente transparentes, mas torna **todos os parcialmente transparentes totalmente opacos**. Um contorno de alfa suave não é um contorno parcialmente impresso.

## Escolher um algoritmo

Estes métodos agrupam cores. Nenhum acrescenta pontilhamento espacial nem garante que um detalhe pequeno sobreviva à largura do bico.

| Algoritmo | O que muda | Comparação útil |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Nenhum (apenas pós-processamento) | Omite o quantizador inicial; Peso fica desativado. A redução final ou mapeamento fixo continua. | Mapear diretamente uma imagem limpa para uma paleta conhecida. Não é uma opção universal de imagem inalterada. |
| Posterizar | Divide canais RGB em passos discretos e aplica o peso. | Gráficos deliberadamente escalonados; os níveis disponíveis mudam por saltos. |
| Corte mediano | Divide a distribuição em grupos representados por cores médias. | Comparar quando outro método perde um grupo tonal importante. |
| K-means | Encontra grupos ponderados por número de píxeis, com início aleatório. | Ponto de partida para fotografias e imagens mistas. Execuções da mesma origem podem variar ligeiramente. |
| Wu | Usa estatísticas da distribuição para divisões com menor variação interna. | Comparar em gradientes e fotografias. |
| Octree | Agrupa por subdivisões RGB e combina grupos para cumprir o orçamento. | Comparar em imagens com muitas regiões distintas. |

Não há algoritmo universalmente melhor. Examine o motivo, letras pequenas e detalhes importantes ao tamanho físico pretendido.

## Paletas fixas e de fornecedores

Uma paleta fixa só oferece as cores escolhidas. Após a eventual primeira redução, cada píxel não transparente vai para a cor disponível mais próxima no espaço Lab. É correspondência de cores da imagem, não simulação ótica de filamento.

As **Paletas de fornecedores** são referências não oficiais de nomes e cores hexadecimais anunciadas. Não garantem disponibilidade atual nem exatidão de impressão. Por exemplo, as cores Bambu usam a [tabela hexadecimal de filamentos da Bambu Lab](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf). O Kromacut não tem afiliação nem aprovação dos fabricantes.

Paletas integradas e de fornecedores são só de leitura. Clone para personalizar. Use separadamente a [calibração de filamentos](calibration-theory) para o comportamento real de bobinas e camadas.

## Paletas personalizadas

| Controlo | O que fazer |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Criar paleta | Dê nome e adicione pelo menos uma cor válida ativada. Fica selecionada. |
| Editar paleta selecionada | Altera a paleta, não os píxeis atuais. Aplique quantização depois. |
| Adicionar cor | Acrescenta seletor, hexadecimal e nome opcional. Use `#RGB` ou `#RRGGBB`; linhas inválidas são omitidas ao guardar. |
| Nome opcional | Identifica a cor, por exemplo com a bobina. Não altera a correspondência. |
| Ícone de olho | Desativa sem apagar. Tem de restar uma cor válida ativada. |
| Remover linha | Apaga a linha; não pode remover a última. |
| Clonar | Copia uma paleta diferente de Auto para uma personalizada editável, preservando nomes e estados desativados. |
| Importar | Lê `.kpal` e informa entradas importadas, substituídas, duplicadas ou renomeadas. Seleciona a primeira importada quando aplicável. |
| Exportar | Guarda a paleta personalizada em `.kpal`, com nomes e cores desativadas. Clone as integradas antes de exportar uma cópia editável. |
| Eliminar paleta selecionada | Remove a paleta guardada e regressa a Auto. Não apaga píxeis. |
| Guardar / Cancelar | Confirma ou descarta o rascunho do editor. |

**As minhas bobinas (5/8)** significa cinco cores ativadas em oito entradas. Só as ativadas participam. Paletas e seleção guardam-se localmente; exporte cópias antes de limpar dados. São distintas dos [perfis de filamentos](settings-and-controls#filament-profile-files).

## Cores da imagem

Este painel descreve a imagem subjacente, não ajustes por incorporar. O indicador exclui transparência total. As dicas mostram hexadecimal, alfa e contagem de píxeis. Alfa diferente pode criar entradas separadas com o mesmo RGB. Imagens muito coloridas mostram uma lista limitada, não todas as cores fotográficas.

Clique numa amostra para **Editar cor**. Use RGBA ou hexadecimal e aplique. Seis dígitos alteram RGB mantendo o alfa do seletor; oito incluem alfa explícito. Use transparência ou sufixo alfa explícito quando a opacidade importar.

![Substituição opaca recolore cada correspondência exata, alfa zero remove píxeis e Eliminar remapeia em vez de abrir buracos.](35_swatch_operations.svg)

| Ação | O que muda |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aplicar cor opaca | Substitui todas as correspondências exatas RGB/alfa, incluindo regiões desligadas. |
| Aplicar alfa totalmente transparente | Remove correspondências da imagem visível e silhueta imprimível. Píxeis iguais no motivo também desaparecem. |
| Aplicar à amostra transparente | Substitui todos os píxeis transparentes, podendo criar fundo ou preencher buracos. |
| Eliminar | Requantiza com a paleta restante. **Não** apaga píxeis. O algoritmo inicial continua, podendo mudar outras cores. |
| Fechar / Escape | Descarta a edição não confirmada. |

Escolha **Nenhum (apenas pós-processamento)** antes de Eliminar para mapear diretamente. Use [Preencher ou Borracha](loading-images#touch-up-pixels) para alteração local. Anule se mudar mais do que pretendia.

As instruções manuais ficam desativadas acima de 64 cores não transparentes. Menos cores podem simplificar mesmo abaixo disso, mas menos alvos não significam automaticamente menos trocas na pintura automática.

Seguinte: [Remoção de pontilhamento e limpeza](dedithering-cleanup).
