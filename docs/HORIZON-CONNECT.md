# Horizon Connect e Inbox

Consulta de fontes oficiais em 22/10/2026. Nenhuma conta bancária foi conectada nesta implementação.

## Entrega atual

- Connect distingue contas cadastradas, importação manual e sincronização do cofre. OFX/CSV usam o importador existente, com revisão e confirmação antes da gravação.
- A conexão automática está **não configurada**. Não existe botão fictício de conexão, chamada a banco, pagamento ou segredo de provedor no navegador.
- A data exibida para registros `import:` é a última **alteração** conhecida, incluindo edição/exclusão. A estrutura atual não registra o instante da importação; portanto não se inventa uma data de importação bancária.
- Inbox permite editar categorias, revisar possíveis duplicidades e conciliar explicitamente um par de transferência própria. Erros e conflitos do cofre levam às configurações.

## Regras de reconciliação

Os candidatos são sugestões locais, nunca decisões automáticas. “Outros” permanece uma categoria válida. Duplicidades exigem coincidência de conta, tipo, situação, data, valor em centavos, moeda, descrição, categoria, forma de pagamento, cartão, identificador bancário e campos financeiros relacionados. Identificadores bancários diferentes não são considerados duplicados exatos. Mesmo dados idênticos podem representar duas compras legítimas.

Transferências sugeridas exigem entrada e saída confirmadas, mesmo valor e data, BRL e contas cadastradas diferentes. Cartões, pagamentos de fatura, parcelas, datas futuras/inválidas, valores inválidos e registros em conflito são excluídos. Correspondências múltiplas são sinalizadas; até 200 pares são exibidos por revisão de tela, começando pelos mais recentes.

Depois de conferir o par e marcar a confirmação, uma única chamada `store.edit` converte a saída em transferência com conta de destino e aplica tombstone à entrada. Os dados originais ficam preservados. O motor confere que nenhum dos dois saldos mudou. A receita e a despesa artificiais deixam de aparecer nos totais.

Movimentações vinculadas a aportes são bloqueadas para revisão do vínculo primeiro. A validação central existente de aportes continua executada em todas as gravações. Nenhuma reserva ou simulação é convertida em dinheiro real. As ações conferem novamente os dados em memória antes da gravação; conflitos entre dispositivos continuam tratados pelo mecanismo central de versões.

## Provedores pesquisados

| Provedor | Nubank e Banco do Brasil | Ambiente e condições |
| --- | --- | --- |
| Pluggy | PF/PJ, com contas, transações, cartões e investimentos na matriz pública. A cobertura é agregada entre contextos: conferir `products` do conector específico. | Sandbox sintético e teste de produção por 15 dias. Dados a partir de R$ 2.500/mês, atualmente até 500 conexões ativas; confirmar proposta. |
| Belvo | PF/PJ sem indicação beta; contas/transações/cartões e histórico documentado de 12 meses. | Sandbox gratuito fictício. Produção passa por avaliação comercial e certificação. Launch publicado por R$ 1.500/mês com restrições de segmento; **uso pessoal não é atendido** segundo a página de preços. |
| Klavi Conecte | BB 001 e Nubank 260 listados para PF/PJ. Produtos de conta, saldo e cartão documentados; matriz completa por banco não confirmada publicamente. | Sandbox simulado; Testing permite dados reais com limite diário; produção separada. Não foi localizado preço público numérico nas páginas consultadas. |

Fontes: [Pluggy cobertura](https://docs.pluggy.ai/en/docs/open-finance/institutions-coverage), [Pluggy preços](https://www.pluggy.ai/precos), [Belvo cobertura](https://developers.belvo.com/pt-br/developer_resources/resources-available-institutions), [Belvo preços](https://belvo.com/pt-br/planos-precos/), [Belvo produção](https://developers.belvo.com/apis/belvoopenapispec/section/introduction/sandbox), [Klavi instituições](https://docs.klavi.ai/connect/participant-institutions), [Klavi ambientes](https://docs.klavi.ai/connect), [Klavi produtos](https://docs.klavi.ai/connect/xkr8-overview).

A alternativa pessoal Meu Pluggy tem fluxo próprio, limite de cinco conexões ativas por titular e não oferece SLA comercial. Itens proxy acompanham a sincronização do serviço original e não permitem atualização manual pela aplicação. Não confundir essa modalidade com o onboarding comercial dentro do My Horizon+. [Condições](https://www.pluggy.ai/precos) e [sincronização](https://v2.docs.pluggy.ai/pt/docs/connections/item).

## Requisitos antes de produção automática

1. Escolher e contratar um parceiro; confirmar cobertura por banco, contexto e produto, frequência, custos, retenção e condições de serviço.
2. Implementar backend autenticado e banco operacional transacional, com isolamento entre usuários, idempotência e auditoria. O cofre/backup Drive atual continua preservado; esta entrega não o apresenta como banco transacional bancário.
3. Manter segredos exclusivamente no servidor. No exemplo Pluggy, o frontend recebe somente um Connect Token limitado (30 minutos), nunca `clientSecret`. [Autenticação oficial](https://v2.docs.pluggy.ai/pt/docs/connect-widget/authentication).
4. Usar somente conectores `isOpenFinance=true`, sem fallback que solicite senha bancária; contratar exclusivamente leitura e omitir completamente endpoints de pagamento. [Conectores](https://docs.pluggy.ai/en/docs/open-finance/overview).
5. Configurar URLs HTTPS de retorno e webhooks, validar autenticidade conforme o parceiro e processar eventos de forma idempotente. Não usar callback do navegador como confirmação de negócio. [Pluggy webhooks](https://v2.docs.pluggy.ai/en/docs/connect-widget/environments), [Klavi segurança](https://docs.klavi.ai/connect/security).
6. Implementar consentimento informado, finalidade, dados autorizados, validade e revogação; cumprir os acordos de proteção de dados. A autenticação acontece no banco. [BC: compartilhamento](https://www.bcb.gov.br/meubc/faqs/p/como-levar-seus-dados-de-um-banco-para-outro), [BC: cancelamento](https://www.bcb.gov.br/meubc/faqs/p/como-cancelar-uma-autorizacao-no-open-finance).
7. Homologar com contas reais e consentimento do titular. Cobertura documental não comprova que os dados de uma conta específica estarão completos ou disponíveis em tempo real.

Somente instituições autorizadas participam diretamente do Open Finance; parceria com entidades não autorizadas depende do arranjo regulatório e consentimento expresso. O My Horizon+ não deve se apresentar como participante regulado independente. [BC participantes](https://www.bcb.gov.br/meubc/faqs/s/open-finance), [Resolução Conjunta nº 1, art. 36](https://normativos.bcb.gov.br/Lists/Normativos/Attachments/51028/Res_Conj_0001_v4_P.pdf).

## Integração do componente

`ConnectInbox({ view: 'connect' | 'inbox', navigate, onEdit })` importa seu próprio CSS. O host fornece a navegação para `import`, `account`, `inbox` e `settings`, além do editor de movimentações existente. Nenhuma alteração em `App`, modelo, chaves de armazenamento ou store foi necessária nestes arquivos.

Testes em `tests/reconciliation.test.ts` cobrem conservação dos saldos e patrimônio, exclusão de receita/despesa do par conciliado, tombstones, vínculos com aportes, ambiguidades, conflitos, revisão desatualizada, centavos, cartões, falsos positivos e origem manual.
