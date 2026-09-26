---
title: Ajustes de imagem
slug: image-adjustments
order: 35
description: Todos os controlos de tom e cor, o efeito nas cores-alvo e quando incorporar a pré-visualização na imagem.
---

# Ajustes de imagem

Os ajustes mudam a imagem-alvo antes da redução de cores. Não calibram filamento, alteram HD nem garantem que uma cor mostrada seja fisicamente imprimível.

Mova um controlo para pré-visualizar; a vista atualiza quando termina a interação. Todos começam a zero. Setas individuais repõem um controlo; a reposição do painel repõe todos.

## Controlos de tom e cor

![Exemplos ilustrativos negativos, neutros e positivos para os doze ajustes.](32_adjustment_controls.svg)

_São tendências esquemáticas, não previsões calibradas. Os efeitos dependem da origem e dos outros ajustes ativos._

### Tom

| Controlo | Intervalo | Valores negativos | Valores positivos | Consequência para preparar a impressão |
| ---------- | ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Exposição | −3 a +3 pontos, passo 0,01 | Escurece valores RGB. | Clareia; +1 duplica canais até ao corte. | Desloca tons gerais. Este ajuste de imagem renderizada não recupera informação RAW cortada. |
| Contraste | −100% a +100% | Aproxima tons do cinzento médio. −100% fica cinzento médio antes de outros ajustes. | Afasta tons do cinzento, cortando em preto/branco. | Separa zonas principais, mas pode achatar sombras e luzes subtis. |
| Altas luzes | −100% a +100% | Escurece regiões claras. | Clareia regiões claras. | Muda tons claros que competem pela paleta; não recupera detalhe ausente. |
| Sombras | −100% a +100% | Escurece zonas de sombra. | Clareia zonas de sombra. | Pode revelar diferenças escuras existentes antes da redução. |
| Brancos | −100% a +100% | Escurece a gama mais clara. | Clareia a gama mais clara. | Separa ou combina alvos quase brancos. Não é equilíbrio de brancos. |
| Pretos | −100% a +100% | Escurece a gama mais escura. | Clareia a gama mais escura. | Muda alvos quase pretos; preto puro mantém-se porque os valores são multiplicados. |

Altas luzes/Sombras cobrem gamas maiores do que Brancos/Pretos. Há sobreposição: um píxel muito escuro pode reagir a Pretos e Sombras. As gamas são avaliadas depois de Exposição, Contraste, Temperatura/Tonalidade e HSL, pelo que os controlos interagem.

### Cor e detalhe local

| Controlo | Intervalo | Valores negativos | Valores positivos | Consequência para preparar a impressão |
| ----------- | -------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Saturação | −100% a +100% | Reduz intensidade; −100% dessatura. | Aumenta intensidade. | Muda diferenças de cor da imagem, não a gama física do filamento. |
| Vivacidade | −100% a +100% | Reduz mais a saturação em cores relativamente pouco saturadas. | Aumenta mais a saturação nessas cores. | Menos uniforme que Saturação, mas sem reconhecer tons de pele. Cinzento puro mantém-se. |
| Matiz | −180° a +180° | Roda matizes num sentido. | Roda no outro. | Recolore toda a imagem; edite uma amostra para uma só cor exata. |
| Temperatura | −100 a +100 | Mais frio: menos vermelho, mais azul. | Mais quente: mais vermelho, menos azul. | Ajuste aproximado de dominante, **não em kelvin**. |
| Tonalidade | −100 a +100 | Acrescenta verde. | Acrescenta magenta, aumentando vermelho/azul e reduzindo verde. | Corrige ou introduz dominante; não é um perfil medido de câmara. |
| Claridade | −100 a +100 | Suaviza contraste local. | Realça contraste e contornos locais. | Pode criar cores de bordo/halos que exigem quantização. Não recupera detalhe nem alarga linhas finas. |

Exceto Exposição e Matiz, os controlos usam passos inteiros. O alfa não muda. A quantização tem outro comportamento: torna totalmente opacos os píxeis parcialmente transparentes.

## Pré-visualizar e aplicar

![A pré-visualização deriva da origem. Aplicar incorpora o aspeto e repõe os controlos; quantização, PNG e 3D usam depois esses píxeis.](33_adjustment_bake.svg)

**Aplicar** incorpora o aspeto na imagem subjacente, repõe os controlos a zero e cria um passo no histórico. Não reduz cores, gera o modelo nem muda definições de impressão.

A distinção importa:

- **Quantização, Redimensionar imagem, Transferir imagem e geração 3D usam a imagem de trabalho subjacente**, não ajustes por aplicar.
- **Cores da imagem** descreve píxeis subjacentes, pelo que as amostras não seguem ajustes em direto.
- Os retoques editam a imagem subjacente; ajustes ativos reaplicam-se por cima.
- Remover pontilhamento lê a imagem ajustada. Incorpore primeiro para não deixar ajustes ativos sobre o resultado processado.

A sequência fiável é **pré-visualizar ajustes → aplicar ajustes → quantizar → examinar/limpar → gerar 3D**. Recorte e redimensione antes, quando possível.

## Repor e anular são diferentes

Repor remove um ajuste em direto, não uma edição já incorporada. Após Aplicar, os controlos a zero são esperados porque o efeito já está na imagem. Use **Anular** para restaurar a imagem anterior.

Aplicações repetidas atuam na imagem já editada, acumulando corte e perda de detalhe tonal. Anule primeiro ao comparar alternativas.

Seguinte: [Redução de cores](reducing-colors).
