---
title: Teoria da calibração
slug: calibration-theory
order: 62
description: A ótica e a matemática da calibração por distância de ocultação, prova de paleta e matriz de empilhamentos.
---

# Teoria da calibração

O Kromacut tem três ferramentas complementares. **Distância de ocultação** mede a opacidade física de cada filamento. **Prova de paleta** pede que classifique alguns candidatos impressos para cores importantes num trabalho. **Matriz de empilhamentos** fotografa muitas receitas conhecidas e regista cores observadas. Todas alimentam o mesmo modelo automático, mas respondem a perguntas distintas.

Para controlos passo a passo, gravação e compatibilidade, consulte [Fluxos de calibração](calibration-workflows). Para o resto da área de impressão, consulte [Modo 3D](3d-mode).

## Porque se misturam camadas finas

A impressão é vista com luz frontal: entra pelo topo, atravessa filamento, reflete-se em baixo e sai novamente. Uma camada fina só oculta parcialmente o que está por baixo, pelo que se vê uma mistura da cor própria e da cor transmitida. A pintura automática usa essa transparência residual para criar cores intermédias com poucos filamentos, daí a importância da HD exata.

![Camadas finas sobre preto ocultam-no só em parte; cada camada multiplica a transparência residual até se atingir a cor opaca do filamento.](06_frontlit_hiding_distance.svg)

O Kromacut modela a transmissão com Beer-Lambert. Uma espessura `d` transmite

```
T = 10^(−d / HD)
```

da cor inferior. Cada camada multiplica essa transmissão, atingindo opacidade geometricamente. A taxa é propriedade do material: preto denso oculta numa fração de milímetro, branco translúcido pode exigir dez vezes mais. Essa taxa é a distância de ocultação.

A distância de transmissão em fichas ou ensaios TD retroiluminados descreve luz a atravessar o filamento _uma vez_, como numa litofania. A observação frontal atravessa duas vezes e lê contra reflexão; uma TD convencional é cerca de dez vezes a HD. O Kromacut aceita TD através do botão de conversão, mas guarda e simula com HD.

## A cunha

Medir cor por câmara é pouco fiável: há correções automáticas, ecrãs diferentes e luz variável. A cunha evita julgar cores isoladas. Cada peça imprime casas de 1 a N camadas sobre uma base, com **faixa de referência** do mesmo filamento totalmente opaca ao lado e patilha a marcar a ponta de uma camada.

![A cunha: casas numeradas de espessura crescente junto a faixa opaca; indica-se a primeira casa idêntica à faixa.](07_calibration_wedge.svg)

Indique a **primeira casa que parece idêntica à faixa ao lado**. A faixa é a cor opaca do filamento a milímetros sob a mesma luz, mantendo a comparação entre salas, ecrãs e impressões. Casas finas mostram a base; numa certa casa a diferença cai abaixo do discernível, e esse número é a medição.

## Da leitura à distância de ocultação

A casa marca a espessura em que a transmissão caiu abaixo de uma **diferença apenas percetível (JND)**: a menor diferença visível, cerca de 2 ΔE00 em observação quotidiana.

O Kromacut resolve ao contrário. Para a cor do filamento sobre a base calcula `T*`, a transmissão que coloca a mistura a exatamente uma JND da cor opaca. Depende só das duas cores e da JND, sem constante de opacidade afinada manualmente. A leitura dá `d* = casa × altura de camada`, e a inversão resulta em:

```
HD = −d* / log10(T*)
```

![Ao empilhar, a diferença casa-faixa diminui; a leitura fixa a passagem por uma JND e a inversão da lei dá a HD.](08_opacity_solve.svg)

O contraste da base importa: preto sobre preto nunca difere da faixa uma JND inteira, logo nada há a medir. O assistente deteta e atribui base clara a filamentos escuros.

## Evidências da prova de paleta

A prova compara prefixos reais com cores da imagem atual. Guarda receita física, previsão HD original, alvo pedido e todas as respostas. Uma folha fornece assim dois tipos de evidência sem fingir que cada escolha é uma medida exata.

**Melhor disponível** apoia a receita selecionada e rejeita alternativas próximas do alvo sem forçar igualdade de cor. **Próxima** acrescenta correção local parcial. **Exata** acrescenta a correção mais forte e preserva o sufixo opaco exato testado como referência direta. Todas as casas empatadas selecionadas recebem apoio. **Nenhum** rejeita candidatos plausíveis próximos sem inventar direção de correção.

Os efeitos são locais no espaço de receitas e de cores. As camadas recentes e opticamente dominantes contam mais; mover o mesmo filamento noutro local recente dá correspondência menor. A evidência desvanece também quando a cor simulada ou alvo se afasta da avaliada. Receitas semelhantes que perdem repetidamente perto de verdes reforçam um aviso local para empilhamentos verdes próximos, deixando uma receita vermelha sem relação intacta.

Correções Próxima e Exata alimentam as mesmas cores Lab da pontuação e vista final. Apoio e rejeição acrescentam preferência limitada sensível ao alvo, podendo desempatar valores próximos sem superar erro real ou referências exatas. O ajuste global de luminosidade/croma é separado e tem de passar validação com dados reservados. Evidências locais e referências Exata podem continuar úteis sem ajuste global ativo, e todos os parâmetros derivados são reconstruídos deterministicamente das avaliações brutas guardadas.

## Calibração por matriz de empilhamentos

A matriz começa como medição tipo LUT, não outra resolução de cunha. Novas placas amostram receitas úteis de comprimentos diferentes até uma espessura física máxima, mantendo a altura normal em cada camada colorida. Um máximo de 0,40 mm a 0,04 mm permite dez camadas de cor. A fundação é uma só camada à altura inicial efetiva, não uma placa dimensionada por opacidade. Com primeira camada de 0,10 mm, o exemplo mede 0,50 mm e onze camadas.

Receitas curtas assentam em camadas extra do mesmo suporte dentro da zona colorida para todos os topos terminarem no mesmo Z sem exceder o limite. O suporte extra regista-se separado da receita útil. Uma fundação fina não é garantidamente opaca: use filamento opaco e fundo fotográfico plano e consistente. O suporte impresso deve ocultar realmente o substrato antes de tratar o acrescentado como neutro. Placas antigas preservam fundações e mapas originais.

O espaço de receitas cresce exponencialmente, por isso o planeamento usa um conjunto determinístico limitado de sequências puras, transições ordenadas e receitas exploratórias mais longas nas profundidades permitidas. HD guardadas preveem cores. Matrizes compatíveis concluídas fornecem cobertura medida e registo de receitas anteriores. A seleção favorece lacunas de cor, espessuras/transições inéditas e exploração informada por apoio fraco ou erros anteriores. As pontuações são heurísticas, não intervalos calibrados de incerteza. Algumas referências repetem-se intencionalmente para consistência; planos não impressos e fotos incompatíveis/não aceites não fecham lacunas.

O orçamento de trocas inclui referências de canto e limita uso de materiais camada a camada. Não estima tempo nem purga, e o laminador pode acrescentar trocas. Um máximo maior pode custar mais mesmo com poucas casas. Novas placas agrupam receitas semelhantes para regiões contínuas e menos fragmentação; rearranjar casas não reduz materiais por camada. Placas antigas mantêm seleção exaustiva de profundidade fixa ou gama HD original e continuam a contribuir sem reescrita.

A matriz imprime de face para cima, com fundação, primeira camada e receitas na ordem física normal. Quatro receitas de canto definem orientação e perspetiva. Fotografe sob luz frontal difusa. O Kromacut estima a placa e permite arrastar quatro pegas numeradas para centros de marcadores com mira ampliada. Uma grelha exata projetada e vista retificada mostram erros de perspetiva, inclinação e enviesamento antes de amostrar uma zona central recuada nas coordenadas projetivas próprias de cada casa. Este recuo evita bordos mesmo quando a perspetiva estreita um lado. Alinhamento manual ou pouco fiável exige confirmação explícita; confiança e revisão ficam guardadas. A amostragem bruta é a predefinição conservadora. A correção opcional de marcadores estima ganho de luz por canal das quatro receitas conhecidas, podendo reduzir dominante mas também ocultar uma diferença real dependente da luz.

Uma matriz concluída guarda cores sRGB previstas e fotografadas junto a receitas físicas imutáveis no perfil. Todas as matrizes compatíveis reajustam conjuntamente um modelo físico efetivo sem tocar amostras guardadas, calibração HD ou medidas brutas. O ajuste trata esses valores como pressupostos regularizados e usa cada amostra ponderada para estimar HD efetiva por canal RGB, cor opaca efetiva, expoente não linear de transmissão para sequências contíguas e interação ordenada entre filamento visível e substrato. Com pouca evidência mantém os pressupostos; o modelo ajustado só é usado com amostras suficientes e melhoria de ΔE reservado sem piorar a cauda de erro. Uma interação ajustada vale até à maior sequência contígua medida desse par. Espessura adicional não medida continua da cor apoiada para a amostra nominal com o pressuposto HD/cunha adequado ao substrato; não muda toda a sequência para outra previsão nem extrapola indefinidamente o expoente. O mesmo cálculo de prefixos alimenta pontuação, comparação e vista, incluindo empilhamentos comprimidos/alinhados.

O ajuste compara cores simuladas com sRGB fotografado por erro robusto, mantendo mistura física em luz linear. Assim diferenças em canais escuros têm peso suficiente. Penalizações prévias são médias por família de parâmetros nos materiais realmente presentes no treino; adicionar bobinas sem uso não enfraquece nem desativa o ajuste. A validação continua a decidir o uso. Melhor concordância em receitas conhecidas não prova exatidão para pares nunca medidos.

As matrizes também permanecem LUT empíricas dispersas no Lab previsto e receitas, pelo que uma placa nova esparsa não apaga anteriores. O Kromacut pondera cada placa por confiança de alinhamento revista, cobertura, recência e concordância robusta com receitas medidas por pelo menos duas outras placas. Uma ou duas observações mantêm concordância neutra por falta de evidência para identificar um valor atípico. Uma receita exata de profundidade fixa combina diretamente observações Lab. Uma ausente combina interpolações determinísticas de distância inversa de Lab fotografado próximo, pesando mais a ordem das camadas superiores dominantes. Só se interpola dentro da cobertura Lab prevista local e de uma vizinhança limitada de receitas; fora usa-se o modelo físico conjunto. Sem evidência compatível regressa a Beer-Lambert/HD guardado. Pontuação e vista partilham a previsão. Referências Exata têm prioridade, e casas de matriz são observações, não alvos desejados; imprimir uma matriz ampla não faz o otimizador perseguir todas as cores amostradas.

## Incerteza de previsão

Dentro da cobertura local, as correções interpoladas regressam suavemente ao modelo à medida que o apoio se esgota. Receitas exatas fotografadas mantêm as cores. Igualar só o material superior não basta: a fundação completa deve corresponder, ou o suporte alternativo ser suficientemente opaco e equivalente com a mesma interação imediata.

Para receita idêntica medida, pode estimar-se transferência para outro suporte profundo se o substrato imediato for o mesmo material e cores finais simuladas diferirem no máximo 1 ΔE00. A fundação inicial deve cumprir o limiar opaco segundo o ajuste atual ou o HD guardado; os diagnósticos registam qual apoiou a espessura. Uma impressão existente pode conservar o pressuposto que justificou a base quando um ajuste posterior muda o limiar. Transfere-se a correção com confiança reduzida e etiqueta **interpolada**, pois a equivalência é inferida, não medida independentemente. Esta exceção não permite interpolação geral sobre outro suporte.

Acrescentar o mesmo filamento terminal pode prolongar a correção de um prefixo medido. A influência atenua-se através da sequência original e desaparece em, no máximo, uma espessura extra de receita de matriz. Também se chama interpolada. Não prevê prefixos mais finos de uma medida posterior, e acrescentar outro material termina a continuação. Medições diretas e provas aplicáveis mantêm prioridade. Os diagnósticos identificam amostras e se houve transferência de suporte ou continuação em espessura.

Cada prefixo recebe confiança junto ao Lab previsto, mantendo quatro entradas visíveis em vez de certeza inexplicada:

- **Distância à medição:** distância de cor prevista e de receita física à medição compatível mais próxima.
- **Concordância local:** se vizinhos descrevem uma correção consistente entre simulado e fotografado.
- **Erro de validação:** a LUT prevê cada receita sem a sua própria amostra, usando seleção e atenuação iguais às reais. É verificação condicional com modelo ótico fixo, não estimativa independente integral. Separadamente, o ajuste ótico é refeito e testado em matrizes inteiras reservadas ou grupos de interações receita/substrato se só houver uma.
- **Método de previsão:** uma observação física exata começa com mais apoio que interpolação, ajuste ou simulação Beer-Lambert pura.

O otimizador acrescenta no máximo cinco pontos equivalentes ΔE a correspondência totalmente incerta. Basta para uma aproximação apoiada vencer um cinzento especulativo aparentemente perfeito, mas é limitado para não dominar grandes erros visíveis. Referências Exata mantêm prioridade e Preservar separação avalia viabilidade com ΔE00 bruto, não custo ajustado ao risco. Paletas, camadas finais e mapeamentos guardados retêm o mesmo objeto de confiança, evitando pressupostos diferentes entre procura e renderização.

A calibração fotográfica é sensível a câmara, exposição, reflexos, equilíbrio de brancos e luz. A cunha sem câmara continua preferida para HD. Use matriz para muitas receitas empíricas sob condições controladas e prova quando importam poucas cores de uma imagem.

## Distâncias de ocultação por canal

Filamentos não absorvem vermelho, verde e azul igualmente — laranja transmite vermelho mas bloqueia azul —, logo uma HD escalar é aproximada. O Kromacut mistura com três HD por canal:

- **Uma leitura de base (Rápido):** mede HD escalar. Diferenças RGB continuam estimativa prudente pela amostra, ancorada para o canal mais luminoso corresponder à medição.
- **Bases adicionais (Preciso):** cada base testa a curva de modo diferente. Ajusta-se uma intensidade limitada de seletividade e o escalar apenas quanto os intervalos quantizados exigem. Não se afirma que dois limiares visuais meçam independentemente três HD espectrais.

A curva afinada aplica-se diretamente a bases comparadas na cunha. Numa base não testada mantém-se Rápido, em vez de extrapolar forte mudança de matiz. Pode acrescentar bases quando conveniente, mas três ou quatro não são obrigatórias. HD totalmente independentes, transmissão não linear e interações específicas reservam-se a matrizes com validação e apoio de espessura.

A leitura opcional de fusão regista o último degrau adjacente ainda diferente. Valida a curva em vez de acrescentar parâmetro livre: grande discrepância reduz confiança e aparece em diagnósticos.

## Ajuste de JND da sessão

A JND predefinida de 2 ΔE00 é uma constante visual, mas observador e iluminação podem desviar-se. Com leituras multibase suficientemente informativas e independentes pode ajustar-se uma JND comum entre 1 e 3. Só se mantém se claramente identificável e melhor que a predefinição; leituras quantizadas são frequentemente ambíguas com HD escalar, mantendo então corretamente a constante.

## Confiança

Cada calibração tem uma pontuação de quão bem a medição ficou definida:

- Leituras nos extremos (casa 1 ou última) reduzem confiança: a opacidade real pode estar fora da gama. Imprima cunha mais longa ou camadas mais finas e recalibre.
- Leituras multibase discordantes mesmo no melhor ajuste reduzem confiança e deixam nota do desacordo.
- A confiança diminui após seis meses, pois filamentos envelhecem e bobinas mudam.

Filamentos não calibrados recebem menor pontuação conforme a plausibilidade da HD estimada.

## O que muda após calibrar

HD por canal alimentam **cores** previstas e **espessura** das transições. Calibrar pode alterar alturas e trocas, não só a vista.

A calibração pertence ao material medido: liga-se à cor da amostra, editar a cor desativa-a e recalibrar substitui a medida anterior em vez de fazer média.
