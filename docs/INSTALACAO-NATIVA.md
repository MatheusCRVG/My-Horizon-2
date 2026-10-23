# My Horizon+ independente — Windows e Android

Esta cópia preserva o React existente e o formato de cofre `financeiro5:1`. O shell Tauri 2 empacota os arquivos locais de `dist`; não depende da hospedagem `chatgpt.site` para abrir a interface. Identificador: `app.myhorizon.plus`; versão nativa: `5.1.0`; nome: **My Horizon+**. Os ícones em `src-tauri/icons` foram gerados do símbolo oficial de `public/icon-512.png` pelo próprio Tauri CLI.

**Estado verificado nesta máquina:** o Tauri CLI consegue ler a configuração e identifica WebView2 `155.0.4283.62`. Rust, Cargo, rustup e Visual Studio C++/Windows SDK não estão disponíveis. Nenhum instalador `.exe`, APK ou AAB foi compilado. Os testes Rust abaixo foram escritos, mas só podem ser executados após instalar o compilador. O diagnóstico informa separadamente Java/Android SDK/NDK; encontrar ferramentas não prova uma compilação bem-sucedida.

## Preparação sem instalar SDKs automaticamente

Na raiz desta cópia:

```powershell
npm ci
node scripts/native-doctor.mjs
node scripts/native-doctor.mjs --json
```

O diagnóstico é somente leitura e não exibe variáveis sensíveis. `--strict` retorna código 1 se faltarem os principais pré-requisitos Windows; acrescente `--android` para exigir os de Android. O script procura também o Rust em `%USERPROFILE%\.cargo\bin` e os caminhos usuais do Android Studio.

Instale manualmente, pelos fornecedores oficiais:

1. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), com **Desktop development with C++**, MSVC x64 e Windows SDK. Apenas CMake não substitui esse requisito.
2. [Rust via rustup](https://rustup.rs/), toolchain estável MSVC `x86_64-pc-windows-msvc`, versão 1.90 ou posterior.
3. Node.js 22+ e, para Android, Android Studio com JDK e os componentes do SDK descritos abaixo.

Não é preciso instalar SQLite separadamente: `rusqlite` usa a opção `bundled` e compila a biblioteca junto do aplicativo.

## Validar e gerar o instalador Windows

Depois de instalar os pré-requisitos e abrir um novo terminal:

```powershell
rustup default stable-x86_64-pc-windows-msvc
node scripts/native-doctor.mjs --strict
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib
cargo fmt --manifest-path src-tauri/Cargo.toml
npm exec tauri -- build --bundles nsis
```

O instalador aparece em `src-tauri/target/release/bundle/nsis/`. O NSIS instala para o usuário atual e usa português brasileiro. O bundle padrão prepara o bootstrapper WebView2; uma máquina sem o runtime pode precisar de internet para instalá-lo. O binário local ainda deve ser validado em uma conta Windows comum, incluindo atualização/reinstalação sem perda do banco.

`npm exec tauri -- dev` inicia somente `http://localhost:5173`. A janela impede navegar para sites externos; o navegador padrão abre links HTTPS pelo plugin opener. O frontend empacotado não executa JavaScript remoto, não recebe filesystem/shell/SQL arbitrários e possui apenas as permissões declaradas em `src-tauri/capabilities/main.json`.

O workflow manual `.github/workflows/native-build.yml` executa testes de SQLite e gera um instalador para revisão. Não publica releases, não conecta contas e não possui chaves de assinatura. O `Cargo.lock` gerado deve ser revisado e versionado após a primeira resolução válida, antes de promover builds reproduzíveis a produção. A versão nativa está explícita; não é derivada do nome antigo do pacote JavaScript.

## Android

No SDK Manager do Android Studio, instale **Android SDK Platform**, **SDK Platform-Tools**, **NDK (Side by side)**, **Build-Tools** e **Command-line Tools**. Use os componentes atuais compatíveis com o projeto Gradle gerado; não copie números antigos de SDK por conveniência. Configure os caminhos reais na sessão PowerShell, por exemplo:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$installedNdk = Get-ChildItem -LiteralPath "$env:ANDROID_HOME\ndk" -Directory | Sort-Object Name | Select-Object -Last 1
$env:NDK_HOME = $installedNdk.FullName
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
node scripts/prepare-android.mjs
node scripts/prepare-android.mjs --init
npm exec tauri -- android build --apk --target aarch64
```

`prepare-android.mjs` imprime os passos e não baixa SDKs, aceita licenças, cria chaves ou modifica configurações globais. Somente `--init`, com os pré-requisitos presentes, chama `tauri android init`; se `src-tauri/gen/android` já existir, preserva-o. O aplicativo usa Android API mínima 26. Para todas as arquiteturas, remova `--target aarch64`; o CLI também suporta `armv7`, `i686` e `x86_64`.

Para distribuição no Google Play:

```powershell
npm exec tauri -- android build --aab
```

Os artefatos ficam sob `src-tauri/gen/android/app/build/outputs/`. Configure uma keystore de produção e a assinatura do Gradle conforme a [documentação oficial Android/Tauri](https://v2.tauri.app/distribute/sign/android/). Guarde a chave fora do repositório e preserve a mesma identidade de assinatura nas atualizações. `tauri icon public/icon-512.png --output src-tauri/icons` regenera também os recursos de ícone Android/iOS; confira o projeto gerado após inicializá-lo. APK debug, APK release sem assinatura configurada e aplicativo publicado são entregas diferentes.

O devUrl é propositalmente apenas localhost:5173. Desenvolvimento conectado a um telefone físico exige configurar e revisar um perfil de desenvolvimento específico para o endereço do computador; não habilite origens LAN/HTTP no perfil de produção. O build de release usa arquivos locais.

### Exportações nativas

O shell registra `tauri-plugin-dialog` e `tauri-plugin-fs`, com apenas `dialog:allow-save`, `fs:allow-write-file` e um escopo estático vazio. A escolha explícita de um arquivo no diálogo de salvar amplia o escopo somente para o destino selecionado; não se concede acesso global a Documents, Downloads, `$HOME` ou outros diretórios. O frontend deve chamar `save()` e, se o usuário confirmar, `writeFile()` com os bytes da exportação. Cancelar não grava nada. Não há permissão de abrir/ler arquivos pelo plugin — a importação HTML existente continua com o seletor de arquivos da WebView.

No Android, o seletor pode retornar `content://` em vez de caminho local. Há um [relato primário de arquivo com zero bytes nesse fluxo](https://github.com/tauri-apps/plugins-workspace/issues/3356); por isso, **exportação Android ainda precisa de validação em aparelho real** com a versão resolvida dos plugins e provedores Documents/Downloads/Drive antes do release. Teste CSV, Excel e backup cifrado, tamanho não zero, reabertura do conteúdo, cancelamento e permissão revogada. Não anuncie sucesso só por fechar o diálogo. A presença do código do plugin não comprova que esse problema foi resolvido.

## Contrato SQLite para o frontend

Importe `invoke` de `@tauri-apps/api/core`. Todos os comandos usam nomes JSON em camelCase:

| Comando        | Argumentos                                                          | Retorno                       |
| -------------- | ------------------------------------------------------------------- | ----------------------------- |
| `vault_get`    | `{ owner: string }`                                                 | `VaultRecord \| null`         |
| `vault_list`   | nenhum                                                              | `VaultRecord[]`               |
| `vault_put`    | `{ record: VaultRecord }`                                           | `void`                        |
| `vault_commit` | `{ record, operations: OperationRecord[], acknowledged: string[] }` | `void`                        |
| `outbox_list`  | `{ owner: string }`                                                 | `OperationRecord[]` pendentes |

```ts
type VaultRecord = {
  owner: string;
  envelope: Envelope; // formato AES-GCM existente, sem Document em texto claro
  pending: boolean;
  lastSync?: string;
  device: string;
  seen: string[];
  accountId?: string;
  cursor?: number; // inteiro seguro JavaScript, monotônico
  session?: { iv: string; cipher: string }; // base64, já cifrado pelo frontend
  authorized?: boolean;
};
type OperationRecord = {
  id: string;
  owner: string;
  vaultId: string;
  payload: Envelope;
  createdAt: string;
};
await invoke("vault_commit", {
  record,
  operations: [operation],
  acknowledged: [],
});
```

`vault_put` é uma conveniência transacional sem alterações de fila; mutações financeiras devem usar `vault_commit`. Snapshot, cursor, `seen`, operações novas e confirmações ficam na **mesma transação SQLite IMMEDIATE**. WAL, `synchronous=FULL`, foreign keys e timeout de 5 segundos protegem contra commits parciais. A migração `user_version` 1→2 adiciona a fila sem apagar cofres; versões desconhecidas são recusadas. O caminho é fixo no diretório privado de dados de `app.myhorizon.plus`, arquivo `my-horizon.sqlite3`; o JS não escolhe o caminho.

Guards rejeitam titular divergente do envelope, operação de outro titular/cofre, troca silenciosa de `vaultId` ou `accountId`, cursor retrocedendo e reuso de ID com conteúdo diferente. Repetir a mesma operação é idempotente. Confirmações só afetam IDs daquele cofre. Os recibos cifrados já confirmados são retidos internamente e não reaparecem em `outbox_list`, evitando ressurreição por retry. `seen` é preservado por união. `pending` enviado pelo frontend é mantido e passa obrigatoriamente a `true` se houver fila pendente; ao confirmar toda a fila, envie `pending:false`.

Não existe comando de apagar/cofre-clear. Logout grava o registro com `session` ausente, `authorized:false` e `accountId` preservado; o frontend impõe a revalidação online da mesma conta. Fechar/bloquear o app deve apagar chaves de memória. O repositório não faz OAuth, não interpreta saldos e não pode verificar a autenticação GCM sem receber a chave — essa verificação continua no motor criptográfico do frontend. Base64/tamanho/estrutura são validados antes de gravar; campos extras de documento ou credenciais em texto claro são recusados pelo DTO tipado.

**Limites de segurança:** não se usa SQLCipher. Envelope financeiro, imagens dentro do cofre, payloads de fila e sessão são cifrados em AES-GCM antes do IPC; a chave-mestra fica apenas na memória do frontend. A sessão usa AAD `myhorizon:session:v1:owner:vaultId`. Metadados de roteamento (`owner`, `accountId`, `vaultId`, `device`, `seen`, `cursor`, datas, IDs e flags) e a estrutura/tamanho do banco **não são cifrados**. `authorized` é controle de UX, não autenticação contra alguém com acesso ao sistema operacional. Um invasor com controle completo do processo ou sessão desbloqueada está fora da proteção de repouso; a autenticação/isolamento do servidor continuam necessários.

Os testes Rust cobrem commit+ack, rollback inclusive após uma inserção de fila, deduplicação e retry já confirmado, isolamento entre titulares/cofres/contas, cursor, limpeza da sessão sem apagar dados, migração/reabertura e rejeição de payload malformado. Execute-os no SQLite real com o comando acima; não confunda a existência dos testes com execução nesta máquina.

## Login externo e deep link

O shell registra **`myhorizon://auth/callback`** em Windows e Android/iOS. No desktop, o plugin single-instance encaminha callbacks para a instância aberta; o deep-link plugin entrega tanto URLs de inicialização (`getCurrent`) quanto novas URLs (`onOpenUrl`). Em debug Windows/Linux o esquema é registrado em runtime; em release a instalação registra a associação.

O frontend deve aceitar apenas esquema `myhorizon`, host `auth`, path `/callback`, validar `state` aleatório de uso único e PKCE, e concluir o fluxo no backend. Nada de tokens, senha ou segredo OAuth na URL. A capacidade opener aceita apenas `https://*` no navegador padrão, sem caminhos locais ou seleção arbitrária de executáveis. A navegação da WebView continua limitada à origem local do app/dev.

Registrar o esquema não torna um Client ID Google Web compatível com redirecionamentos nativos. Configure o cliente OAuth/redirect HTTPS do backend, sessão, CORS e PKCE conforme o fluxo escolhido; autorizações Google que precisem de validação de domínio continuam externas. O esquema privado pode ser interceptado por outro app — state/PKCE e validação do backend são obrigatórios. Nenhum segredo fica no frontend. Backups Drive existentes e sincronização operacional devem permanecer serviços distintos.

## Atualização Windows assinada — perfil preparado e desligado

O build padrão tem `createUpdaterArtifacts:false`, não carrega o plugin updater e não oferece controles de atualização falsos. O perfil `src-tauri/tauri.signed-updates.conf.json` apenas habilita a geração de artefatos; a feature Rust `signed-updates` exige chave pública real e endpoints HTTPS para iniciar. Nenhuma chave fictícia ou endpoint de exemplo é utilizado pelo aplicativo.

Antes de ativar, gere uma chave de assinatura Tauri fora do repositório e configure uma cópia local desse perfil com `plugins.updater.pubkey` (conteúdo da chave pública) e `plugins.updater.endpoints` (URL real que entrega manifesto e artefatos assinados). Defina `TAURI_SIGNING_PRIVATE_KEY`/senha por gerenciador seguro ou secrets do CI, sem registrar o valor. Então:

```powershell
npm exec tauri -- build --bundles nsis --features signed-updates --config caminho-para-perfil-assinado-real.json
```

Teste falha de assinatura, rollback/versionamento e preservação do banco antes de liberar. A assinatura do mecanismo Tauri não substitui Authenticode para reputação/SmartScreen do instalador Windows; esse certificado e assinatura também são configurações externas. Android segue assinatura da loja/keystore e não usa o updater desktop. iOS tem entry point preparado, mas gerar/assinar exige macOS, Xcode, equipe Apple e validação própria; não pode ser compilado neste Windows.

## Fontes técnicas primárias consultadas

- [Pré-requisitos Tauri 2](https://v2.tauri.app/start/prerequisites/): Rust, Windows C++ e Android SDK/NDK/JDK.
- [Configuração Tauri](https://v2.tauri.app/reference/config/): bundle local, NSIS, perfis e janela manual.
- [Capabilities](https://v2.tauri.app/security/capabilities/): comandos da aplicação sujeitos a permissões explícitas via AppManifest.
- [Opener](https://v2.tauri.app/plugin/opener/) e [scope oficial](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/opener/src/scope.rs): browser padrão e escopo HTTPS.
- [Deep links](https://v2.tauri.app/plugin/deep-linking/) e [configuração oficial do plugin](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/deep-link/src/config.rs): esquemas desktop/mobile e callbacks.
- [Ícones nativos](https://v2.tauri.app/develop/icons/), [updater assinado](https://v2.tauri.app/plugin/updater/) e [assinatura Android](https://v2.tauri.app/distribute/sign/android/).
- [Diálogo nativo](https://v2.tauri.app/plugin/dialog/) e [filesystem com escopo](https://v2.tauri.app/plugin/file-system/): exportação somente ao arquivo escolhido explicitamente.
