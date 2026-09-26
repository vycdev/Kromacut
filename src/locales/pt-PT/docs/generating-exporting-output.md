---
title: Geração e exportação
slug: generating-exporting-output
order: 70
description: Gere o modelo, verifique-o, exporte ficheiros e copie as instruções de impressão.
---

# Geração e exportação

A exportação começa depois de preparar a imagem 2D e os controlos 3D.

![Prepare imagem e definições, gere um instantâneo, examine e exporte todo o empilhamento. Alterar uma definição exige nova geração; limitar a vista não limita a exportação.](40_build_export_snapshot.svg)

## Antes de exportar

Verifique estes pontos:

1. Em 2D, reduza a imagem a um número prático de cores.
2. Em **Definições de impressão 3D**, escolha dimensões com **Tamanho do píxel (XY)**. Faça corresponder **Altura de camada** e **Altura da primeira camada** ao laminador, e **Largura de linha efetiva** à extrusão prevista para as verificações de detalhe e pontilhamento de altura.
3. Escolha **Manual** ou **Pintura automática**.
4. Clique em **Gerar modelo 3D**.
5. Examine o modelo e a **Pré-visualização de camadas**.

Se aparecer um **Aviso de desempenho**, a geração pode ser lenta por tamanho de imagem, píxeis, camadas ou carga semelhante. Pode **Gerar mesmo assim** ou cancelar e simplificar.

## Gerar modelo 3D

Clique em **Gerar modelo 3D** sempre que quiser que a vista e a geometria exportada reflitam as definições atuais.

Durante a geração aparecem etapas como leitura de camadas de cor, mapeamento de cores ou construção de camadas. A exportação volta a ser útil quando desaparece a sobreposição e o modelo atualizado está pronto.

Calcular um novo empilhamento não é gerar uma nova malha. A exportação usa o último modelo gerado, e as instruções continuam ligadas a ele. Depois de editar imagem, mudar perfil, guardar calibração ou alterar impressão, aguarde o cálculo e regenere antes de exportar. A vista anterior pode permanecer enquanto novas definições são calculadas ou rejeitadas; a presença não prova que resultaram.

## Escolher STL ou 3MF

Abra o menu de transferência 3D e escolha:

| Formato | Quando usar |
| ------ | ------------------------------------------------------------------------------------------ |
| STL | Pretende um modelo de geometria única amplamente suportado e fará trocas manuais. |
| 3MF | Pretende cores para laminadores que preservem vários objetos coloridos. |

O 3MF preserva as cores físicas dos filamentos na pintura automática quando possível. Verifique sempre as atribuições no laminador antes de imprimir.

Uma vista automática pode mostrar dezenas de misturas de poucas bobinas. O 3MF atribui esses filamentos reais às camadas, não um material por mistura. A vista normal do laminador pode diferir de **Simuladas** sem atribuições erradas. Compare com **Físicas** ao verificar materiais.

STL não contém cores nem atribuições automáticas de bobinas. Use o plano copiado com os controlos de troca do laminador. Um 3MF é ainda um modelo, não G-code pronto: escolha impressora, bico, perfis, temperaturas e velocidades, e depois lamine.

Para **Pintura plana** só se oferece 3MF: um objeto por filamento e, na disposição predefinida de face para baixo, um suporte transparente. A opção de face para cima omite-o. Um STL sem cores e de geometria única seria inútil para qualquer placa. A pintura plana desativa **Malha suavizada** porque não usa contornos suavizados.

## Instruções de impressão

O painel **Instruções de impressão** fornece:

- Perímetros, enchimento, altura de camada e primeira camada recomendados.
- **Começar com a cor**.
- **Plano de trocas de cor** com camadas e alturas aproximadas.
- Um botão **Copiar** para o plano completo em texto simples.

Use o plano junto da vista do laminador. Os números dependem de **Altura de camada** e **Altura da primeira camada**; mantenha-os consistentes.

![Primeira camada de 0,10 mm seguida por camadas de 0,04 mm. A troca antes da camada 4 está na fronteira de 0,18 mm, mas a nova camada termina a 0,22 mm.](41_swap_layers.svg)

**Trocar na camada N** significa que o novo filamento imprime N. Com primeira camada de 0,10 mm e normais de 0,04 mm, as camadas 1, 2 e 3 terminam a 0,10, 0,14 e 0,18 mm. Para começar na 4, troque depois da 3 e antes de extrudir a 4. A nova camada termina a 0,22 mm.

A altura aproximada exige cuidado: Manual mostra o Z do topo da nova camada; Pintura automática mostra a fronteira de troca. Use o número da camada e examine a transição real laminada, não apenas um Z aparentemente igual. Os laminadores podem identificar diferentemente camada selecionada e ponto de inserção.

Na pintura plana não há plano manual. O painel resume o fluxo multimaterial: atribua cada objeto ao filamento e use transparente e vire a impressão predefinida de face para baixo, ou imprima sem suporte de face para cima. Nenhuma deve ser espelhada no laminador.

## Configuração recomendada do laminador

O Kromacut recomenda:

- Perímetros: `1`
- Enchimento: `100%`
- Altura de camada: o valor das **Instruções de impressão**
- Primeira camada: o valor das **Instruções de impressão**

Examine sempre a pré-visualização do laminador. As alturas são aproximadas e as trocas podem aparecer de forma diferente consoante a primeira camada.

Mantenha **escala Z a 100%** e altura constante igual à do modelo. Alterar Z ou ativar alturas variáveis desloca transições físicas e invalida o plano. Se precisar de outra altura, defina-a no Kromacut e regenere. Alterar XY também muda detalhes relativamente ao bico; defina o tamanho pretendido no Kromacut para a verificação usar esse tamanho.

Verifique ilhas pequenas, texto, recortes transparentes separados, fundações e purga/preparação no laminador. Suavizar contornos não torna todos os traços imprimíveis. A aplicação não calibra fluxo, retração, temperatura nem mecânica da impressora.

## Guardar e cancelar

No ambiente de trabalho, a exportação abre **Guardar como**. No navegador segue as definições de transferência, pelo que pedir localização depende dele. Cancelar não envia nada à impressora. Escrever geometria e comprimir pode demorar; espere que termine antes de fechar.

## Sugestões de exportação

- Gere novamente após alterar definições 3D.
- Não confie apenas no intervalo visível; a exportação inclui todo o modelo.
- Se a malha for pesada, recorte ou reduza resolução em 2D e retire regiões desnecessárias. Aumentar **Tamanho do píxel (XY)** amplia os mesmos píxeis; não reduz o número nem simplifica a malha.
- Se as instruções estiverem desativadas por demasiadas cores, volte a [Redução de cores](reducing-colors#image-colors).

Seguinte: [Definições e controlos](settings-and-controls).
