# Banco operacional e sincronização cifrada

O banco Supabase/PostgreSQL passa a transportar e ordenar operações cifradas.
Os dados financeiros são decifrados e mesclados pelo aplicativo. O Google Drive
não participa deste protocolo e pode continuar como destino opcional de backup.
Não é necessária uma chave `service_role` no aplicativo.

## Identidade e formato preservado

`auth.uid()` determina a conta autorizada e é a única origem de `user_id`.
O cliente não envia `user_id` às RPCs. Uma conta Supabase possui um cofre.

O `owner` dentro do envelope é uma identidade **criptográfica**, usada no AAD
`financeiro5:1:<owner>:<vaultId>`. Ele pode continuar sendo o Google sub de um
cofre anterior. Não se troca esse valor para o UUID Supabase apenas editando JSON:
isso impediria a decifragem. O servidor associa o cofre à sessão Supabase e exige
que cada operação mantenha exatamente o header registrado.

O header contém apenas estas seis chaves:

```json
{
  "format": "financeiro5",
  "version": 1,
  "vaultId": "UUID do cofre",
  "owner": "identidade AAD original",
  "password": { "salt": "base64", "iv": "base64", "cipher": "base64", "rounds": 600000 },
  "recovery": { "salt": "base64", "iv": "base64", "cipher": "base64", "rounds": 600000 }
}
```

As senhas e a chave de recuperação em texto puro nunca integram o header.
Cada invólucro cifra a chave de dados; o servidor recebe somente esses
invólucros. Salt de 16 bytes, IV de 12 bytes e invólucro cifrado de 48 bytes
são validados conforme o formato atual. `vaultId` usa a forma UUID canônica
em minúsculas. O formato técnico `financeiro5` permanece para compatibilidade.

## Tabelas e permissões

- `horizon_vaults`: `user_id` como PK, `vault_id` globalmente único, header
  imutável e `created_at`. A FK para `auth.users` é restritiva.
- `horizon_operations`: envelope cifrado imutável em `payload`, UUID estável
  `op_id`, `seq` crescente por usuário, vínculo ao cofre e `created_at` do servidor.
  `op_id` é único dentro da conta; `(user_id, seq)` também é único.
- RLS habilitada e forçada nas duas tabelas. A sessão `authenticated` pode ler
  somente suas linhas. Não possui INSERT, UPDATE, DELETE ou TRUNCATE direto.
- Apenas as duas RPCs públicas recebem EXECUTE para `authenticated`.
  Funções auxiliares ficam em schema privado sem acesso do cliente. As RPCs
  fixam `search_path = ''`, usam nomes qualificados e verificam `auth.uid()` e
  o papel autenticado antes de acessar qualquer linha.
- Triggers impedem UPDATE, DELETE e TRUNCATE acidentais de operações e headers,
  inclusive em acessos privilegiados normais. Administradores do banco ainda
  possuem controle da infraestrutura; não se promete resistência contra quem
  pode alterar o próprio schema.

Não há compactação destrutiva, remoção automática ou rotação de chaves neste
protocolo inicial. A exclusão autenticada de conta que já tem um cofre exige um
processo administrativo futuro de exportação/eliminação com política explícita,
pois os registros não são apagados por cascata.

## Contrato RPC exato

### `horizon_bootstrap()`

Sem argumentos. Requer sessão Supabase válida. Retorna `null` se esta identidade
não tem cofre. Caso contrário:

```ts
{
  vault_id: string;
  header: Header;
  operations: Array<{ op_id: string; seq: number; payload: Envelope }>;
  cursor: number;
  has_more: boolean;
}
```

O lote começa em `seq > 0`, com no máximo 100 operações e o limite de bytes
descrito abaixo. O novo dispositivo decifra os invólucros com a senha-mestra ou
recuperação, decifra os envelopes e reconstrói o documento por UUID/vetores.
Se `has_more`, continua com `horizon_exchange`, enviando `p_operations: []`.
Um header sem operações representa um cofre recém-configurado, sem histórico
cifrado confirmado; não é evidência de dados financeiros antigos.

### `horizon_exchange(p_vault_id, p_header, p_operations, p_cursor, p_limit)`

Os nomes dos parâmetros devem ser enviados exatamente assim:

```ts
{
  p_vault_id: string; // UUID
  p_header: Header;   // sempre o header registrado
  p_operations: Array<{ op_id: string; payload: Envelope }>;
  p_cursor: number;   // último seq contíguo incorporado localmente; começa em 0
  p_limit: number;    // inteiro de 1 a 100
}
```

Resposta:

```ts
{
  header: Header;
  operations: Array<{ op_id: string; seq: number; payload: Envelope }>;
  cursor: number;
  has_more: boolean;
}
```

O primeiro exchange pode criar o cofre. Se já existe, `vault_id` e header devem
ser iguais. Uma segunda criação concorrente não sobrescreve o primeiro cofre.
Cada `payload` tem as mesmas seis propriedades do header, mais `iv` e `cipher`
do documento. Header, owner, formato, versão e invólucros não podem divergir.
O servidor valida a estrutura/base64/tamanhos, mas **não** pode verificar a tag
AES-GCM ou o conteúdo financeiro sem a chave: essa verificação continua no cliente.

O lote é atômico. Repetir `op_id` com o mesmo JSON cifrado é idempotente. Repetir
o identificador com outro conteúdo é uma colisão e rejeita o lote inteiro,
inclusive operações novas que o precedam no mesmo pedido.

### Limites e paginação

| Item | Limite |
| --- | --- |
| Uploads em uma chamada | 20 operações |
| JSON do lote de uploads | 16 MiB |
| Header JSON | 8 KiB |
| Cipher em base64 por operação | 8 MiB, cerca de 6 MiB binários |
| JSON completo de uma operação | 8.400.000 bytes |
| Retorno por página | 100 operações e até 16 MiB de payloads |
| `seq` / cursor | Até 9.007.199.254.740.991, representável exatamente em JS |

Os limites de retorno contam os payloads; a resposta HTTP também contém os
metadados JSON. A página sempre retorna um prefixo ordenado, nunca pula uma
operação para encaixar a seguinte. O cursor avança somente até o último `seq`
retornado, mesmo que o upload tenha acabado de inserir operações mais adiante.
Um cursor acima do prefixo previamente confirmado pelo servidor é rejeitado.
Pode haver limites menores no gateway, plano e hospedagem: precisam ser medidos
antes da publicação. Cofres grandes devem continuar locais/exportáveis quando
um limite for atingido; nunca se deve truncar dados para fazer o upload caber.

### Ordem de commits e concorrência

Cada exchange adquire `pg_advisory_xact_lock(hashtextextended('my-horizon:' ||
auth.uid(), 0))` **antes** de criar o cofre ou atribuir `seq`. O próximo número
é `MAX(seq) + 1` daquela identidade, sob esse mesmo bloqueio. A trava só termina
no commit/rollback da transação. O bootstrap toma a mesma trava.

Assim, um escritor não pode receber `N+1` e confirmar antes do escritor de `N`.
Se `N` for revertido, o próximo commit reutiliza a posição disponível. Não foi
usada uma SEQUENCE global ou identidade SQL cujo avanço seria independente do
commit. Colisões do hash apenas serializam identidades distintas; não misturam
as consultas, que sempre filtram `user_id`.

As RPCs são destinadas às transações curtas normais do PostgREST em READ
COMMITTED. Chamadas em transações longas ou com isolamento mais forte podem
precisar de retry de serialização. O app não deve guardar uma transação aberta
enquanto aguarda interação do usuário.

### Outbox e cursor no cliente

1. Cifrar e persistir a operação local, `op_id` e payload **uma vez** antes de
   tentar o envio. Não gerar um novo IV/payload usando o mesmo identificador.
2. Enviar lotes limitados pela quantidade e pelos bytes.
3. Confirmar o envio no outbox somente após uma resposta RPC bem-sucedida.
   Timeout não é confirmação nem prova de falha do commit: repetir o mesmo item.
4. Validar identidade/header, decifrar e mesclar cada envelope por UUID/vetores,
   preservando tombstones e conflitos; não usar “último timestamp vence”.
5. Persistir documento cifrado e cursor contíguo juntos antes de abandonar o
   lote recebido. Em caso de falha, repetir a página é seguro para a mesclagem.
6. Continuar enquanto `has_more`; não usar o maior `seq` de um upload como cursor.

O servidor não resolve conflitos financeiros dentro do ciphertext e não pode
impedir duas alocações offline concorrentes acima do saldo. O cliente precisa
manter/revisar os conflitos e validar os invariantes financeiros após a mesclagem.

### Erros estáveis

| SQLSTATE | Significado |
| --- | --- |
| `42501` | Ausência de sessão/identidade ou privilégio |
| `HV001` | Argumentos, formato, base64, tamanho ou limite inválido |
| `HV002` | Outro cofre/header já registrado; não sobrescrever |
| `HV003` | Mesmo `op_id` com conteúdo diferente |
| `HV004` | Cursor adiantado em relação ao servidor |
| `55000` | Tentativa de alterar/remover registro imutável |

Valores que não podem ser convertidos para os tipos da assinatura (por exemplo,
`p_vault_id` que não seja UUID) são rejeitados pelo PostgreSQL/PostgREST antes
de entrar na função e podem retornar `22P02`/HTTP 4xx.

## Aplicação e testes

No diretório `my-horizon-independent`, com Supabase CLI e Docker compatível:

```powershell
supabase start
supabase migration up --local
supabase test db
supabase db lint --local
```

Não use `supabase db reset` contra um ambiente com dados que precisam ser
preservados. Os testes SQL usam duas identidades `@example.invalid` e terminam
com `ROLLBACK`; não devem ser executados em produção. IDs de fixture já
existentes interrompem o teste antes de qualquer alteração.

Para o projeto remoto já criado e vinculado, revise as migrations pendentes e
faça backup antes de aplicar:

```powershell
supabase link --project-ref SEU_PROJECT_REF
supabase db push --dry-run
supabase db push
```

`config.toml` contém apenas a configuração local. URLs autorizadas de produção,
confirmação de e-mail e SMTP precisam ser configurados no projeto Supabase.
O PostgreSQL local está configurado como versão 17; ajuste `db.major_version`
para corresponder ao projeto remoto antes de validar migrations com a CLI.
Use URL pública do projeto e chave publicável no frontend; nunca `service_role`,
senha do banco ou segredo JWT. O schema privado não deve ser exposto no Data API.

### Teste PostgreSQL/WASM sem Docker

```powershell
node scripts/test-postgres.mjs
```

Esse script usa PGlite e pgTAP como dependências de desenvolvimento, executa a
mesma migration e o mesmo arquivo SQL com RLS e funções PostgreSQL. Apenas
`auth.users`, `auth.uid()` e `auth.role()` são fixtures em um banco novo em memória.
Não usa usuários reais, credenciais ou serviços externos. Confere também que as
identidades de teste foram revertidas. Não substitui testes de GoTrue/JWT assinado,
PostgREST, latência, limites do projeto remoto ou concorrência entre conexões:
PGlite possui uma única conexão. A suíte SQL verifica retenção da trava na
transação e numeração após rollback; a disputa simultânea precisa de PostgreSQL
com múltiplas sessões antes da publicação operacional.

Referências oficiais: [RLS e auth.uid](https://supabase.com/docs/guides/database/postgres/row-level-security),
[funções e privilégios](https://supabase.com/docs/guides/database/functions),
[testes do banco](https://supabase.com/docs/guides/local-development/testing/overview),
[bloqueios PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html),
[PGlite](https://pglite.dev/docs/) e [pgTAP no PGlite](https://pglite.dev/extensions/).
