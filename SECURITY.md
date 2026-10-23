# Segurança — My Horizon+ independente

## Cofre e compatibilidade

Cada cofre mantém o formato existente `financeiro5:1`, o proprietário criptográfico (`owner`) e o UUID original. O vínculo com Supabase fica em `accountId`, separado do identificador usado no AAD. Importar não renomeia IDs de metas, aportes, fotos, transações ou versões.

A chave aleatória de dados tem 256 bits e cifra o documento com AES-256-GCM. Ela é protegida separadamente pela senha-mestra e por uma chave de recuperação aleatória. A derivação usa PBKDF2-HMAC-SHA-256 com 600.000 iterações e salt aleatório de 16 bytes. Cada cifragem gera IV aleatório de 12 bytes; o AAD vincula formato, versão, proprietário e cofre. A chave de recuperação em texto claro não integra o envelope.

A chave é importada como CryptoKey não exportável e mantida na memória durante a sessão. Bytes temporários são zerados quando possível; JavaScript e o garbage collector não garantem apagamento físico da RAM. Senha da conta, senha-mestra e chave de recuperação têm papéis diferentes. Redefinir a senha da conta não decifra o cofre sem senha-mestra ou recuperação.

## Armazenamento local

O Tauri usa SQLite com comandos restritos, WAL, migrações e transações de cofre/fila/recibos. A versão web mantém o nome do IndexedDB e adiciona a fila sem apagar a store anterior. Valores, fotos, notas, planos, entidades e conflitos ficam cifrados antes da persistência. A sessão Supabase também é cifrada com a chave do cofre e AAD próprio.

Identificadores, datas técnicas, cursores, estado de autorização e dispositivo não são cifrados. Este projeto usa criptografia dos dados da aplicação, não SQLCipher/criptografia integral do arquivo. Tokens persistentes não são gravados em texto claro no localStorage. A configuração pública do servidor, o Client ID público, tema, bloqueio e o verificador temporário PKCE não são segredos de backend.

## Conta, bloqueio e saída

Supabase Auth oferece e-mail/senha e Google por código/PKCE. A sessão é validada no servidor antes de autorizar vínculo; o login Google nativo abre o navegador externo e retorna por deep link. Chaves `service_role` e `sb_secret_*` são rejeitadas pela configuração do frontend. Segredos OAuth pertencem ao provedor/backend.

**Bloquear** apaga chaves, documento e tokens da memória, cancela sincronização em andamento e preserva o desbloqueio offline previamente autorizado. **Sair da conta neste dispositivo** invalida callbacks de refresh, remove a sessão cifrada e a autorização local e tenta revogar a sessão remota, preservando dados e outbox. O próximo acesso desse cofre exige autenticação online da mesma conta. O modo somente local usa senha-mestra e não finge criar uma conta na nuvem.

Gerações de sessão, titular/cofre, vetores e revisões são conferidos antes dos commits. Gravações financeiras, importação, sincronização e metadados de sessão compartilham a mesma exclusão mútua. Uma edição local interrompe a troca de rede lenta e conserva a fila para reenvio, evitando bloquear o uso offline.

## Sincronização operacional

PostgreSQL recebe apenas headers de proteção e operações cifradas. `auth.uid()` determina o titular; o cliente não escolhe `user_id`. RLS isola as contas. RPCs serializam sequências por usuário, deduplicam UUID e recusam uma operação repetida com outro conteúdo.

O cliente só confirma o UUID/ciphertext que reaparece em uma página validada. Documento, cursor, operações novas e recibos são persistidos atomicamente. Falha de rede/commit não descarta pendências. A fila reutiliza UUID/payload em retries e tem limites de tamanho/quantidade. Conteúdo inválido, conta/cofre diferentes, lacuna de sequência e revisão causal igual com dados divergentes interrompem a sincronização.

Vetores de versão decidem a causalidade; timestamps são informativos. Edições concorrentes divergentes ficam visíveis para revisão. Exclusões são tombstones. Resoluções dominam as versões conhecidas e não são revertidas por cópias antigas. Fotos e grupos financeiros relacionados permanecem associados.

O Drive é exclusivamente backup opcional manual na web, com `drive.file` e token temporário em memória. Não é banco transacional nem participa do protocolo entre dispositivos. Backups antigos não são apagados automaticamente.

## Permissões e distribuição

A janela nativa admite apenas conteúdo empacotado e a origem local de desenvolvimento. Não há SQL livre, execução de shell ou carregamento de JavaScript remoto. Aberturas externas usam HTTPS. Salvar arquivo permite somente o caminho escolhido no diálogo; não se concede filesystem global. Atualização Windows exige chave própria e artefato assinado; o perfil fica desativado sem configuração válida. Assinaturas e identificador do aplicativo devem permanecer estáveis em atualizações.

## Integridade financeira e limites

As regras existentes foram preservadas: centavos nos cálculos, transferências próprias sem receita/despesa, pagamento de fatura sem duplicar despesa, cofres reservando dinheiro existente sem aumentar patrimônio e simulações separadas de valores reais. Aportes planejados não contam como realizados.

Sem senha-mestra ou recuperação, os dados cifrados não são recuperáveis. Criptografia em repouso não protege contra código malicioso enquanto o cofre está aberto. Backups precisam ser verificados; CSV, Excel e PDF são exportações legíveis iniciadas pelo usuário. Não há logs de senhas, chaves, tokens ou conteúdo financeiro.

Consulte [o relatório de validação](docs/VALIDACAO-INDEPENDENCIA.md) para testes realizados e limites. Esta implementação não equivale a auditoria independente de segurança, instalação nativa validada ou servidor de produção já configurado.
