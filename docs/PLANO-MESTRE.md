# Evolução incremental do My Horizon+

Auditoria e entrega de 22 de outubro de 2026. O projeto existente foi evoluído,
sem recriar o aplicativo ou migrar destrutivamente os cofres.

## Base preservada

Contas, lançamentos, cartões, faturas, recorrências, orçamento, posições de
patrimônio, importador OFX/CSV/XLSX, planos de aportes, fotos, backups e
sincronização existente continuam acessíveis. IDs internos de páginas,
entidades, cofre, proprietário Google, banco IndexedDB, escopo `drive.file`,
formato criptográfico e endereço foram mantidos.

O modelo `schema:1` não recebeu novos tipos. Preferências, cenários, anotações
e observações são registros identificados dentro de `simulation`, com `tab`
próprio. Listagens de simuladores legados aceitam somente tipos reconhecidos;
metadados internos não aparecem como simulações de compra.

## Entregas por fase

| Fase                         | Implementado nesta evolução                                                                                                                                                                    | Próximas dependências ou extensões                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fundação                     | Navegação em cinco áreas, subnavegação contextual, design compartilhado, dashboard em três perguntas, personalização persistida, modo de privacidade visual, carregamento separado dos módulos | Avaliações contínuas com usuários reais                                                                                                               |
| Meu Dinheiro                 | Recursos existentes preservados; calendário diário/semanal/mensal, revisão de categorias, duplicidades e transferências, reserva ligada à meta, contexto de orçamento                          | Conexão bancária real depende do backend e parceiro                                                                                                   |
| Meus Horizontes              | Fotos e aportes existentes, descrição, outras categorias, aportes complementares com reajuste anual, prioridades/dependências, Life e Map, cenários de distribuição sem duplicação             | Compartilhamento entre pessoas precisa de autorização e banco operacional                                                                             |
| Meu Futuro                   | Motor mensal até 600 meses; nominal/real; taxas configuráveis padrão zero; perda de renda, retiradas, comparações até três cenários, Decisions, hipóteses de liberdade e impacto nas metas     | Contabilização específica de dividendos realizados e amortização de dívidas exige novos registros próprios; não é inferida de avaliações patrimoniais |
| Conectividade e inteligência | Connect com disponibilidade honesta, extratos funcionais, Pulse por dispositivo, Score explicado, padrões de gastos/possíveis assinaturas e assistente matemático local                        | Open Finance e IA generativa remota não foram conectados artificialmente                                                                              |
| Refinamento                  | Diário, marcos comprováveis/manuais com fotos, Wrapped, observações patrimoniais, Excel/CSV/PDF, acessibilidade, privacidade e divisão de código                                               | Documentos volumosos, MFA/passkeys/biometria e identidade compartilhada dependem da arquitetura de servidor                                           |

Nenhum recurso indisponível recebe um botão de ativação sem implementação.
Não foram criados novos simuladores específicos de compras ou viagens.
Os simuladores anteriores permanecem no acesso secundário de compatibilidade.

## Regras financeiras e premissas

- `finance.ts` e `contributions.ts` permanecem a fonte dos saldos. O corte de
  data exclui entradas futuras e avaliações futuras. Compras de cartão já
  efetuadas continuam como obrigações, inclusive parcelas de faturas futuras.
- A capacidade prudente de guardar é o menor valor entre dinheiro livre e
  sobra do mês, deduzindo de ambos as despesas previstas. Não é uma garantia
  se houver compromissos não cadastrados. No Início, essa pergunta usa o mês
  atual; filtros de relatório afetam somente os indicadores identificados.
- Aportes planejados não alteram reservas. Aportes/retiradas realizados não
  criam receita ou despesa. Alocar para investimento nos cenários desloca
  dinheiro internamente, sem fabricar patrimônio.
- O calendário mostra compras e faturas em papéis diferentes. Faturas
  remanescentes são reduzidas por pagamentos explícitos para evitar cobrar
  o mesmo compromisso duas vezes. Reservar dinheiro não debita a conta.
- Reajustes de aportes complementares ocorrem em aniversários completos da
  primeira ocorrência. São hipóteses configuráveis; a validação impede
  valores que ultrapassem o cálculo seguro em centavos.
- Life e Map exibem os planos individuais e uma hipótese separada de ordem
  e dependências. O orçamento único e o impacto do Forecast compartilham a
  regra de prioridades; cada recurso é usado uma única vez. Nenhuma dessas
  comparações reescreve planos ou confirma aportes.
- Dependências não bloqueiam aportes manuais. Um pré-requisito sem estimativa
  ou em ciclo não produz uma data fictícia. O editor impede novos ciclos.
- Score é educativo, exige três meses completos observados e informa seus
  fatores/cobertura. Histórico ausente não vira ausência de gastos. Aportes
  ainda não vencidos não geram penalização. Reservas inconsistentes suspendem
  a pontuação.
- Anomalias e assinaturas são sugestões verificáveis. Parcelamentos
  identificados não são classificados como assinaturas. Não há alterações
  automáticas de categorias ou exclusão automática de duplicados.
- IA local suporta perguntas delimitadas e informa suas premissas. Cálculos
  não são terceirizados a um modelo. Perguntas fora da capacidade disponível
  são direcionadas às ferramentas, sem inventar respostas.
- Wrapped não reconstrói cotações ou patrimônio anterior sem evidências. O
  histórico patrimonial começa nas observações reais guardadas no cofre.
  Conclusões antigas são reconstituídas pelo alvo atual e rotuladas como tal.

## Persistência e concorrência

Mudanças passam por `store.edit`, vetores de versão e criptografia existente.
Preferências de dashboard e anotações acompanham backups e o mesmo cofre.
Pulse e observações usam IDs por dispositivo para não transformar visitas
simultâneas em conflitos de preferências globais. O Pulse não cria dados
bancários; compara registros e saldos cadastrados.

O banco operacional desta versão continua sendo o IndexedDB local. O Drive
transporta snapshots criptografados existentes e backups; **não fornece
transações distribuídas**. Edições independentes offline podem exigir revisão
ao serem mescladas. Uma verificação de integridade sinaliza reservas
incompatíveis com o caixa, fontes duplicadas ou histórico de retirada inválido,
preservando todos os registros e exigindo correção explícita. Isso não deve ser
apresentado como garantia transacional entre dispositivos.

Antes de lançar compartilhamento ou sincronização bancária automática,
implementar API autenticada e banco operacional com transações, autorização
por usuário/membro, unicidade de identificadores externos, idempotência de
webhooks e controle de revisão. Um desenho possível é PostgreSQL com RLS e
controle de concorrência. A escolha de infraestrutura deve anteceder a
migração de produção, preservando IDs, comparando contagens e valores e
mantendo o backup criptografado antigo até a restauração ser verificada.

Não se deve enviar a senha-mestra ao servidor para facilitar essa migração.
Compartilhamento de chaves e recuperação de identidade precisam de desenho
específico; autenticação e recuperação do cofre são processos distintos.

## Serviços externos

Leia [HORIZON-CONNECT.md](HORIZON-CONNECT.md) para cobertura, preços públicos,
elegibilidade e fontes oficiais de Pluggy, Belvo e Klavi. Não houve contratação,
consentimento real ou acesso a contas Nubank/BB. Open Finance será apenas de
leitura, sem coleta de senha, Pix, transferências ou pagamentos.

IA generativa futura exige endpoint autenticado, consentimento específico,
minimização de dados, política de retenção e orçamento de serviço. A versão
local funciona sem chave de API e identifica expressamente essa capacidade.

MFA/passkeys, documentos e metas compartilhadas não são simulados com
preferências de tela. Documentos maiores precisam de armazenamento privado
com permissões, validação e limites próprios; não devem ser embutidos
indiscriminadamente nos snapshots completos do cofre.

O domínio e o branding do consentimento Google continuam configurações
externas. Nenhum Client ID, origem autorizada ou DNS foi alterado.

## Validação

Os testes financeiros existentes são mantidos, com novos testes de projeções,
calendário, reconciliação, dependências, diário, retrospectiva, inteligência e
integridade. Os fluxos de interface verificam desktop e celular, preservação
do cofre, fotos, revisão explícita e cenários isolados. Testes de Google/Drive
usam respostas simuladas; não comprovam uma autorização bancária real.
