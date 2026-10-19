---
title: Resolução de problemas
slug: troubleshooting
order: 90
description: Problemas comuns e o que experimentar primeiro.
---

# Resolução de problemas

Comece aqui quando um resultado parecer errado ou um controlo estiver desativado.

## Uma ligação mostra «Página não encontrada»

O endereço pode ter uma gralha ou apontar para uma página removida. Use **Abrir Kromacut**, **Ir para a página inicial** ou **Explorar documentação** para encontrar a ferramenta, início ou guia atual. Um endereço desconhecido de documentação não é substituído automaticamente por outro guia.

## Gerar modelo 3D não atualiza a vista

As definições só são aplicadas ao clicar em **Gerar modelo 3D**. Altere-as e gere novamente.

## As instruções de troca estão desativadas

Em Manual, imagens com mais de 64 cores desativam as instruções. Volte a **2D**, use **Definições de quantização** e reduza a 64 ou menos. A pintura plana não tem sequência manual de propósito, porque cada camada pode conter vários filamentos.

## O modelo é demasiado alto

Experimente por esta ordem:

1. Na pintura automática, reduza **Altura máxima** e observe a compressão das transições.
2. Em Manual, verifique o número de cores. Muitas cores criam muitas fatias empilhadas e aumentam naturalmente a altura.
3. Reduza cores em **2D** se não precisar de cada uma como camada separada.
4. Em Manual, reduza uma ou mais espessuras de cor.
5. Confirme que **Altura de camada** e **Altura da primeira camada** correspondem ao laminador.

## O modelo é demasiado grande em X ou Y

Reduza **Tamanho do píxel (XY)**. Recorte primeiro margens ou fundo sem uso.

## A imagem tem pontos ou ilhas pequenas

Use **Remover pontilhamento** após reduzir cores. Se continuarem demasiados píxeis isolados, experimente menos cores ou outro algoritmo.

## A pintura automática parece imprecisa

Causas comuns:

- HD estimadas em vez de calibradas.
- O conjunto de filamentos cobre mal as cores.
- **Altura máxima** comprime demasiado as transições.
- O otimizador precisa de **Correspondência de cor melhorada**.
- O motivo importante está no centro ou margens, mas **Prioridade regional** está em **Uniforme**.

Calibre os filamentos e consulte **Confiança do resultado**.

Verifique separadamente **Modelo de aparência**. Uma pontuação global alta não garante exatidão física. **Apenas estimativas** ou zero receitas de matriz ativas significa ausência de medidas aplicáveis. Guardar um perfil calibrado não torna evidências compatíveis com todas as alturas ou conjuntos alterados. Consulte [Fluxos de calibração](calibration-workflows).

## Uma opção desligou outra

**Preservar separação de cores** e **Pontilhamento de altura** continuam a ser exclusivos, pois atribuem as cores de origem às alturas imprimíveis de formas diferentes. **Malha suavizada** e **Pintura plana** podem ser usadas em conjunto; gere novamente depois de alterar qualquer definição. Consulte [Pintura plana](flat-paint) e [Pintura automática](auto-paint).

## A separação de cores não encontra resultado

O **Limite de correspondência única** é um limite estrito de erro previsto. Com **Exigir correspondência única para todas as cores**, basta uma sem correspondência para rejeitar. Considere menos cores 2D, outro filamento útil, mais altura ou repetições, ou relaxar o limite. Desative o modo estrito só se aceitar perder distinções e fundir regiões. Uma vista antiga pode permanecer após rejeição; não é geração bem-sucedida das definições rejeitadas.

## Os ajustes desaparecem em 3D ou na transferência

Clique em **Aplicar** nos Ajustes para incorporar o aspeto na origem antes de quantizar, gerar ou transferir. A pré-visualização e a origem são distintas. Consulte [Ajustes de imagem](image-adjustments).

## Eliminar uma amostra não removeu os píxeis

**Eliminar** retira uma opção de paleta e remapeia para as restantes. Não é uma borracha. Use Borracha ou alfa zero para um recorte. Quantizar pode tornar opacos píxeis parcialmente transparentes; examine novamente a silhueta.

## Recolher um registo de diagnóstico de pintura automática

Para investigar um resultado na aplicação de ambiente de trabalho, ative **Registar diagnósticos de pintura automática** em **Definições**, faça um novo cálculo e use **Abrir pasta** para encontrar o `.jsonl`. Ative antes do cálculo. Gerar uma malha de um resultado já calculado não regista esse cálculo anterior. Consulte [Diagnósticos de pintura automática no ambiente de trabalho](settings-and-controls#desktop-auto-paint-diagnostics) antes de partilhar.

## A geração 3D é lenta

Imagens grandes, muitas cores, muitas camadas e malha suavizada aumentam o tempo. Experimente:

- Recortar a imagem.
- Reduzir cores.
- Desligar **Malha suavizada**.
- Reduzir resolução com **Redimensionar imagem**. Baixar só o tamanho do píxel torna a mesma malha menor, não mais simples.
- Simplificar opções de pintura automática.

## O ficheiro exportado abre com cores inesperadas

Em 3MF, reveja atribuições de materiais ou filamentos no laminador. O Kromacut preserva cores quando possível, mas os laminadores podem associá-las a extrusores de modo diferente.

STL não transporta atribuições de cor. Use **Instruções de impressão** para trocas.

A vista Simuladas mostra misturas estimadas; laminadores mostram normalmente cores físicas. Mude para **Físicas** para conferir atribuições e verifique as bobinas reais. Nenhuma vista prova a cor final impressa.

## O recorte ou as edições foram longe de mais

Use **Anular**. Refazer está disponível se anular demasiado.

Seguinte: [Perguntas frequentes](faq).
