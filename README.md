# My Horizon+

**Seu dinheiro. Seus sonhos. Seu próximo horizonte.**

Versão independente 5.1.0, evoluída sobre o aplicativo existente. React + TypeScript + Vite, Tauri 2 para Windows/Android, SQLite local com dados cifrados, Supabase Auth/PostgreSQL para conta própria e sincronização incremental. Não requer ChatGPT, ChatGPT Sites ou APIs proprietárias da plataforma.

O dashboard, os horizontes com fotografias, os planejadores por categoria, aportes, retiradas, relatórios, importações e cálculos anteriores foram mantidos. As duas jornadas continuam **Definir valor** e **Planejar meu horizonte**.

## Começar

Instale Node.js 22+ e execute nesta pasta:

```powershell
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Abra `http://localhost:5173`. **Usar somente neste dispositivo** cria um cofre local real com senha-mestra e chave de recuperação. **Explorar com dados fictícios** abre a demonstração temporária, separada dos seus dados.

Para conta própria e sincronização, é necessário configurar um projeto Supabase seu. Copie `.env.example` para `.env.local` e instale a migração SQL, ou use **Configurar conexão e migração** na tela de entrada. Nenhum servidor de produção está conectado nesta entrega; não foram criadas contas ou contratados serviços em seu nome.

## Windows e Android

```powershell
npm run native:doctor
npm run native:dev
npm run native:build
npm run android:init
# Depois de instalar os SDKs indicados pelo diagnóstico:
node scripts/prepare-android.mjs --init
npm run android:build
```

O projeto Windows prepara um instalador NSIS `.exe`. O projeto Android é inicializado pelo Tauri a partir da mesma base após instalar JDK/SDK/NDK e targets Rust. A arquitetura também prevê iOS, que exige macOS/Xcode.

**Nesta máquina faltam os compiladores e SDKs nativos. Não há instalador ou APK compilado nem instalação real validada.** O diagnóstico identifica as ferramentas necessárias. Configuração e ícones prontos não equivalem a um binário testado.

## Documentação

- [Migração, uso offline, configuração da conta e entregáveis](docs/INDEPENDENCIA.md)
- [Compilação Windows/Android, assinaturas e atualizações](docs/INSTALACAO-NATIVA.md)
- [Banco, RLS, operações e testes PostgreSQL](docs/BANCO-SINCRONIZACAO.md)
- [Relatório de validação e limites](docs/VALIDACAO-INDEPENDENCIA.md)
- [Contrato do motor de sincronização](src/services/sync/README.md)
- [Planejadores de horizontes e cálculos preservados](docs/HORIZONTES-PLANEJAMENTO.md)
- [Capas, enquadramento e identidade visual](docs/REFINAMENTO-FOTOS-LOGIN.md)

## Verificar e exportar

```powershell
npm test
node scripts/test-postgres.mjs
npm run test:e2e
npm run build
npm run source:export
```

O build web gera `dist/`, pronto para hospedagem HTTPS própria com fallback de rotas para `index.html`. `source:export` gera o código-fonte e SHA-256 em `releases/`, excluindo segredos, dados locais, SDKs e dependências instaladas.

Os testes de navegador usam Google Chrome instalado e simulam apenas as APIs de autenticação/sincronização; a base PostgreSQL também tem testes reais em WASM. Testes contra Supabase hospedado, dispositivos físicos e instaladores estão descritos separadamente no relatório.

## Organização

```text
src/components/          Componentes visuais compartilhados
src/features/            Telas e jornadas financeiras existentes
src/core/                Cálculos, modelo, criptografia e estado financeiro
src/services/auth/       Conta própria, PKCE e sessões cifradas
src/services/storage/    Repositório SQLite/IndexedDB e exclusão mútua
src/services/sync/       Operações, paginação, conflitos e retries
src-tauri/               Shell nativo, SQLite, ícones e instaladores
supabase/                Migrações PostgreSQL, RLS e testes
tests/                   Regressões financeiras e jornadas do aplicativo
docs/                    Instalação, migração e validação
```

O formato de cofre, as chaves de armazenamento antigas, os IDs de autenticação legados e os identificadores financeiros não foram renomeados. O vínculo com a conta própria é separado do proprietário criptográfico original. Exporte o backup cifrado na versão anterior e importe-o antes de criar outro cofre; confira os dados e preserve ambas as cópias durante a migração.
