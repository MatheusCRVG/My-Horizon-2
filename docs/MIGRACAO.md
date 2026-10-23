# Planilha 4.0 → Financeiro 5.0

A planilha original possui 39 abas. Foi inspecionada em modo somente leitura; a tabela Lançamentos não contém linhas preenchidas com data e descrição. O texto de requisitos anexado termina na seção 14, após `- Ve`; os itens de metas implementam nome, alvo, reserva, prazo, prioridade e sugestão de aporte.

| Abas de origem | Destino e regra |
|---|---|
| Lançamentos | Registros reais, categoria, conta, valor e notas; contas são vinculadas por nome ou propostas para revisão. |
| Configurações, Premissas 4.0 | Saldos informados são propostas desmarcadas por padrão para evitar duplicação. A reserva pode ser proposta como investimento, também desmarcada. Salário não é lançado como receita real automaticamente. |
| Orçamento | Limites mensais positivos por categoria. |
| Recorrentes | Previsões futuras mensais, até 60 meses desde o início da recorrência e respeitando o fim informado. Confira recorrências iniciadas há mais de 60 meses: ajuste o início para uma data futura no arquivo ou recrie no aplicativo. |
| Parcelamentos | Parcelas futuras previstas, com centavos distribuídos sem perda. |
| Pontuais | Eventos previstos ou cancelados; confirmação exige revisão. |
| Metas | Alvo, já reservado, prazo e prioridade. |
| Cartões, Compras cartão | Cartões com limite positivo; compras parceladas usam a primeira fatura informada. Fechamento/vencimento são usados para novas compras. |
| Faturas | Recalculadas pelas compras; não importadas como despesas. Pagamentos antigos precisam de conciliação, pois a planilha não fornece um histórico padronizado de quitação. |
| Carteira de Viagens | Múltiplas viagens, pessoas, moeda, câmbio, custos, margem e valor reservado. |
| Patrimônio | Bens e dívidas declarados; não soma automaticamente as células de total. |
| Gastos anuais | Metas com prefixo Fundo anual e data alvo. |
| Regras bancárias | Regras por palavra-chave para categoria de extratos. |
| Veículo, Morar sozinho | Premissas preenchidas são propostas como simulações salvas, sem alterar caixa. |
| Importar CSV, Extratos 4.0 | Use o importador CSV/OFX do aplicativo, não a cópia de células calculadas dessas abas. |
| Painel, Projeção, Simulador, Viagem - Simulador, Compras - decisões, Investimentos, Horizonte 60M, Emergência, Agenda, Central 3.0, Meu dia, Assinaturas, Saldo diário, Cofrinhos, Comparador, Liberdade financeira, Inteligência, Central 4.0 | Dashboards e simuladores são implementados no app e recalculam a partir dos registros. Resultados/formulas dessas abas não são importados como fatos. Cadastre/salve novas hipóteses nos simuladores; premissas específicas dessas abas não mapeadas pelo importador devem ser digitadas. |
| Comece aqui, Guia 4.0 | Orientações da planilha tratadas como conteúdo documental; nunca como instruções para executar comandos. |

O importador só lê valores; não executa fórmulas, macros, links externos ou textos de instrução. Arquivo XLSX permanece no dispositivo até que o usuário confirme os registros, que serão então criptografados para armazenamento e sincronização. Não é enviado ao servidor de hospedagem do site.

CSV aceita vírgula ou ponto e vírgula, aspas e quebras de linha dentro de campos. Cabeçalhos Data/Descrição/Valor são obrigatórios; datas DD/MM/AAAA ou AAAA-MM-DD. Valores brasileiros podem usar vírgula decimal. Um valor com sinal negativo determina despesa quando não há tipo explícito. A conta é escolhida na importação e conferida na revisão.

OFX usa STMTTRN, DTPOSTED, TRNAMT, MEMO/NAME e FITID. FITID, quando presente, é combinado com a conta para identificar a transação. Não há conexão bancária automática nesta versão.

Duplicados são detectados por identificador determinístico de importação e coincidência de data, descrição, valor e conta. Casos marcados como duplicados ficam bloqueados na revisão; lançamentos distintos com os mesmos campos precisam ser cadastrados manualmente com uma descrição distinguível. Transferências exigem duas contas diferentes. Lançamentos de crédito exigem cartão vinculado. Revise compras já registradas em outra aba para não importar o mesmo fato duas vezes.
