# My Horizon+ independente — estado da migração

Versão 5.1.0, preparada em 23/10/2026. Esta é uma evolução da aplicação existente, não uma reconstrução. O aplicativo anterior continua preservado em `financeiro-5`, no commit `f032394f3c65b3f560d7eb9b218980cd23af8afd`, e no arquivo `my-horizon-preservado-f032394.zip` ao lado desta pasta. Esse arquivo é backup do **código**, não dos cofres dos usuários.

## O que mudou

| Camada | Versão anterior | Cópia independente |
| --- | --- | --- |
| Interface e cálculos | React/Vite/TypeScript | Mesma base, componentes e cálculos preservados |
| Distribuição | Hospedagem Sites | Frontend estático próprio e shell Tauri 2 |
| Windows | Navegador/PWA | Projeto NSIS `.exe`, janela própria e símbolo oficial |
| Android | Interface web responsiva | Mesmo frontend em Tauri mobile, inicialização Gradle após instalar SDK |
| Dados locais | IndexedDB cifrado | SQLite no Tauri; IndexedDB cifrado preservado na versão web |
| Conta | Google/GIS | Supabase Auth: e-mail, cadastro, Google externo com PKCE e recuperação |
| Sincronização | Snapshots no Drive | Operações cifradas incrementais em PostgreSQL, com RLS |
| Drive | Transporte de sincronização | Backup manual opcional na web; não participa da sincronização |

Não há SDK, API, domínio, banco ou autenticação do ChatGPT no runtime. O arquivo `.openai/hosting.json` foi retirado desta cópia. O build é `npm run build`, sem helpers da plataforma. Nenhum dado de usuário foi extraído do navegador ou enviado a um serviço durante o desenvolvimento.

## Uso imediato sem servidor

Requisitos: Node.js 22+ e npm. Na pasta desta cópia:

```powershell
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Abra `http://localhost:5173`. Escolha **Usar somente neste dispositivo**, defina a senha-mestra de pelo menos 12 caracteres e guarde a chave de recuperação. Esse é um cofre local real; não cria uma conta na nuvem. Importar um backup nesse modo mantém o modo local. Também existe a demonstração, sempre identificada como fictícia e temporária.

Para distribuir a versão web em infraestrutura própria:

```powershell
npm run build
```

Hospede `dist/` com HTTPS e fallback de rotas para `index.html`, inclusive `/auth/callback`. O service worker disponibiliza as telas e os recursos locais offline depois da primeira carga completa. O Tauri usa os arquivos empacotados, sem service worker ou carregamento do site remoto. Não copie `.env` ou a pasta de dados locais para a hospedagem.

## Ativar sua conta e sincronização

O proprietário informou que **ainda não possui projeto Supabase**. Portanto, não há servidor de produção conectado e não se deve afirmar que a sincronização pública está ativa.

1. Crie um projeto Supabase sob uma conta sua. Consulte custos e limites do plano escolhido antes de contratar.
2. Aplique `supabase/migrations/20261023000100_horizon_operational_sync.sql` pelo SQL Editor ou Supabase CLI. Não coloque senha do banco ou `service_role` no frontend.
3. Copie `.env.example` para `.env.local`, preenchendo `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, e faça novo build. Alternativamente, a tela de entrada oferece **Configurar conexão e migração → Conectar servidor do My Horizon+**. Somente a URL e a chave pública ficam nessa configuração local. Chaves secretas e tokens `service_role` são rejeitados.
4. Em Supabase Auth, habilite e-mail e confirmação de cadastro, configure SMTP para a operação pretendida e os modelos de confirmação/recuperação. A recuperação da conta **não** recupera a senha-mestra nem a chave de cifra do cofre.
5. Configure as URLs de redirecionamento permitidas: `http://localhost:5173/auth/callback` no desenvolvimento, `https://SEU-DOMINIO/auth/callback` na web e `myhorizon://auth/callback` no aplicativo nativo. Use seu endereço HTTPS como Site URL de produção.
6. Para Google, habilite o provedor no Supabase. No Google Cloud, configure o callback HTTPS `https://SEU-PROJETO.supabase.co/auth/v1/callback`; o Client Secret fica **somente no provedor/Supabase**. O fluxo abre o navegador externo no Tauri e volta por deep link com PKCE. Não usa login Google embutido em WebView nem pede acesso ao Drive no login.
7. Entre na conta e crie um cofre ou conecte explicitamente o cofre local em **Configurações → Sua conta e seus dispositivos**. Um cofre remoto diferente bloqueia a associação; nenhum histórico é substituído.
8. Em outro dispositivo, entre na mesma conta e desbloqueie com a mesma senha-mestra ou chave de recuperação. O cofre é reconstruído a partir das operações cifradas. A configuração de origem/URL e o servidor precisam ser os mesmos nos dispositivos.

O domínio `myhorizon` ainda não foi registrado. A escolha e o registro do domínio, o DNS e a hospedagem HTTPS continuam externos; o aplicativo instalável não depende da compra de domínio para funcionar localmente.

## Proteção local e autenticação offline

Os valores financeiros, fotos, planos e histórico são cifrados antes de chegar ao SQLite/IndexedDB. A chave AES-256-GCM fica apenas na memória; a senha-mestra deriva uma chave de proteção com PBKDF2-SHA-256/600.000 iterações. A recuperação usa uma segunda chave de proteção, preservando o formato existente `financeiro5:1`.

Tokens de sessão persistentes também ficam cifrados pela chave do cofre, com AAD separado. Não há token de acesso/refresh em texto claro no localStorage. O verificador PKCE é temporário, de uso único, e fica separado dos tokens da conta. Metadados técnicos (identificadores, dispositivo, cursor, datas, estado de autorização) não são cifrados; não se trata de criptografia integral do arquivo SQLite/SQLCipher. Eles não incluem valores financeiros ou senhas.

**Bloquear** remove chaves e sessão da memória e mantém o desbloqueio offline autorizado pela senha-mestra. **Sair da conta neste dispositivo** remove a sessão cifrada e revoga a autorização local antes de tentar a revogação remota; exige novo login online para reautorizar, sem apagar dados nem operações pendentes. Um cofre somente local continua protegido pela senha-mestra e não finge ter autorização em nuvem.

O banco nativo tem transações, WAL, migrações e recibos de operações. Sua localização usa o diretório de dados do identificador `app.myhorizon.plus`, separado da instalação. Não mude esse identificador nas atualizações. As permissões nativas permitem apenas comandos específicos de cofre, callbacks, abertura HTTPS e salvar arquivos escolhidos pelo usuário; não expõem SQL livre ou execução de shell.

## Operações offline e conflitos

Uma gravação local confirma, na mesma transação, o documento cifrado e sua fila de deltas cifrados. Cada operação recebe UUID estável; reconectar ou repetir após timeout reutiliza UUID e conteúdo. O servidor deduplica e rejeita UUID reutilizado com conteúdo diferente.

O cliente só confirma uma operação após reencontrar o mesmo UUID/payload em uma página válida. O cursor avança junto do cofre e dos recibos na transação local. O PostgreSQL serializa a sequência por usuário, evitando lacunas de commit entre dispositivos. Há paginação por quantidade e bytes, timeout de rede e tentativas de rede/5xx com espera crescente curta. O aplicativo aberto e desbloqueado consulta a cada 15 segundos, após edições e ao reconectar; não há promessa de sincronização com o processo encerrado.

Gravações locais têm prioridade sobre rede lenta: interrompem o exchange em andamento, salvam documento/fila e deixam o mesmo UUID disponível para retomada. Desconectar ou bloquear também cancela a troca em andamento, sem apagar alterações.

Edições concorrentes usam os vetores de versão existentes; versões financeiras divergentes viram conflitos visíveis em Configurações. Exclusões mantêm tombstones. Fotos e dados viajam no mesmo documento. Grupos relacionados de metas/aportes não são separados em operações parciais. Um grupo acima do limite exibe erro e preserva o estado anterior; não é truncado.

Os indicadores distinguem local, offline, pendências, sincronização e sincronização concluída. Nenhuma transferência própria se torna receita/despesa, nem aporte planejado vira dinheiro real. Simulações mantêm sua separação do patrimônio.

## Migração dos dados existentes

1. No aplicativo anterior, desbloqueie o **cofre real** e use **Configurações → Exportar backup**. Guarde o JSON cifrado e a chave de recuperação em lugares seguros. Exportar o código não exporta esses dados.
2. Preserve o aplicativo anterior, os dados do navegador e os backups até conferir a migração. O novo programa tem outro armazenamento; ele não consegue ler silenciosamente o IndexedDB de outro domínio ou do navegador anterior.
3. Abra a versão independente. Escolha modo local ou entre na sua nova conta e use **Trazer meu backup criptografado** antes de criar um cofre vazio para essa conta.
4. Informe a senha-mestra ou chave de recuperação. O importador valida o envelope, mescla versões do mesmo cofre e rejeita outro cofre/conta; preserva `owner`, `vaultId`, IDs de entidades, vetores, exclusões, fotos e histórico. O vínculo Supabase usa um campo `accountId` separado e não renomeia o proprietário criptográfico antigo.
5. Confira contas/saldos, horizontes, capas, aportes/retiradas, planos e conflitos. Faça um aporte de conferência somente se for uma movimentação real desejada; testes devem usar uma cópia/demonstração.
6. Configure a sincronização e valide os mesmos dados no segundo dispositivo. Exporte novo backup. Só depois decida o destino da implantação anterior.

Preferências do dashboard e os demais registros internos que já pertencem ao cofre acompanham o backup. Tema e tempo de bloqueio são preferências do dispositivo e podem ser ajustados novamente. O backup original do Drive permanece acessível pela versão anterior; esta migração não apaga seus arquivos.

## Compilação e entregáveis

Consulte [INSTALACAO-NATIVA.md](INSTALACAO-NATIVA.md) para Windows/Android/iOS, pré-requisitos, comandos, assinaturas e atualizações. `npm run android:init` mostra os pré-requisitos; `node scripts/prepare-android.mjs --init` inicializa Gradle depois de instalá-los. `npm run native:build` gera NSIS e `npm run android:build` gera APK quando o ambiente estiver pronto.

```powershell
npm test
node scripts/test-postgres.mjs
npm run test:e2e
npm run build
npm run native:doctor
npm run source:export
```

`source:export` cria um `.tar.gz` e SHA-256 em `releases/`, incluindo frontend, Rust, SQL, documentação, testes e lockfile npm. Exclui ambientes, dados locais, segredos, SDKs, node_modules, metadados Sites e artefatos de testes. O código pode ser levado para um repositório privado seu, sem vínculo com a hospedagem anterior.

## O que ainda exige validação externa

Não há `.exe` ou APK compilado nesta entrega: faltam Rust/Cargo/MSVC/Windows SDK/JDK/Android SDK/NDK neste computador. A configuração e os ícones foram validados pelo CLI; isso não equivale a lançar uma janela instalada ou instalar no telefone. O projeto Android gerado pelo Tauri depende da inicialização com o SDK; não se entrega um Gradle inventado.

Precisam ser validados em ambiente configurado: Supabase hospedado e JWTs reais, e-mails/Google reais, deep links registrados pelo instalador/APK, instalação e atualização sobre dados existentes, concorrência de múltiplas conexões PostgreSQL, exportação Android `content://`, impressão/PDF nativo e dispositivos físicos. Drive nativo e backup agendado permanecem evolução opcional; o backup manual por arquivo e o backup manual Drive na web estão implementados. O atualizador Windows só deve ser ativado com endpoint HTTPS e chave de assinatura próprios; o Android deve manter seu canal e a mesma assinatura de aplicativo.

Fontes de referência: [Tauri: pré-requisitos](https://v2.tauri.app/start/prerequisites/), [diálogo e arquivos](https://v2.tauri.app/plugin/dialog/), [Supabase: PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [senhas](https://supabase.com/docs/guides/auth/passwords) e [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Os resultados locais e seus limites estão em [VALIDACAO-INDEPENDENCIA.md](VALIDACAO-INDEPENDENCIA.md).
