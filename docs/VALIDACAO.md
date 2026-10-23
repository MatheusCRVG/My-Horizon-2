# Validação da entrega · 22/10/2026

## Atualização Horizon One

Marca atualizada no site, login, cabeçalhos, diálogos, título da aba, manifesto PWA, ícones e nomes de exportação. Painel com hero em grafite e gráficos a partir dos lançamentos; resumo financeiro e filtros na página de lançamentos; cartões responsivos no celular. A busca global foi exercitada por Ctrl+K no desktop e pelo menu no celular, incluindo abertura de um lançamento para edição.

Os oito fluxos Playwright de desktop/celular passaram após a atualização; a verificação da busca foi adicionada ao fluxo de navegação. TypeScript, build Vite e ESLint passaram. Capturas de seis telas (login, painel desktop/celular, lançamentos desktop/celular/escuro) não identificaram erros JavaScript ou rolagem horizontal da página. Cofres anteriores, persistência criptografada, parcelas, pagamento de fatura e sincronização entre contextos continuaram funcionando nos testes com Drive simulado. O Client ID, origem publicada, formato do cofre e banco local foram preservados.

## Validação inicial do motor financeiro

- TypeScript: compilação sem erros.
- ESLint: sem erros ou avisos em src e tests.
- Vitest: 30 testes unitários aprovados em finanças, importação, criptografia e mesclagem.
- Playwright: fluxos de navegação, isolamento da demonstração, responsividade, CRUD, persistência cifrada, senha incorreta, desbloqueio, cartão/fatura e sincronização entre contextos de navegador em desktop e celular. Google/Drive são simulados nos testes de interface.
- Build de produção Vite concluído; assets, manifest, ícones e service worker gerados.
- Smoke test do build de produção: HTTP 200, service worker ativo, recarga com rede desativada e desbloqueio do cofre real de teste preservando o saldo de uma conta. Corrigida a correspondência de cache de assets estáticos com cabeçalhos Vary; o cache é restrito à interface do mesmo origin.
- Teste anônimo do Google real em localhost:5173: janela oficial accounts.google.com apresentou login para PlanilhaFinanceira. Nenhuma senha Google foi digitada; autorização real do Drive não foi realizada pelo agente.
- Prévia da planilha original: 12 registros candidatos apresentados, sem confirmação de importação. Nenhum conteúdo financeiro real foi incluído no código ou nos dados de demonstração.
- Capturas locais de QA em artifacts/overview-desktop.png e artifacts/overview-mobile.png; esses artefatos de teste não são publicados com o código.

A configuração administrativa do OAuth e o consentimento real do proprietário precisam ser confirmados no Google Cloud e no primeiro login. A origem HTTPS precisa ser incluída no cliente OAuth antes do uso do login em produção. Instalação PWA em aparelhos físicos Windows/Android/iOS não foi testada; o modo mobile foi exercitado por emulação no Chrome.
