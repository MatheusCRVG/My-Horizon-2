# Aportes integrados · Horizon One

Metas e viagens agora distinguem saldo inicial reservado, planejamento e histórico de aportes. O campo `data.saved` anterior continua intacto, como reserva inicial. Nenhuma migração destrutiva ou lançamento bancário é criado automaticamente.

## Uso

- Em uma meta ou viagem, **Planejar aportes** oferece valor mensal, quantidade de meses ou data desejada. O primeiro aporte define o calendário; outros aportes podem ser mensais, semanais ou avulsos, com início, fim e intervalo.
- **Registrar aporte** cria uma reserva de dinheiro existente. Somente registros confirmados, com data até hoje e vínculo válido quando informado, aumentam o reservado. Um registro previsto pode ser editado e confirmado depois.
- Aportes previstos avulsos entram nas projeções e nos totais planejados, sem aumentar a reserva. Ao confirmá-los, data e valor da previsão são preservados para a comparação com o realizado. Se já representam uma ocorrência do plano, use o vínculo para contar aquela previsão uma única vez.
- Aporte extra permite manter o valor mensal e antecipar a estimativa, ou manter a data e recalcular os próximos aportes. Editar e excluir o extra também atualiza esse cálculo.
- Para antecipar uma ocorrência já planejada, vincule o registro ao aporte e à data prevista correspondentes. A projeção desconta o que já foi confirmado nessa ocorrência.
- **Ver evolução** mostra aportes acumulados planejados e realizados, valores mensais, diferença, média, restante, previsão e histórico editável. Filtros abrangem metas e viagens e o período escolhido. O saldo inicial aparece separado: ele não é inventado como histórico de aportes.
- O cenário Econômico/Padrão/Confortável da viagem altera o alvo estimado; o histórico de reservas permanece igual. A necessidade mensal considera a data da viagem.
- O dashboard usa mais largura e mostra aportado, planejado, progresso agregado, últimos seis meses e atalhos. O período segue o filtro do dashboard; valores de aportes abrangem todos os objetivos, independentemente dos filtros de conta/categoria de lançamentos.
- Simuladores → **Aportes e metas** permite até três cenários na comparação, gráficos e tabela mensal, salvar, reabrir e converter explicitamente em meta. Compras, veículo, moradia e reserva também oferecem um plano de poupança separado dos custos de uso e financiamentos.
- Converter cria uma meta com reserva real zero. O saldo inicial e os rendimentos hipotéticos da simulação não se transformam em dinheiro real.

## Convenção de cálculo

Datas são civis locais no formato YYYY-MM-DD. Início e fim são inclusivos. Mensais mantêm o dia do primeiro aporte; 29–31 são limitados ao último dia do mês sem perder a âncora original. Semanais repetem a cada 7 dias × intervalo. Aportes posteriores ao fim ou anteriores ao início do período consultado não entram na soma.

Sem rendimento, o necessário é o restante menos os aportes complementares ainda previstos, dividido pelas ocorrências mensais disponíveis. Arredonda-se para cima no centavo. Uma ocorrência mensal já integralmente confirmada não permanece no divisor; isso mantém a necessidade aproximadamente constante quando as contribuições previstas são feitas. O prazo com valor fixo usa a primeira ocorrência em que o alvo é atingido, respeitando o arredondamento para cima do número de aportes. Valores intermediários são contabilizados em centavos.

As previsões reais não supõem rendimento. A previsão pode ultrapassar a data desejada e é identificada como estimativa. Com aporte zero, prazo vencido, período sem ocorrência ou ausência de conclusão em até 600 meses, o app informa que não há previsão ou pede a revisão do prazo. Uma meta já concluída tem restante e necessidade zero.

A taxa mensal opcional do simulador inicia em zero e é apenas hipótese. Incide sobre o saldo de abertura de meses completos; novos aportes rendem do mês seguinte em diante. Meses parciais não recebem juros. A necessidade mensal indicada continua calculada sem rendimento. O horizonte exibido e a data de conclusão são conceitos separados: uma projeção de 24 meses pode ter uma conclusão estimada posterior.

Revisões de planos ficam em `planHistory`, com vigência a partir da revisão. Alterações no mesmo dia substituem a previsão desse dia; revisões em dias posteriores preservam os períodos anteriores. Os registros realizados são entidades independentes e continuam disponíveis após ajustes do plano.

## Persistência e prevenção de duplicação

O novo tipo `contribution` usa o mesmo documento, vetores de versão, tombstones, criptografia AES-GCM, IndexedDB, backup e sincronização Drive do app. O formato externo do cofre continua com schema 1, agora aceitando o tipo adicional. Não há novo serviço de dados, segredo no navegador ou mudança de escopo OAuth; o Drive continua em `drive.file`.

Reservas novas não podem superar o total livre das contas e investimentos financeiros cadastrados, descontadas as reservas existentes e as faturas. Origens específicas também têm validação de saldo dos aportes vinculados. Metas e viagens compartilham o mesmo total reservado. Saldos antigos são preservados mesmo se o documento já estiver sobrealocado; novos aumentos são bloqueados enquanto não houver cobertura.

Vínculos aceitam entradas e transferências confirmadas, nunca despesas ou pagamentos de fatura. Uma movimentação só pode vincular um aporte. O aporte não copia, edita ou cria a movimentação. Excluir o aporte libera a reserva e mantém a movimentação; excluir uma meta ou viagem remove seus aportes por tombstones. Uma conta ou movimentação com vínculos não pode ser excluída antes de resolver os vínculos.

## Validação

`tests/contributions.test.ts` cobre prazo, datas inclusivas e recorrência, extras, edição/exclusão, confirmação, insuficiência de saldo, vínculo duplicado, cenário de viagem, revisão de plano e registro antecipado. Os testes de navegador cobrem os fluxos no desktop e celular e a restauração/mesclagem de aportes criptografados em outro navegador com Drive simulado. O teste de PWA verifica recarga e desbloqueio offline no build de produção.
