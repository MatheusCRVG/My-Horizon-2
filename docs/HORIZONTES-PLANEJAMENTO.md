# Planejamento integrado em Meus Horizontes

O fluxo de criação tem cinco etapas: categoria, escolha entre **Definir valor** e
**Planejar meu horizonte**, orçamento, aportes e revisão. Voltar entre etapas
preserva os campos, inclusive orçamentos por categoria, foto e plano de aportes.
Nenhuma etapa anterior à confirmação cria registros financeiros.

## Estrutura e persistência

Novos horizontes de todas as categorias usam o tipo existente `goal`. O valor
financeiro confirmado continua em `data.target`, e a reserva inicial em
`data.saved`. O orçamento é guardado em `data.planner`, com versão 1 e tipos
`travel`, `car`, `savings`, `reserve` ou `items`. Não foram alterados IDs,
armazenamento, formato do cofre, autenticação ou escopos Google.

Todos os lugares consultam o mesmo horizonte e o mesmo motor de aportes:
dashboard, listagem, detalhes, calendário, Life, Map e projeções. O orçamento
não cria outro cadastro de objetivo. Fotos usam o componente compartilhado,
incluindo validação, compressão e enquadramento existentes.

As viagens anteriores do tipo `trip` continuam com sua moeda, câmbio, cenário
e editor originais. Ganham a seção Meu Planejamento e confirmação de mudanças
de estimativa ou cenário, sem conversão destrutiva dos dados.

## Convenções dos orçamentos

- Todos os valores dos novos planejadores são estimativas em reais informadas
  pelo usuário. Não há pesquisa de preços, cotações ou valores pré-preenchidos.
- Viagem: o transporte de ida e volta pode ser por pessoa ou pelo grupo. O custo
  de carro começa como total do grupo. Hospedagem é o total do grupo por noite;
  alimentação é por pessoa por dia. Passeios, transporte local e adicionais são
  totais do grupo. Imprevistos são um valor fixo ou uma porcentagem aplicada uma
  única vez sobre o subtotal. Noites começam como dias menos um, mas são editáveis.
- Carro: veículo + despesas iniciais + reserva adicional. O dinheiro guardado
  reduz somente o restante, sem reduzir novamente o valor total da meta.
- Juntar dinheiro: saldo inicial de referência + aporte mensal × meses, sem
  rendimento, ou um valor final direto. A referência fica congelada no orçamento
  salvo: novos aportes realizados não elevam a meta automaticamente. Durante a
  criação, alterar o saldo inicial atualiza também os rascunhos dessa categoria.
- Reserva: despesas essenciais mensais × meses de cobertura + reserva adicional.
- Casa, estudos e objetivos personalizados: soma de itens totais editáveis,
  com sugestões de nomes conforme a categoria. Não há cálculo de financiamento.
- Multiplicações monetárias usam centavos inteiros; a porcentagem de imprevistos
  arredonda uma única vez para centavos. O total máximo permitido é R$ 1 bilhão.

## Aportes e datas

O fluxo reutiliza `SavingPlan`, as ocorrências e os registros existentes. Oferece
prazo em meses, valor mensal fixo, data desejada, aportes personalizados por data,
complementares semanais/mensais/avulsos e a opção de planejar depois.

Somente registros confirmados aumentam o acumulado. Reservar saldo inicial ou
registrar aportes não cria receitas, despesas nem saldo bancário. As validações
centrais continuam impedindo reservar o mesmo dinheiro em várias metas.

O primeiro aporte define a âncora mensal. Dias 29–31 usam o último dia do mês
quando necessário; os intervalos são inclusivos. Planejamentos novos usam datas
de hoje em diante. Um prazo sem ocorrências disponíveis pede ajuste em vez de
substituir silenciosamente um aporte existente por zero.

O aporte necessário considera o restante líquido e os complementares ainda não
pagos. Uma ocorrência parcialmente paga reduz só sua parcela futura; o cálculo
em centavos resolve essa mesma regra para não descontar o pagamento duas vezes.

A data da viagem pertence ao orçamento. Editar o ritmo de aportes não altera
essa data. Previsões que ultrapassam o prazo são identificadas, sem prometer que
o objetivo será alcançado na data desejada.

## Alterações e revisão

Meu Planejamento permite revisar os custos dentro do horizonte. O valor total
antigo, o novo valor, o restante e os efeitos no plano são apresentados antes
de **Confirmar atualização**. O usuário pode recalcular mantendo a estratégia
ou preservar os aportes configurados. Aportes fixos ajustam a previsão; prazos
fixos ajustam o valor mensal necessário.

Versões de orçamentos são mantidas em `plannerHistory`; viagens anteriores usam
`tripBudgetHistory`. Aportes, retiradas, foto e demais metadados são preservados.
A edição geral não permite sobrescrever o alvo calculado nem a data derivada de
uma viagem: esses campos são alterados pelo planejamento específico.

A gravação verifica a versão do horizonte dentro da fila de persistência, após
mesclar o cofre local. Também confere o histórico de aportes usado na revisão e
impede confirmar quando há conflitos pendentes. Uma edição mais recente pede
reabertura e nova revisão. Isso preserva o mecanismo de sincronização existente,
sem alegar transações distribuídas entre dispositivos offline.

## Verificação

`tests/horizon-planning.test.ts` cobre fórmulas, centavos, valores inválidos,
preservação de histórico, recálculo e concorrência. O novo conjunto de interface
em `tests/e2e/horizon-planning.spec.ts` percorre as duas jornadas nas oito
categorias, fotos, retornos de etapa, aportes/retiradas, revisão e dashboard.

`scripts/check-horizon-planning.mjs` confere quatro larguras, detalhes, claro e
escuro. Os fluxos existentes de cofre criptografado, restauração Google/Drive
simulada e PWA offline continuam na validação de regressão.
