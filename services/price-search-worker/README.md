# Backend seguro de ofertas · My Horizon+ 3.0

Implementação: Cloudflare Worker + SerpApi Google Shopping (provedor externo, pode ter cobrança/limites de uso). O app não recebe chave de API.

## Ativação real

1. Crie sua conta Cloudflare e habilite Workers; obtenha uma chave SerpApi de sua conta.
2. Neste diretório, execute `npm install` e `npx wrangler login`.
3. Configure `npx wrangler secret put SERPAPI_KEY` e informe a chave.
4. Configure `npx wrangler secret put ALLOWED_ORIGINS`. Informe lista CSV de **origens exatas**, por exemplo `https://app.seudominio.com,tauri://localhost,http://tauri.localhost`; confira a origem exata no WebView Android. Não use `*`.
5. Execute `npm run deploy`. Copie a URL HTTPS do Worker e acrescente `/api/prices/search`.
6. No build do aplicativo, configure `VITE_PRICE_SEARCH_ENDPOINT=https://SEU-WORKER.workers.dev/api/prices/search` e gere APK novo.

Sem essas credenciais e o deploy, a pesquisa automática não está ativa. Não insira SerpApi secrets em `VITE_*`, nem em arquivos enviados ao GitHub.

O Worker aceita `GET /api/prices/search?q=notebook&zip=12345678` e retorna `offers`. Ele só inclui produtos cujo **frete publicado possa ser interpretado numericamente**; resultados sem valor claro de frete são omitidos para evitar falsamente comparar preço + frete como preço final. O CEP é recebido como preferência, mas **não calcula frete específico por CEP**. Estoque é tratado como desconhecido, não afirmado disponível.

Segurança operacional antes de lançar publicamente: instalar limitação de chamadas por IP/usuário, autenticação para proteger cotas de API, alertas de custos, CORS por origem, auditoria de termos do provedor e monitoramento de erros. O cache tem expiração curta. Uma origem de acesso permitida não substitui autenticação. O modelo de comparação não serve para carros (FIPE) nem passagens, que têm mecanismos próprios.

A escolha de preço não faz compra e não modifica dinheiro já depositado. A revisão periódica de preço precisa de um backend autenticado e agendado; este worker é pesquisa sob demanda.
