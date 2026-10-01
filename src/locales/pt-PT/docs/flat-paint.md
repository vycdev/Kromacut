---
title: Pintura plana
slug: flat-paint
order: 64
description: Relevo escalonado, suportes transparentes com a face para baixo e placas expostas com a face para cima.
---

# Pintura plana

**Pintura plana** é uma disposição de pintura automática disponível com correspondência normal ou melhorada. Produz uma placa de espessura constante em vez de relevo escalonado. Cada camada cobre a área do modelo, podendo vários materiais partilhar uma camada lado a lado.

Use um fluxo multimaterial como AMS, CFS ou troca de ferramentas, com suporte adequado no laminador. Uma troca manual a uma altura não fornece vários materiais lado a lado nessa camada.

![Cortes comparam relevo normal, pintura plana com a face para baixo e suporte transparente, e face para cima sem suporte.](17_flat_paint_orientation.svg)

_Cortes conceptuais. As cores identificam materiais; as etiquetas identificam a face de observação._

## Predefinição: face para baixo com suporte transparente

Ative **Pintura plana** e deixe **Face para cima, sem camada transparente** desligada.

1. O suporte transparente imprime primeiro e torna-se a face lisa contra a placa. Atribua o seu objeto a filamento transparente.
2. As colunas invertem a ordem normal dos materiais para observação por baixo. A fundação preenche por trás das colunas curtas.
3. Exporte **3MF** e mantenha a orientação. A imagem já está espelhada; não volte a espelhá-la no laminador.
4. Depois de imprimir, vire a peça para observar através do suporte.

O texto pode parecer invertido pelo verso no laminador. Verifique a face prevista de observação. Rode a vista por baixo do modelo no Kromacut para a examinar.

O suporte é geometria adicional que exige filamento transparente real. A transparência no ecrã não mede a clareza do filamento nem o acabamento da placa. Verifique a espessura completa no indicador **Modelo** e no laminador, não apenas na **Altura máxima**.

## Face para cima, sem camada transparente

Ative esta opção para retirar o suporte transparente:

- Cada coluna mantém a ordem normal de materiais de baixo para cima.
- A fundação preenche por baixo das colunas curtas, alinhando cores visíveis num topo plano.
- Não existe objeto de suporte nem necessidade de filamento transparente.
- Imprima com a face para cima como exportado, sem espelhar, e observe o topo sem virar.

Estas disposições têm geometria diferente. Volte a **Gerar modelo 3D** depois de alterar a opção. Virar uma exportação antiga não a converte entre disposições.

## Comparar os fluxos

| Fluxo | Face de observação | Geometria | Atribuição no laminador |
| ------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------------- |
| Pintura automática normal | Topo escalonado | Colunas mais curtas terminam antes. | Sequências físicas de material por altura. |
| Pintura plana predefinida | Fundo através do suporte | Colunas espelhadas e invertidas com fundação atrás. | Objetos por filamento e suporte. |
| Pintura plana, face para cima | Topo plano exposto | Ordem normal, fundação sob colunas curtas. | Objetos por filamento; sem suporte. |

**Malha suavizada** funciona com ambas as orientações de Pintura plana. Escolha uma intensidade e gere novamente. A suavização amacia o contorno exterior e os limites partilhados entre cores, mantendo a placa plana, as alturas das camadas e as pilhas de materiais. Pequenas ligações partilhadas fecham os contactos diagonais sem sobreposição. As instruções de impressão e o 3MF registam a intensidade usada.

## Exportar e verificar

Só é oferecido **3MF**. Um STL sem cores perderia a disposição significativa dos materiais, deixando uma placa. Os objetos agrupam-se por filamento real, não por cada mistura prevista.

1. Faça corresponder alturas normal e inicial às do Kromacut.
2. Mantenha escala e orientação exportadas. Não acrescente outro espelhamento.
3. Atribua corretamente cada objeto, incluindo o transparente no suporte predefinido.
4. Examine camadas individuais no laminador para confirmar regiões lado a lado e placa completa.
5. Confirme o sentido do texto pela face prevista e verifique trocas e duração.

As **Instruções de impressão** substituem a lista manual por orientação multimaterial específica. A **Pré-visualização de camadas** tem uma faixa simples porque cada camada pode conter vários materiais. Os limites afetam apenas a inspeção, nunca a exportação completa.

## Compromissos de custo e detalhe

Uma face plana não é necessariamente mais simples de imprimir. Preencher toda a área em cada camada acrescenta material e geometria face ao relevo. Camadas finas, empilhamentos altos e **Pontilhamento de altura** podem criar muitas zonas pequenas, mais deslocações e geração, exportação ou laminação mais lentas.

O Kromacut avisa antes de gerar trabalhos grandes. **Gerar mesmo assim** aceita essa carga; não certifica a adequação da impressora. Teste uma peça pequena se o material ou acabamento não estiver validado. A pintura plana preserva a disposição ótica pretendida, mas depende de materiais calibrados e de um processo correspondente.

Seguinte: [Geração e exportação](generating-exporting-output).
