---
title: Definições e controlos
slug: settings-and-controls
order: 80
description: Ações do cabeçalho, temas, persistência, paletas, perfis e controlos da área de trabalho.
---

# Definições e controlos

Esta página reúne controlos que afetam toda a aplicação ou passam despercebidos.

## Controlos do cabeçalho

| Controlo | Função |
| ------------- | ------------------------------------------------------------------------------ |
| Logótipo Kromacut | Volta à aplicação com documentação aberta; caso contrário abre a página inicial. |
| Definições | Abre o diálogo com idioma, tema, recursos e atualizações. |

O tema oferece **Sistema**, **Escuro** e **Claro**. **Sistema** segue a preferência do sistema operativo ou navegador e atualiza quando muda. A escolha fica guardada para outras sessões.

O seletor **Idioma** altera interface, documentação, diagramas e páginas públicas. Escolha **Idioma do sistema** para seguir um idioma suportado do navegador/sistema ou selecione inglês, francês, alemão, italiano, romeno, espanhol, japonês, chinês simplificado, hindi, português europeu, ucraniano ou bengali. A escolha é local e não altera imagens, perfis, definições de impressão nem geometria. Traduções e tipos de letra estão incluídos na aplicação de ambiente de trabalho; nenhum serviço de tradução em linha recebe o trabalho.

As páginas públicas também têm seletor. A documentação traduzida usa ligações partilháveis com prefixo, como `/ro/docs/overview`. Os nomes de páginas e âncoras mantêm-se entre idiomas. Extensões, dados numéricos, nomes introduzidos pelo utilizador e títulos originais de obras comunitárias não são traduzidos.

O diálogo contém ligações para documentação, Discord, Reddit, GitHub e Patreon e mostra a versão atual.

## Modos da área de trabalho

Use **2D** e **3D** para alternar preparação da imagem e geração do modelo.

Pode arrastar o separador vertical entre controlos e vista. Alargue o painel esquerdo para definições detalhadas ou a vista para examinar imagem/modelo.

A documentação usa ligações partilháveis `/docs/...`. Abri-las leva diretamente ao guia correspondente.

Em ecrãs pequenos, expanda **Conteúdo** para escolher guia ou **Nesta página** para uma secção. Ambos fecham após seleção para deixar espaço de leitura. Abra ilustrações em tamanho completo clicando ou focando a ligação e premindo Enter.

A maioria das secções laterais pode recolher-se pelo título. Recolher esconde controlos, não efeitos: ajustes, impressão e otimizador continuam ativos. Resumos e pontos de estado ajudam a detetar alterações. O estado aberto/fechado é recordado. Expandir não repõe definições.

**Anular / Refazer** partilha o histórico da imagem entre 2D e 3D. Não é histórico de filamentos, calibração, alturas nem otimizador. Use reposições de cada painel quando existirem e regenere após restaurar a imagem.

## Modo multiplaca experimental

**Modo multiplaca** nas Definições é um fluxo inacabado. Guarda a preferência e pode mostrar uma animação, mas ainda não divide imagem, cria mosaicos, distribui objetos nem muda geometria exportada. Deixe desligado para imprimir normalmente. Não serve para caber um modelo demasiado grande na base.

## Definições de impressão guardadas

O Kromacut recorda no navegador **Tamanho do píxel (XY)**, **Altura de camada**, **Altura da primeira camada**, **Largura de linha efetiva** e **Malha suavizada**.

Use Repor em **Definições de impressão 3D** para voltar aos valores predefinidos, incluindo 0,42 mm de largura efetiva.

As definições são locais ao navegador/site ou aplicação atual. Não são cópia da imagem nem projeto completo; outros navegadores e a aplicação não têm de as partilhar. Exporte paletas e perfis importantes antes de limpar dados. Carregar um perfil restaura filamentos e evidências, não imagem nem malha pronta.

## Estado guardado de pintura automática

As definições preservadas entre sessões incluem:

- Filamentos.
- Modo de pintura.
- Altura máxima e altura de camada da cunha.
- Correspondência de cor melhorada.
- Separação de cores, limite ΔE único e exigência de correspondência para todas.
- Limite total de repetições, partilhado entre aparições extra no empilhamento.
- Detalhe de transição e pontilhamento de altura.
- Largura efetiva, editada em **Definições de impressão 3D**, para avisos, limpeza de pontos e pontilhamento, mais a preferência **Omitir pontos isolados de cor**. A limpeza não remove todos os avisos nem controla o pontilhamento de altura.
- Pintura plana e preferência de face para cima sem transparente.
- Algoritmo e semente do otimizador.
- Prioridade regional.

Os perfis são separados deste estado. Use-os para conjuntos nomeados que possa carregar, importar ou exportar.

## Ficheiros de paleta

Paletas personalizadas destinam-se à redução 2D e usam `.kpal`.

A versão 2 acrescenta campos opcionais `disabledColors` (cores guardadas mas excluídas) e `colorNames` (nomes por cor). Ambos sobrevivem a exportação/importação. Ficheiros v1 carregam sem alterações, com todas as cores ativas e sem nome; um v2 aberto num Kromacut antigo trata todas como ativas.

Use paletas personalizadas para corresponder a filamentos conhecidos ou a uma coleção fixa.

## Ficheiros de perfis de filamentos

Os perfis são conjuntos nomeados que pode guardar, carregar, importar e exportar. Usam `.kfil` e guardam cores, nomes, HD, calibração, provas e avaliações, e planos limitados de matrizes e cores medidas quando disponíveis. Antigos `.kapp` continuam importáveis. Perfis antigos guardavam valores não calibrados na escala TD convencional; são convertidos automaticamente (×0,1) ao carregar/importar.

Use o **ícone de carregamento** na barra de perfis para importar. Um ficheiro antigo com o mesmo ID sem aparência entra como cópia renomeada em vez de apagar evidências novas; uma falha de armazenamento mantém a lista e mostra erro. Use o **ícone de transferência** para exportar o conjunto atual. A extensão predefinida é `.kfil`. Com edições por guardar, a exportação cria um perfil de «edições por guardar» sem evidências ligadas às identidades antigas.

### Formatos de importação suportados

| Formato | Extensão | Notas |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Perfil Kromacut | `.kfil` | Nativo. Aceita um perfil ou uma matriz de perfis num ficheiro. |
| Perfil Kromacut antigo | `.kapp` | Antigo formato nativo, ainda totalmente suportado na importação. |
| JSON simples | `.json` | Aceite se tiver objeto de perfil ou matriz de objetos. |
| CSV/TSV de bobinas HueForge | `.csv`, `.tsv` | Ver abaixo. |

### Tratamento de duplicados

Ao importar, o Kromacut compara cada perfil com os existentes:

- **Mesmo ID:** normalmente substitui. Se apagaria evidências guardadas com um ficheiro sem evidência útil, importa cópia separada.
- **Mesmo conteúdo, ID diferente:** ignora só se dados de filamento e evidências forem iguais.
- **Mesmo nome, conteúdo diferente:** importa com sufixo numérico (por exemplo, `As minhas bobinas (2)`).

Após cada importação aparece um resumo de importados, substituídos, ignorados ou renomeados.

### Importar do HueForge

Bibliotecas de bobinas HueForge (`.csv` ou `.tsv`) são importáveis diretamente. Use **Export Spools** no HueForge para guardar CSV e depois o ícone de carregamento na barra de perfis para selecionar. O delimitador (vírgula ou tabulação) é detetado no cabeçalho. Cada bobina torna-se `<Brand>-<Color Name>-<Hex>`, por exemplo `Inland Basic-Light Brown-#BF9C81`. UUID HueForge mantém-se como ID para evitar duplicados ao reimportar. As TD são entradas convencionais de retroiluminação/litofania e convertem-se em HD frontal.

## Avisos de atualização no ambiente de trabalho

A aplicação pode mostrar um aviso quando houver versão nova, permitindo abrir a página de transferência ou dispensar o lembrete.

Abra **Definições** para verificar manualmente. **Verificar ao iniciar** controla verificações ao abrir e está ativo por predefinição. As verificações manuais funcionam mesmo desligado.

No Linux, as AppImages com informações de atualização incorporadas podem ser atualizadas com ferramentas compatíveis, como o AppImageUpdate. Estas ferramentas utilizam o ficheiro `.AppImage.zsync` da versão para transferir as partes alteradas. As AppImages antigas sem essas informações exigem uma primeira transferência manual de uma versão compatível. O ficheiro `.zsync` não é um instalador e o aviso de atualização do Kromacut não instala atualizações automaticamente.

## Diagnósticos de pintura automática no ambiente de trabalho

A aplicação pode registar informação estruturada de novos cálculos. Abra **Definições** e ative **Registar diagnósticos de pintura automática** antes do cálculo. Não reinicia nem regista resultados já calculados.

Cada cálculo cria um `.jsonl` separado na pasta de diagnósticos. Use **Abrir pasta** junto à definição. Cada linha é um evento JSON completo, pelo que progresso, erros e cancelamentos permanecem legíveis mesmo sem conclusão.

Um registo completo inclui informação básica de execução, instantâneo de filamentos/calibração ativos, definições de geração e otimizador, amostras limitadas de progresso, estado de ajuste de aparência, decisões progressivas de níveis de repetição, camadas finais, todos os candidatos imprimíveis finais, comparações Delta E, confiança e medições que contribuíram para cores interpoladas ou ajustadas localmente. Regista cores de paleta processadas e pesos, não a imagem carregada. Dados de calibração/perfil podem ser sensíveis; examine antes de partilhar publicamente.

O registo destina-se a investigação e pode criar ficheiros grandes. Deixe desligado na impressão normal se não precisar dele.

## Abrir ficheiros a partir do ambiente de trabalho

As instalações de ambiente de trabalho associam os ficheiros `.kfil` e os antigos `.kapp` a perfis de filamentos, e os ficheiros `.kpal` a paletas. Faça duplo clique num ficheiro para o importar e selecionar no Kromacut. Se a aplicação já estiver aberta, é utilizada a janela existente. Aplicam-se as regras habituais de validação, migração, duplicados e preservação da calibração.

Os ficheiros abertos a partir do ambiente de trabalho ficam em espera enquanto o editor de paletas ou a caixa de diálogo de calibração estiver aberto. Conclua ou cancele essa sessão para continuar as importações pendentes.

Antes de substituir alterações aos filamentos por guardar, o Kromacut apresenta **Manter alterações** ou **Abrir perfil**. Mantenha as alterações para as guardar primeiro; abrir o perfil descarta-as. Os ficheiros abertos desta forma devem ter menos de 32 MiB. Os ficheiros JSON genéricos, imagens e modelos mantêm os procedimentos habituais de importação.

No Linux, as AppImages portáteis requerem integração no ambiente de trabalho para associar ficheiros. Se o Kromacut não for a aplicação predefinida, utilize **Abrir com** no gestor de ficheiros.

Seguinte: [Resolução de problemas](troubleshooting).
