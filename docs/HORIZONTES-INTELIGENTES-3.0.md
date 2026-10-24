# Pesquisa de preços para todos os Horizontes (3.0)

## Estado de implementação
No criador de Horizontes, selecione **Planejar meu horizonte → Pesquisar na internet**. Carro usa consulta FIPE independente; viagem permite salvar preço informado com URL da fonte; outras categorias que usam orçamento por itens permitem comparação multi-loja. O usuário sempre pode editar os itens.

A busca multi-loja requer um **backend próprio** (proxy) configurado em `VITE_PRICE_SEARCH_ENDPOINT`. Sem esse serviço, o aplicativo **não inventa preços** e permite adicionar uma oferta encontrada manualmente. Isso é proposital.

## Contrato de API
`GET /api/prices/search?q=notebook&zip=18000000`

Resposta JSON:
```json
{
  "offers": [
    {
      "id": "merchant-offer-id",
      "title": "Notebook modelo exato, 16 GB",
      "merchant": "Loja Exemplo",
      "price": 3499.9,
      "shipping": 29.9,
      "url": "https://loja.example/produto",
      "checkedAt": "2026-10-23T12:00:00Z",
      "availability": "available"
    }
  ]
}
```

O servidor deve consultar provedores de ofertas autorizados, deduplicar o mesmo SKU/modelo, distinguir variações de memória/capacidade, validar URLs, preço, moeda BRL, disponibilidade, CEP e frete. Não exponha chaves de APIs no cliente ou em `VITE_*`. A variável `VITE_PRICE_SEARCH_ENDPOINT` contém só a URL pública HTTPS do *backend*, que administra as credenciais no servidor. Use rate limiting, cache de curta duração, proteção contra SSRF, logs sem dados bancários e política de retenção. Retorne resultados de várias lojas apenas quando verificáveis e com data da consulta.

## Melhor preço não é sempre a melhor decisão
Ordenar preço mais frete. Mostrar prazo de entrega, vendedor e garantia quando os provedores fornecerem; não inventar esses campos. Preço de revenda e ofertas com estoque desconhecido não devem ser tratados como equivalentes a uma oferta disponível.

## Atualizações automáticas
`priceUpdatePolicy`: `approval`, `automatic` ou `off`. A implementação atual guarda a preferência e oferece reconsulta sob demanda para veículos. Para atualizações recorrentes de **qualquer** categoria, desenvolver um worker autenticado no backend, programado com consentimento, que registra ofertas candidatas, compara SKU, envia notificação e exige aprovação quando a política é `approval`. Somente atualize a meta após validar o identificador do item e a fonte. Mudanças nunca devem alterar valores já depositados ou disparar pagamentos.

## Viagens
Cotação de passagem deve pesquisar aeroporto de origem/destino e datas, incluir taxas e bagagem informadas pelo fornecedor; deve criar marcos financeiros separados por data de compra, hospedagem e embarque. A integração real depende de provedor de passagens contratado/configurado. Não usar estimativas como cotações confirmadas.

## Testes antes de lançar
- Sem provedor configurado, pesquisa mostra instruções claras e nunca oferta falsa
- Comparação por preço + frete com estoque e SKU corretos
- Preços malformados/URLs HTTP rejeitados
- Atualização mantém histórico, aportes e saldo existentes
- Consentimento e modo manual sempre disponíveis
- Android WebView permite acesso HTTPS ao backend autorizado
