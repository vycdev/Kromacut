---
title: Fluxos de calibração
slug: calibration-workflows
order: 65
description: Escolha uma ferramenta de calibração, conheça os controlos e perceba que medições se aplicam à próxima impressão.
---

# Fluxos de calibração

A calibração ajuda a prever o aspeto de filamentos empilhados. Não calibra a impressora: não afina extrusão, temperaturas, nivelamento nem bico. Use primeiro uma configuração fiável no laminador e meça os mesmos materiais nas condições de observação previstas.

Abra **3D → Pintura automática → Calibrar**. O diálogo contém **Distância de ocultação**, **Prova de paleta** e **Matriz de empilhamentos**. Medem coisas diferentes e podem combinar-se.

![Três percursos: cunha mede opacidade, prova compara poucas cores da imagem e matriz fotografada mede muitas receitas. Todos informam cores previstas e empilhamento imprimível.](20_calibration_choices.svg)

| Ferramenta | Quando usar | O que fornece | O que pode mudar depois |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Distância de ocultação | Opacidade desconhecida ou estimada | Primeira casa que coincide com a faixa de referência | HD, canais, transições, altura total e trocas |
| Prova de paleta | Poucas cores de uma imagem são importantes | Candidatos impressos mais próximos e qualidade | Previsões locais e preferências; possivelmente ordem, alturas e geometria |
| Matriz de empilhamentos | Pretende cores medidas de muitas receitas curtas | Fotografia frontal corretamente alinhada | Receitas medidas, interpolação local e ajuste físico validado |

Nenhuma aumenta resolução XY nem torna todas as cores possíveis. Um perfil bem calibrado pode ter gama limitada. Consulte [Teoria da calibração](calibration-theory) para o modelo.

## Preparar e proteger o perfil de filamentos

Uma linha descreve uma bobina real, não uma cor desejada da imagem.

| Controlo | Função | Consequência importante |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Amostra / Hex | Define cor opaca nominal | Mudar desativa calibração da cor antiga e altera compatibilidade de evidências guardadas. |
| Nome | Dá nome legível | Não altera ótica. Guarde antes de acompanhar provas ou matrizes. |
| HD | Introduz HD frontal em mm, 0,01–2 | Maior costuma exigir mais espessura. Confirmar manualmente apaga calibração de cunha. |
| Converter de TD | Converte TD convencional por cerca de TD × 0,1 | Introduza aqui, não em HD. É estimativa e substitui calibração de cunha. |
| Varinha | Estima HD pela amostra | Ponto de partida, não medida. Substitui calibração existente. |
| Indicador de calibração | Mostra Estimativa ou qualidade medida | Passe o rato para HD por canal. Não garante correspondência da obra final. |
| Adicionar filamento / lixo | Adiciona ou retira bobina | Cores disponíveis e compatibilidade podem mudar. |

Use a barra **Perfis** para manter um conjunto nomeado e inalterado antes de registar aparência:

- **Lista de perfis:** carrega um conjunto. Outro substitui a lista de trabalho, por isso guarde alterações desejadas primeiro.
- **Guardar perfil selecionado:** substitui filamentos pelos valores atuais. Provas e matrizes mantêm-se, mas incompatíveis deixam de aplicar-se.
- **Guardar como novo perfil:** cria conjunto separado. Copia linhas e medições de cunha, não histórico de provas/matrizes.
- **Renomear:** altera nome sem mudar medições.
- **Importar:** carrega ficheiros. **Exportar** faz cópia de perfil nomeado sem alterações pendentes, incluindo avaliações e matrizes, em `.kfil`. Ambiente de trabalho abre Guardar como; web segue o navegador.
- **Eliminar perfil selecionado:** retira perfil e evidências. Exporte cópia antes se puder precisar dele.

**Alterações por guardar** significa conjunto diferente do perfil. Guarde ou substitua antes de criar matriz ou registar prova. Exportar nesse estado cria «edições por guardar» sem histórico antigo; não é cópia completa desse histórico. Modelos de perfil são só de leitura e têm HD estimadas: guarde cópia própria antes de calibrar. Consulte [Formatos e importação](settings-and-controls#filament-profile-files).

## Distância de ocultação: ler uma cunha

### 1. Selecionar filamentos e bases

Selecione um ou vários, ou **Selecionar todos / Desselecionar todos**, e escolha **Seguinte: base**.

- **Rápido** usa uma base por filamento. Mede limiar escalar e mantém diferenças prudentes dos canais estimadas da amostra.
- **Preciso** permite até três bases, recomendando inicialmente duas úteis quando disponíveis. Cada base produz leitura própria. Afina uma estimativa restrita, não mede três canais espectrais independentemente.
- **Amostras de base** escolhem o material inferior. Use contraste para distinguir casas finas da faixa. Base e filamento quase iguais não dão limiar útil.

Mudar Rápido/Preciso repõe bases recomendadas. Preciso é útil quando compara o mesmo material sobre vários substratos, não porque o nome prometa resultados universalmente melhores.

### 2. Definir e imprimir a cunha

![A cunha tem casas progressivamente espessas junto a faixa opaca; a primeira idêntica fornece a medição.](07_calibration_wedge.svg)

| Controlo | Efeito na impressão |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Altura de camada (mm) | Espessura de cada camada adicional. Aceita 0,04–0,40 mm. Menor afina passos, mas não torna fiável uma configuração não suportada. |
| Camadas máximas (comprimento) | Escolhe 4–40 degraus. Mais alarga a gama para translúcidos e aumenta comprimento/altura. |
| STL (qualquer impressora) | Transfere uma peça sem cores. Imprima uma por par filamento/base com a troca manual indicada. |
| 3MF (multimaterial) | Inclui todas as leituras e atribuições reais num ficheiro. Verifique o mapeamento no laminador. |
| Transferir | Exporta o plano atual. Resultados usam altura e bases desse plano, não edição posterior sem relação. |

Use exatamente **altura normal**, **primeira camada** e **trocar após camada / Z** apresentados. A primeira camada vem das definições de impressão; a altura da cunha é separada da altura normal 3D. Não altere escala Z. **Seguinte: introduzir resultados** abre a leitura; transferir não envia à impressora.

No ambiente de trabalho, ambos abrem **Guardar como**; no navegador seguem transferência normal. Aguarde o fim antes de mudar ou introduzir resultados. Cancelar ou falhar mantém o último plano transferido com sucesso; uma falha mostra erro para repetir.

### 3. Comparar e guardar

Observe a cunha de face para cima sob a luz frontal pretendida. A patilha marca uma camada. Compare cada casa com a faixa ao lado, não com foto de telemóvel nem amostra no ecrã.

- **Correspondência:** primeira casa idêntica à faixa. É a contagem de camadas acrescentadas, não a camada absoluta da impressora.
- **Fusão (opcional):** última casa ainda diferente da anterior. Verifica a curva, não é segunda medição obrigatória. Um valor posterior à Correspondência recebe aviso.
- **Amostras previstas / HD / confiança / diagnósticos:** mostram o inferido das leituras. São retorno, não novas medições a fornecer.
- **Guardar calibração:** aplica medidas completas e utilizáveis. Filamento vazio fica **Não introduzido**, sem mudar. Preciso parcialmente preenchido fica **Não será guardado** até ter Correspondência em todas as bases. Pode guardar os completos sem terminar a folha.

Se a última casa ainda diferir, não a declare igual só para acabar: faça cunha mais longa. Se a primeira já coincidir, uma altura menor imprimível ou base mais contrastante torna a medição informativa. Leituras nos extremos têm menor confiança.

Recalibrar substitui o resultado anterior. Para combinar bases, leia-as numa sessão Preciso. Guarde/substitua depois o perfil e exporte cópia. HD medida muda cor e quantidade de material necessária; regenere e confira alturas e trocas.

**Voltar** permite rever etapas. Fechar repõe seleções/leituras não guardadas; guarde primeiro o útil. Se leituras multibase completas desencadearem ajuste de sessão, aguarde antes de guardar; o cálculo não é outra medição a introduzir.

### Exemplo impresso: oito filamentos

![Oito cunhas HD com casas e faixas opacas, da esquerda para a direita: branco, preto, rosa, amarelo, laranja, roxo, ciano e verde.](hd-wedges-eight-colors-2026-09-13.jpg)

Esta impressão real terminou em 13 de setembro de 2026. Cunhas branca e coloridas usam preto; a preta usa branco. O perfil **8 Colors 0.2mm** regista **camadas de cunha de 0,04 mm** e **primeira de 0,10 mm**. O nome não substitui definições registadas.

Use a foto para reconhecer disposição e progressão de opacidade, não para copiar números ou recolher cores calibradas. Exposição, equilíbrio de brancos, luz e ecrã alteram a comparação aparente. Leia a própria impressão junto à faixa sob luz frontal consistente.

## Prova de paleta: comparar cores da imagem

A prova imprime candidatos do empilhamento atual. **Prefixo** é a fundação e todas as camadas até uma altura de paragem. Comparam-se alturas imprimíveis, não misturas arbitrárias independentes.

### Escolher alvos e candidatos

Aguarde um resultado com pelo menos dois prefixos elegíveis. Não precisa de gerar primeiro a malha da imagem. Guarde o perfil nomeado e abra **Prova de paleta**.

| Controlo | Significado |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alvos | Número de cores a comparar, até 10 ou as disponíveis. Predefinição 8 se houver suficientes. |
| Candidatos | Alternativas por alvo, normalmente 2–5, limitadas pelos prefixos úteis. Mais alarga a amostra. |
| Escolher da imagem | Abre seleção separada. Clique em regiões importantes ou botões de cor. |
| Imagem original | Usa cores processadas antes do ajuste de aparência, não fotografia intacta. |
| Ajustadas / possíveis | Usa as cores exatas previstas do resultado. Pergunta se impressão coincide com a vista; «possíveis» não certifica exatidão física. |
| Total de alvos | Define a mesma contagem durante a seleção. |
| Limpar seleções | Remove prioridades manuais e devolve posições à escolha inteligente. |
| Usar alvos inteligentes / Escolhidos + inteligentes | Volta com prioridades e preenche restantes automaticamente. |

Cores selecionadas mantêm brilho onde ocorrem; as restantes escurecem. Escolher não recolore nem força a cor à gama da impressora. Reduzir contagem pode eliminar prioridades excedentes.

### Imprimir e identificar a amostra

![Cada alvo tem casas candidatas que param a alturas diferentes sobre fundação contínua.](09_palette_proof.svg)

**Mapa da prova** e **Resultados** usam um alvo por linha, candidatos A–E da esquerda à direita. Números identificam linhas. **F** é a fundação partilhada, não sexta cor nem outro filamento. Compare com a margem exposta.

**Transferir 3MF** exporta a amostra e, para perfil nomeado sem alterações, guarda identidade e receitas. Depois, seleção e contagens bloqueiam para resultados não se referirem silenciosamente a outra impressão. Mantenha face para cima a 100%, use alturas integradas, confira materiais e oriente pelo canto superior esquerdo ausente. A amostra predefinida de 8 alvos × 5 candidatos mede 44 × 68 mm. Casas de 8 mm tocam-se sobre fundação contínua, com limites menos evidentes que no ecrã.

### Registar o que realmente vê

Abra **Resultados**, compare candidatos e alvo mostrado em condições consistentes e escolha o mais próximo. Escolha vários se empatados. Descreva a correspondência:

| Resposta | O que comunica |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Melhor disponível | É a menos errada. Apoie relativamente às outras sem afirmar igualdade. |
| Próxima | Quase certa. Acrescente correção local suave além da preferência. |
| Exata | A receita corresponde precisamente. Mantenha a referência mais forte com camadas inferiores necessárias à cor visível. |
| Nenhum | Todos claramente fracos. Rejeite localmente sem inventar cor correta nem escolher vencedor. |

![Um vencedor leva a candidatos próximos na ronda seguinte. Nenhum leva à exploração sem melhor referência anterior. Novos alvos testa outras cores.](21_proof_rounds.svg)

Respostas persistem à medida que introduz. **Concluir resultados** ativa quando todas as linhas têm resposta, incluindo Nenhum. **Editar resultados** reabre uma prova concluída. A lista agrupa conjuntos iguais de alvos e continuações.

- **Continuar alvos:** imprime outra ronda com os mesmos alvos e empilhamento atual compatível. Mantém melhores anteriores, testa próximos inéditos e pode incluir um exploratório. Nenhum não tem vencedor anterior, logo explora alternativas.
- **Novos alvos:** abre seleção de outro conjunto. A escolha inteligente favorece cores fora da prova concluída e depois as menos testadas.
- **Menos candidatos / alvos esgotados:** a pesquisa não enche com repetições sem relação para atingir o pedido. Leia o aviso; menos escolhas úteis não significa calibração perdida.
- **Eliminar prova:** após confirmar, remove amostra e avaliações das evidências.

Resultados guardados são legíveis sem imagem original. Voltar a transferir exige o instantâneo exato de origem; continuar precisa de imagem/processo atual compatível. Conserve o 3MF original para reimpressão.

Avaliações podem alterar cores próximas, classificações e alturas futuras. Não mudam materiais reais exportados nem sobrescrevem HD. Um resultado não estabelece paleta globalmente exata. O ajuste amplo exige evidência e validação reservada; avaliações locais ajudam mesmo sem ele.

## Matriz de empilhamentos: fotografar receitas conhecidas

### Planear a placa

Guarde primeiro um perfil nomeado inalterado. Defina **Altura de camada** e **Altura da primeira camada** em 3D antes de **Nova matriz**. A altura da cunha não controla matrizes.

| Controlo | Efeito na placa |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amostras de filamentos | Selecione 2–8 na ordem do perfil. Só estes fornecem camadas. |
| Espessura máxima de cor (mm) | Limita a zona acima da fundação de uma camada. Arredonda para baixo a 1–64 camadas normais inteiras. A 0,04 mm, 0,40 mm permite dez. |
| Máximo de casas | Limita receitas: 64, 144, 256, 400, 625, 1024, 1296, 1600 ou 2025. Mais mede mais, mas usa área e tempo. |
| Orçamento de trocas previsto | Limita estimativa incluindo referências. Escolha 40–640 ou Sem limite. Não é duração nem garantia de trocas finais. |
| Filamento de suporte | Escolhe um selecionado para fundação e preenchimento sob receitas curtas. Predefinição: mais claro. Primeira camada fina não garante opacidade. |
| Altura normal / primeira | Confirmação só de leitura das definições atuais para nova placa. |
| Resumo receita / tamanho / altura / trocas | Mostra área, fundação + cor, altura total e camadas antes de transferir. O registo mostra alturas congeladas, casas, trocas previstas, referências e placas anteriores consideradas. |
| Criar e transferir 3MF | Planeia, exporta e regista o plano no perfil. |

Novas placas usam **cobertura adaptativa**: pesquisa limitada e repetível em toda a espessura permitida. Favorece lacunas de cor medida, profundidades/transições inéditas e exploração de previsões fracas ou anteriormente erradas. Novidade prevista não promete nova cor impressa. Algumas referências repetem-se deliberadamente para comparar fotos.

Só placas concluídas com perfil/materiais, suporte, alturas e alinhamento aceite compatíveis guiam a próxima. Transferir um plano não impresso não mede cores. Mantenha placas concluídas: **Nova matriz** considera medidas elegíveis automaticamente. Alterar suporte ou impressão pode iniciar outro contexto.

Novas placas têm **fundação de uma camada**, definida por **Altura da primeira camada**, sem placa extra por opacidade. Por exemplo, **0,10 mm inicial + 0,40 mm de cor = 0,50 mm total**. A **0,04 mm normal**, são **11 camadas**: uma fundação e dez de cor. O resumo mostra a decomposição e usa a fundação real guardada em placas antigas.

Todas as casas terminam num topo plano. Receita curta assenta em camadas extra do mesmo suporte sob a cor, **dentro do limite colorido**. Este preenchimento não acrescenta altura total. O registo preserva receita útil e preenchimento separados.

Uma primeira camada fina não é automaticamente opaca. Escolha suporte opaco e fotografe sobre superfície plana constante; luz/cor de baixo pode influenciar medidas. Suporte extra só é neutro depois de ocultar realmente o inferior.

Medições sobre base ainda translúcida mantêm espessura física. Apoiam empilhamento igual, mas não são intercambiáveis entre suportes de outras espessuras nem ajustam o modelo global opaco. O preenchimento pode tornar algumas casas opacas mesmo sem a primeira camada o ser.

Novas placas agrupam receitas semelhantes para continuidade e menos fragmentação. Isto não reduz por si o número de filamentos em cada camada, logo não promete menos trocas nem poupança concreta. Placas existentes mantêm posições para as fotos corresponderem.

O limite não força todas as receitas à mesma espessura de cor. Orçamentos podem produzir menos casas, e poucas trocas podem deixar filamentos sem uso; o plano avisa. Se até referências excederem, aumente orçamento ou reduza espessura/filamentos. Placas profundas e purgas CFS/AMS podem ser lentas com poucas casas: veja a estimativa final antes de imprimir.

O resumo conta receitas selecionadas ainda não medidas em placas compatíveis anteriores. Zero significa apenas repetição; pode não imprimir e experimentar limites/materiais diferentes. Não prova medição de todas as cores possíveis, pois a pesquisa é limitada.

Casas fixas de 5 mm sem intervalos têm borda adicional de marcadores; 32 × 32 dados ocupam 170 × 170 mm. Placas antigas mantêm profundidade fixa e **todas as combinações** ou **gama selecionada por HD**; transferi-las de novo não converte para adaptativo.

No ambiente de trabalho, cancelar Guardar como não cria plano. No navegador regista-se no início da transferência. Verifique erros de armazenamento e conserve 3MF. Um registo congela alturas, suporte e mapa: alterações posteriores não redesenham e **Transferir 3MF** exporta o original.

Imprima face para cima a 100%, com alturas e filamentos exatos. Primeira camada menor que a normal é normalizada à normal. A fundação fica uma camada à altura efetiva, não engrossa até opacidade. Placas antigas preservam fundações originais, incluindo camadas extra. É um objeto de calibração física: mudar Z ou materiais invalida o que as casas medem.

### Carregar e alinhar uma fotografia

Selecione a placa na lista e **Escolher fotografia** ou largue imagem na área. Fotografe sob luz frontal difusa sem reflexos fortes. O ficheiro deve ser descodificável; RAW não substitui uma exportação normalmente visível.

![Quatro pegas pertencem aos centros dos marcadores fora da grelha. A borda fica meia casa além dos centros; uma ampliação distingue centro de canto exterior.](22_matrix_alignment.svg)

| Controlo | O que muda |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legenda dos cantos | Orientação: 1 superior esquerdo, 2 superior direito, 3 inferior direito, 4 inferior esquerdo. Siga as cores deste registo, variáveis por filamento. |
| Rodar esquerda / direita | Roda foto 90° e repete deteção. Não muda o mapa físico. |
| Zoom − / percentagem / Zoom + | Amplia de 100% a 400%. A 100% cabe toda a foto; não é um píxel de ecrã por píxel de câmara. Clique na percentagem para repor e desloque para áreas ampliadas. |
| Quatro pegas numeradas | Arraste para centros de marcadores diagonalmente fora da grelha densa. A mira ampliada marca o centro amostrado. |
| Mostrar grelha do modelo | Projeta fronteiras para comparar. É sobreposição de revisão, não correção de cor. |
| Detetar novamente | Reestima alinhamento da foto atual. |
| Repor | Restaura estimativa inicial e anula ajustes manuais. Não apaga calibração guardada. |
| Verifiquei todas as linhas e centros | Obrigatório após ajuste manual ou deteção pouco fiável. Confirme só depois de examinar toda a grelha e quatro centros. |

Não coloque pegas nas últimas receitas nem nos cantos exteriores físicos. O contorno azul deve ir meia casa além de cada centro. Veja a **Pré-visualização corrigida de perspetiva**: casas quadradas e disposição igual à impressa. A aplicação amostra centros recuados, mas grelha deslocada continua a atribuir cores erradas.

### Decidir a amostragem e guardar

**Correção de marcadores de referência** está desligada por predefinição. Assim conserva cores amostradas e dominante da câmara. Ligada aplica ganhos por canal estimados pela comparação dos quatro marcadores com as receitas previstas. Pode reduzir dominante/brilho, mas não mede independentemente luz da sala nem repara sombras/reflexos. Previsões erradas dos marcadores também enviesam. Uma vista mais clara não prova maior exatidão.

A **Pré-visualização da LUT extraída** mostra cores a guardar, uma por receita. Passe o rato para RGB amostrado. Compare com placa física e condições pretendidas, não com a expectativa de que todas as cores sejam vivas.

**Guardar calibração** fica disponível com amostras e revisão prontas. Num registo concluído passa a **Substituir calibração** e troca as medidas; transfira/exporte cópia antes para conservar ambas. O perfil guarda cores, receitas e metadados, não a foto original. Guarde-a separadamente para reamostrar.

**Nova matriz** inicia outra placa; **Voltar às matrizes guardadas** regressa a registos. **Eliminar matriz de empilhamentos** remove placa e evidência selecionadas. Placas concluídas compatíveis contribuem juntas, pelo que não precisa de apagar antigas por medir novas.

## Que evidências se aplicam à próxima impressão?

![Três camadas medidas a 0,08 mm não são a mesma receita física a 0,04 mm. HD ainda estima por espessura, mas contagem igual não transfere cores de matriz.](23_calibration_scope.svg)

| Evidência | Compatibilidade a verificar |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HD de cunha | Pertence à cor medida. Modela espessura, não consulta de uma contagem; novas definições merecem teste físico. |
| Preferências de prova e ajuste amplo | Exigem mesmas identidades ordenadas, cores, HD/calibração, alturas normal/inicial e opacidade de transição. |
| Referências Exata | Exigem filamento/perfil e alturas iguais. Podem manter-se elegíveis com outro detalhe se o sufixo físico for realizável. |
| Matriz | Exige alinhamento concluído/aceite, perfil compatível e mesma altura normal. Receita exata depende também do suporte medido ou equivalência apoiada. |

Mudar 0,08 para 0,04 mm não reinterpreta três camadas fotografadas como seis. A matriz fica fora do contexto. O perfil ainda fornece HD de cunha, mas **Modelo de aparência** pode corretamente mostrar **Apenas estimativas** e zero receitas LUT.

Outra primeira camada não desativa automaticamente todas as matrizes. Preservam a fundação, e a reutilização depende de o suporte gerado cumprir condições medidas/equivalentes. Não assuma que mesmo material superior ou espessura total bastam. Consulte [Incerteza de previsão](calibration-theory#prediction-uncertainty) para transferência limitada de suporte e continuação do mesmo filamento.

## Ler confiança sem exagerar exatidão

O indicador de filamento, **Confiança do resultado** e **Modelo de aparência / Confiança de previsão** descrevem coisas diferentes:

- **Confiança do filamento** indica quão restrita ficou a medição de cunha. Extremos, desacordo ou idade reduzem-na. Estimativa significa ausência de cunha ativa.
- **Confiança do resultado** combina Calibração, Cobertura e Compressão. Um total alto pode coexistir com receitas inteiramente simuladas.
- **Modelo de aparência** identifica evidência empírica e ajuste. Contagens de empilhamentos, referências, vizinhanças e receitas LUT mostram o que informou o cálculo.
- **Confiança de previsão** descreve apoio das cores mapeadas, incluindo medição, interpolação, ajuste ou simulação. Uma receita medida continua observação humana/de câmara sob certas condições, não garantia laboratorial.

Use **Melhor disponível**, não Exata, para escolher a menos má. Não ajuste repetidamente a fotografia até a vista ficar atraente. O passo útil é um pequeno teste físico das cores e definições realmente alteradas.
