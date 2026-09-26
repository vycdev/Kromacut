---
title: Remoção de pontilhamento e limpeza
slug: dedithering-cleanup
order: 50
description: Limpeza da vizinhança por cores exatas e os seus efeitos em pontos isolados, contornos, transparência e ilhas imprimíveis.
---

# Remoção de pontilhamento e limpeza

**Remover pontilhamento** substitui píxeis com pouco apoio local por cores vizinhas. É uma passagem independente de limpeza, não um algoritmo de quantização nem uma simulação do que o bico imprime.

Use em padrões pontilhados com cores repetidas ou numa imagem reduzida com pontos isolados. Pode funcionar antes da quantização se a origem já tiver esses padrões, ou depois nas regiões reduzidas. Não é um filtro de ruído fotográfico: píxeis vizinhos de uma fotografia costumam ter cores exatas ligeiramente diferentes.

## Como se escolhe um píxel

![Os oito píxeis vizinhos votam pela cor exata. O peso define quantos iguais são necessários para manter o centro; cada passagem usa o resultado anterior.](36_dedither_neighbors.svg)

Cada píxel verifica oito vizinhos imediatos, incluindo diagonais. Se houver suficientes com **RGB e alfa exatamente iguais**, mantém-se. Caso contrário, adota a cor diferente mais frequente. Os empates são aleatórios, pelo que definições iguais podem produzir resultados diferentes.

Só se usam cores vizinhas existentes, incluindo píxeis transparentes. Não são combinadas numa média para criar outra tonalidade.

## Peso

**Peso** é o número de vizinhos iguais necessário para manter o píxel original. Intervalo **1 a 9**; predefinição **4**.

| Exemplo | Resultado |
| ------------------------------------ | ------------------------------------------------------------ |
| Nenhum vizinho igual | Muda se existir outra cor vizinha, mesmo com peso 1. |
| Três vizinhos iguais | Mantém-se com peso 3; pode ser substituído com peso 4. |
| Centro e oito vizinhos iguais | Mantém-se mesmo com peso 9 porque não existe vizinho diferente. |

Valores baixos tendem a preservar detalhe; valores altos tornam mais píxeis elegíveis para substituição. Com apenas oito vizinhos, o peso 9 não atinge o limiar de conservação. É uma definição agressiva de contornos, não um raio maior. Píxeis nas margens têm também menos vizinhos.

## Passagens

**Passagens** repete a limpeza **1 a 10** vezes, com **1** por predefinição. Cada passagem lê todo o resultado anterior. Passagens extra podem remover pontos persistentes, mas também mover contornos, quebrar ligações estreitas ou apagar texto pequeno.

As setas individuais repõem peso 4 ou passagens 1. A reposição do painel repõe ambos. Nenhuma restaura a imagem anterior; use Anular para isso.

## Aplicar e examinar

1. **Aplique** primeiro ajustes ativos. A limpeza lê a vista ajustada; incorporá-los antes evita ajustes em direto sobre o resultado limpo.
2. Comece com uma passagem. O peso predefinido é 4; experimente menos quando o detalhe fino importa.
3. Clique em **Aplicar** e examine contornos, letras e bordos transparentes com grande ampliação.
4. Anule antes de comparar outra definição na mesma imagem inicial.

Cliques repetidos em Aplicar continuam a limpar a imagem já limpa. Não são comparações independentes com a original.

## Efeito na impressão

Remover píxeis isolados de outra cor pode eliminar ilhas minúsculas, mas também detalhe desejado. O alfa participa na votação, pelo que a limpeza pode aumentar ou diminuir a silhueta e abrir ou fechar buracos.

Trabalha em **píxeis da imagem**, não milímetros. Um detalhe de três píxeis a 0,1 mm/píxel ocupa 0,3 mm antes de decisões posteriores de malha ou laminador. Não existe entrada de diâmetro de bico. Use os [controlos 3D de detalhe imprimível](3d-mode) e o laminador para verificar detalhes físicos.

## Remoção de pontilhamento e pontilhamento de altura

| Ferramenta | Onde | O que muda |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| Remover pontilhamento | 2D | Regiões de cor exata e possivelmente o contorno transparente da imagem. |
| Pontilhamento de altura | Pintura automática em 3D | Padrão de alturas de superfície gerado para aproximar cores-alvo. |

Usar uma não ativa a outra. Não aplique a limpeza se pretender preservar arte de píxeis ou pontilhismo intencional.

Seguinte: [Modo 3D](3d-mode).
