# Validação da migração independente — 23/10/2026

Este relatório separa execução local, APIs simuladas e itens que exigem infraestrutura real. Não contém dados de cofres do proprietário.

## Executado nesta máquina

- Auditoria da base React/Vite: os cálculos e componentes existentes foram reaproveitados. Cópia de código anterior preservada antes de editar.
- TypeScript: verificação completa da aplicação, testes e configurações.
- Vitest: cálculos financeiros anteriores, planejamento, importação, fotos, criptografia e novo motor incremental, com AES real.
- PostgreSQL/WASM: 78 asserções pgTAP sobre a migração SQL real, incluindo RLS de duas contas, replay, colisão de UUID, rollback, paginação por bytes, limites e isolamento. A API `auth.uid()` e o cadastro de identidades são fixtures; JWT de produção não é simulado como prova de autenticação real.
- Chrome/Playwright: jornadas em desktop e viewport móvel, com APIs Supabase de teste interceptadas. Cadastro/login, callback PKCE, recuperação e sincronização dessas execuções não acessam Supabase ou Google reais.
- Tauri CLI: leitura da configuração/schema e geração de ícones a partir do símbolo oficial. WebView2 encontrado. A tentativa `npm run native:build` falhou de forma explícita porque `cargo metadata` não pôde ser executado: Cargo/Rust ausentes.
- SQLite: DDL/triggers e rollback exercitados em SQLite local por smoke de schema. Os testes Rust do repositório foram preparados; não executados sem toolchain.

Resultados finais: **240 testes Vitest**, **78 asserções SQL**, **66 execuções de jornadas Playwright em desktop/celular**, aprovados em rodadas de integração por área. O build de produção passou. Um teste adicional sobre esse build confirmou recarga offline, aportes persistidos, fotos/enquadramento, criação e revisão de orçamento e primeira abertura de módulos lazy sem rede, com zero erros de página. As APIs externas dos testes de navegador são fixtures; isso não equivale a implantação de um serviço de produção.

## Regressões cobertas pelo código de teste

- Aporte mensal e extra, mudança de prazo, exclusão e conclusão, sem duplicar receita/patrimônio.
- As duas jornadas das oito categorias e planejamentos editáveis, sem preços inventados.
- Fotos, enquadramento, aportes/retiradas e valores sincronizados entre dashboard/lista/detalhes.
- Cifrar cofre e sessão antes de persistir; senha incorreta, adulteração e cofre de outro proprietário rejeitados.
- Outbox persistente e deltas com UUID estável, retry após resposta perdida, deduplicação, tombstones e conflitos sem descarte silencioso.
- Confirmação de operações somente após página válida e commit atômico; falha local não avança o cursor.
- Conta/cofre incorretos, página com lacunas, conteúdo divergente na mesma revisão e lotes acima dos limites rejeitados.
- Novo dispositivo reconstruindo cofre por operações cifradas e alterações regressando ao dispositivo inicial.
- Gravação local interrompendo exchange lento, seguida de reconexão e confirmação exata das operações pendentes sem duplicação.
- Bloqueio e desbloqueio offline com dados persistidos, logout offline exigindo reautorização e preservando pendências.
- Migração do proprietário criptográfico legado sem renomear IDs, fotos, planos ou contribuições.

## Não executado / depende de configuração externa

| Validação | Motivo e próximo passo |
| --- | --- |
| Compilar e lançar Windows instalado | Instalar Rust estável MSVC, C++ Build Tools e Windows SDK; executar testes Rust, gerar NSIS e iniciar em conta comum |
| Gerar e instalar APK/AAB | Instalar JDK, Android SDK/NDK/build-tools/targets Rust; inicializar Android; assinar e instalar em aparelho físico |
| Supabase hospedado e JWT real | Proprietário ainda não tem projeto; aplicar SQL e configurar URL/chave pública |
| E-mail/Google de produção | Configurar Auth/SMTP/provedor Google e redirects HTTPS/deep link, com segredos somente no servidor |
| Concorrência PostgreSQL entre conexões | O WASM testado usa uma conexão; validar locks concorrentes no Postgres/Supabase configurado |
| Deep link instalado no Windows/Android | Requer instalador/APK real e registro do esquema `myhorizon` |
| Atualização sobre dados de versão anterior | Requer duas versões nativas assinadas; conferir migrações e diretório de dados preservado |
| Exportar em provedores Android Documents/Downloads | Verificar `content://`, tamanho não zero e reabrir arquivo; há relato primário conhecido no plugin |
| Impressão/PDF nativo | O comando existente de impressão é preservado; testar suporte do WebView e do sistema antes do release |
| iOS | Exige macOS/Xcode e perfil de assinatura; não foi gerado IPA |
| Domínio/HTTPS de produção | Domínio não registrado nem hospedagem/DNS configurados nesta tarefa |

Não há promessa de sincronização com o processo fechado. Recursos externos não são simulados como disponíveis offline. Drive no aplicativo nativo e backup automático agendado ainda não foram habilitados; backup cifrado em arquivo e Drive manual na web permanecem separados da sincronização operacional.

## Critério para encerrar a migração de produção

Somente após instalar e abrir os binários, autenticar contas reais, importar/conferir o cofre preservado e validar reconexão entre Windows e Android com o servidor configurado. O código independente e os projetos de compilação entregues constituem a preparação técnica; não equivalem à migração de produção finalizada.
