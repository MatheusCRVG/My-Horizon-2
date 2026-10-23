# Domínio próprio · Horizon One

Situação em 22/10/2026: o site suporta conexão de domínio próprio e ainda não possui nenhum domínio conectado. A escolha de nome solicitada é “myhorizon”. Não foi realizada compra, reserva, conexão de hostname de terceiros ou alteração de DNS.

## Pesquisa no registro

| Nome | Resultado da consulta RDAP |
|---|---|
| myhorizon.com | Registrado |
| myhorizon.com.br | Registrado |
| myhorizon.app | Registrado |
| myhorizonone.com | Registro não encontrado |
| myhorizonone.com.br | Registro não encontrado |

Sugestão: **myhorizonone.com.br** para uso no Brasil, ou **myhorizonone.com** para um endereço internacional. A ausência de registro RDAP é uma indicação de disponibilidade; a confirmação final, eventual reserva e o preço são determinados pelo registrador no momento do pedido.

Fontes da pesquisa: [Verisign .com](https://rdap.verisign.com/com/v1/domain/myhorizon.com), [Registro.br](https://rdap.registro.br/domain/myhorizon.com.br), [Google Registry .app](https://pubapi.registry.google/rdap/domain/myhorizon.app). Os candidatos sem registro responderam HTTP 404 nas consultas correspondentes. O [Registro.br](https://registro.br/dominio) anuncia o registro padrão .br por R$ 40 ao ano; confira a contratação antes de pagar.

## Etapas para ativar

1. Registre o nome escolhido em sua própria conta no registrador. Para .com.br, pode usar o Registro.br. Anote o domínio exato e onde o DNS é administrado. Não compartilhe senhas ou dados de pagamento com o aplicativo.
2. Antes de trocar de endereço, abra o aplicativo atual, sincronize o cofre com o Google Drive e exporte um backup criptografado. Confirme que não há alterações pendentes.
3. Após confirmar a propriedade e a escolha do hostname, conectar o domínio à publicação existente do Sites usando seu project_id atual. A ferramenta devolve os registros DNS reais: CNAME para subdomínio, alvos A para domínio raiz e os registros de validação indicados pelo provedor. **Ainda não existem valores DNS para copiar**, porque o domínio não foi conectado. Não usar IPs ou CNAMEs presumidos.
4. Adicione os registros retornados ao DNS do domínio. Confira a emissão do certificado e os estados de validação até que o domínio e o HTTPS fiquem ativos. Preservar a política de acesso privado do site; domínio próprio não exige tornar os registros financeiros públicos.
5. No mesmo Client ID Google já usado pelo app, adicione a origem exata em **Origens JavaScript autorizadas**. Para a sugestão .com.br, seria `https://myhorizonone.com.br`. Mantenha a origem antiga e localhost durante a migração. Caso escolha `app.myhorizonone.com.br`, cadastre essa origem; cada hostname é uma origem diferente. A integração continua usando `drive.file`, openid, email e profile, sem client_secret no frontend.
6. Atualize, conforme exigido pelo Google Cloud, domínio autorizado, URL da página inicial e política de privacidade da tela de consentimento. O fluxo atual usa Google Identity Services por popup, sem endpoint de callback próprio. [Regras oficiais do Google](https://support.google.com/cloud/answer/15549257?hl=pt-BR).
7. Abra o novo endereço, entre com a mesma conta Google e desbloqueie usando sua senha-mestra ou recuperação. Os snapshots do Drive serão mesclados. Verifique contas, lançamentos e última sincronização antes de passar a usar somente o domínio novo.
8. Instale a PWA pelo novo endereço, se desejar. A instalação e o armazenamento local são separados por origem.

## O que a mudança de endereço implica

O IndexedDB e o service worker do domínio antigo não são transferidos automaticamente pelo navegador. Manter o Client ID Google, conta, formato de criptografia e pasta do Drive permite abrir o mesmo cofre no novo endereço. Se houver apenas dados locais não sincronizados, use a restauração do backup criptografado no domínio novo antes de iniciar novos registros. Não crie um segundo cofre vazio enquanto ainda está migrando o primeiro.

O endereço antigo permanece operacional durante a transição. Não foi implementado redirecionamento automático: ele poderia impedir o acesso a dados que ainda estivessem apenas no navegador antigo. Após validação da migração e preferência do proprietário, o endereço profissional pode ser divulgado como principal.
